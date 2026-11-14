import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LICENSE_FILL_CODE,
  licenseFillBody,
  licenseFillLabel,
  licenseFillSummary,
  packagesWithSavedKeys,
  parseLicenseFillResult,
  pluginFolderFromAssetPath,
} from './license-fill.js'

test('finds the plugin folder from the installed asset path', () => {
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/plugins/menu-image'), 'menu-image')
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/plugins/wp-security-audit-log/'), 'wp-security-audit-log')
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/plugins/hello.php'), '')
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/themes/x'), '')
  assert.equal(pluginFolderFromAssetPath(undefined), '')
})

test('the request body carries each key by plugin folder and nothing else', () => {
  const body = licenseFillBody([
    { folder: 'menu-image', licenseKey: ' sk_one ' },
    { folder: 'wp-security-audit-log', licenseKey: 'sk_two' },
  ])
  assert.deepEqual(JSON.parse(body), { 'menu-image': 'sk_one', 'wp-security-audit-log': 'sk_two' })
  assert.throws(() => licenseFillBody([{ folder: '../x', licenseKey: 'k' }]), /plugin folder/)
  assert.throws(() => licenseFillBody([{ folder: 'a', licenseKey: '' }]), /license key/)
})

test('the fill code reads keys from the request body, never from its own text', () => {
  assert.match(LICENSE_FILL_CODE, /php:\/\/input/)
  assert.match(LICENSE_FILL_CODE, /activate_migrated_license/)
  assert.match(LICENSE_FILL_CODE, /has_active_valid_license/)
  assert.match(LICENSE_FILL_CODE, /str_replace\( \$key, '\[key\]'/)
  assert.match(LICENSE_FILL_CODE, /mb_substr\( \$text, 0, 200 \)/)
  assert.doesNotMatch(LICENSE_FILL_CODE, /sk_/)
})

test('parses the per-plugin answer after the marker and keeps known statuses only', () => {
  const text = 'Notice: noise\nTECHIES_LICENSE_FILL:{"menu-image":{"status":"rejected","message":"Invalid license key."},"x":{"status":"not-freemius"},"y":{"status":"weird"}}'
  assert.deepEqual(parseLicenseFillResult(text), {
    'menu-image': { status: 'rejected', message: 'Invalid license key.' },
    x: { status: 'not-freemius', message: '' },
    y: { status: 'failed', message: 'WordPress returned an unknown license status.' },
  })
  assert.throws(() => parseLicenseFillResult('Fatal error'), /did not report/)
})

test('lists the uploaded packages that have a saved key', () => {
  const saved = packagesWithSavedKeys([
    { id: '1', pluginId: 'plugin:menu-image' },
    { id: '2', pluginId: 'theme:astra-pro' },
    { id: '3', pluginId: 'plugin:menu-image' },
  ])
  assert.deepEqual([...saved].sort(), ['plugin:menu-image', 'theme:astra-pro'])
})

test('summarises how many keys went in', () => {
  assert.equal(licenseFillSummary([]), '')
  assert.equal(licenseFillSummary([{ status: 'activated' }, { status: 'active' }]), '2 of 2 active')
  assert.equal(licenseFillSummary([{ status: 'activated' }, { status: 'rejected' }, { status: 'not-freemius' }]), '1 of 3 active')
})

test('names each fill result in plain words', () => {
  assert.deepEqual(licenseFillLabel({ status: 'active', message: '' }), { tone: 'ok', text: 'Already active in this site' })
  assert.deepEqual(licenseFillLabel({ status: 'activated', message: '' }), { tone: 'ok', text: 'Filled in and active' })
  assert.deepEqual(licenseFillLabel({ status: 'rejected', message: 'Invalid license key.' }), { tone: 'warn', text: 'Filled in. Freemius said: Invalid license key.' })
  assert.deepEqual(licenseFillLabel({ status: 'rejected', message: '' }), { tone: 'warn', text: 'Filled in. Freemius refused the key.' })
  assert.deepEqual(licenseFillLabel({ status: 'not-freemius', message: '' }), { tone: 'muted', text: 'Not filled in: enter it in WordPress' })
  assert.deepEqual(licenseFillLabel({ status: 'failed', message: 'Vault locked.' }), { tone: 'warn', text: 'Not filled in: Vault locked.' })
})

test('fills saved keys through one PHP run and reports every package', async () => {
  const { fillSavedLicenseKeys } = await import('./license-fill.js')
  const packages = [
    { id: 'menu-image', vaultId: 'plugin:menu-image', label: 'Menu Image' },
    { id: 'wsal', vaultId: 'plugin:wsal', label: 'WP Activity Log' },
  ]
  const folders = new Map([['menu-image', 'menu-image'], ['wsal', 'wsal-premium']])
  const runs = []
  const client = { async run(request) {
    runs.push(request)
    return { text: 'TECHIES_LICENSE_FILL:{"menu-image":{"status":"rejected","message":"Invalid license key."}}' }
  } }
  const readKeys = async (key, ids) => new Map(ids.map((id) => [id, { recordId: `record-${id}`, licenseKey: `key-for-${id}` }]))
  const signal = new AbortController().signal

  const results = await fillSavedLicenseKeys({ client, packages, folders, signal, getVaultKey: () => 'vault-key', readKeys })
  assert.equal(runs.length, 1)
  assert.equal(runs[0].method, 'POST')
  assert.deepEqual(JSON.parse(runs[0].body), { 'menu-image': 'key-for-plugin:menu-image', 'wsal-premium': 'key-for-plugin:wsal' })
  assert.deepEqual(results.map((result) => [result.id, result.recordId, result.status, result.message]), [
    ['menu-image', 'record-plugin:menu-image', 'rejected', 'Invalid license key.'],
    ['wsal', 'record-plugin:wsal', 'failed', 'WordPress did not report this plugin.'],
  ])

  const locked = await fillSavedLicenseKeys({ client, packages, folders, signal, getVaultKey: () => null, readKeys })
  assert.deepEqual(locked.map((result) => result.message), ['The license vault is locked.', 'The license vault is locked.'])

  runs.length = 0
  const noFolders = await fillSavedLicenseKeys({ client, packages, folders: new Map(), signal, getVaultKey: () => 'k', readKeys })
  assert.equal(runs.length, 0)
  assert.equal(noFolders[0].message, 'The plugin folder could not be found.')

  const failing = { async run() { throw new Error('x'.repeat(500)) } }
  const failed = await fillSavedLicenseKeys({ client: failing, packages, folders, signal, getVaultKey: () => 'k', readKeys })
  assert.equal(failed[0].status, 'failed')
  assert.equal(failed[0].message.length, 200)

  const aborted = new AbortController()
  aborted.abort()
  const abortingRead = async (key, ids, abortSignal) => { abortSignal.throwIfAborted(); return new Map() }
  await assert.rejects(fillSavedLicenseKeys({ client, packages, folders, signal: aborted.signal, getVaultKey: () => 'k', readKeys: abortingRead }), { name: 'AbortError' })
})

test('a vault locked while keys are read sends no key to WordPress', async () => {
  const { fillSavedLicenseKeys } = await import('./license-fill.js')
  let vaultKey = 'vault-key'
  const runs = []
  const client = { async run(request) { runs.push(request); return { text: 'TECHIES_LICENSE_FILL:{}' } } }
  const readKeys = async (key, ids) => {
    vaultKey = null
    return new Map(ids.map((id) => [id, { recordId: 'r', licenseKey: 'secret' }]))
  }
  const results = await fillSavedLicenseKeys({
    client,
    packages: [{ id: 'menu-image', vaultId: 'plugin:menu-image', label: 'Menu Image' }],
    folders: new Map([['menu-image', 'menu-image']]),
    signal: new AbortController().signal,
    getVaultKey: () => vaultKey,
    readKeys,
  })
  assert.equal(runs.length, 0)
  assert.deepEqual(results.map((result) => [result.status, result.message]), [['failed', 'The license vault was locked.']])
})

test('closing the Playground ends a fill whose PHP run never answers', async () => {
  const { fillSavedLicenseKeys } = await import('./license-fill.js')
  const controller = new AbortController()
  const pending = fillSavedLicenseKeys({
    client: { run: () => new Promise(() => {}) },
    packages: [{ id: 'menu-image', vaultId: 'plugin:menu-image', label: 'Menu Image' }],
    folders: new Map([['menu-image', 'menu-image']]),
    signal: controller.signal,
    getVaultKey: () => 'k',
    readKeys: async (key, ids) => new Map(ids.map((id) => [id, { recordId: 'r', licenseKey: 'secret' }])),
  })
  setImmediate(() => controller.abort())
  await assert.rejects(pending, { name: 'AbortError' })
})
