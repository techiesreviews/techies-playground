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
import * as licenseFill from './license-fill.js'
import { checksGate } from './checks.js'

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

test('reads the Freemius licence status after the marker and keeps valid folder names only', () => {
  const { parseFreemiusLicenses } = licenseFill
  assert.deepEqual(
    parseFreemiusLicenses('notice\nTECHIES_FREEMIUS_LICENSES:{"unlicensed":["wsal-premium","../x","",7],"licensed":["menu-image",".."]}\n'),
    { unlicensed: ['wsal-premium'], licensed: ['menu-image'] },
  )
  assert.deepEqual(parseFreemiusLicenses('TECHIES_FREEMIUS_LICENSES:{}'), { unlicensed: [], licensed: [] })
  assert.throws(() => parseFreemiusLicenses('no marker'), /did not report/)
})

test('the checks wait for saved-key plugins and for premium plugins without a licence', () => {
  const { licensesNeeded } = licenseFill
  const folders = new Map([['wsal', 'wsal-premium'], ['menu-image', 'menu-image'], ['free', 'free-plugin']])
  const status = (unlicensed) => ({ unlicensed, licensed: [] })
  assert.deepEqual(licensesNeeded(['menu-image'], status(['wsal-premium']), folders), ['menu-image', 'wsal'])
  assert.deepEqual(licensesNeeded(['wsal'], status(['wsal-premium']), folders), ['wsal'])
  assert.deepEqual(licensesNeeded([], status([]), folders), [])
  assert.deepEqual(licensesNeeded([], status(['not-launched']), folders), [])
  // Unknown status: every uploaded plugin waits, so the checks never start unconfirmed.
  assert.deepEqual(licensesNeeded(['menu-image'], null, folders), ['menu-image', 'wsal', 'free'])
})

test('a licence WordPress reports as active counts even without a fill result', () => {
  const { activeInSite } = licenseFill
  const folders = new Map([['wsal', 'wsal-premium'], ['menu-image', 'menu-image']])
  assert.deepEqual(activeInSite({ unlicensed: [], licensed: ['menu-image', 'not-launched'] }, folders), ['menu-image'])
  assert.deepEqual(activeInSite(null, folders), [])
})

test('Start without keys: a licence the site reports as active opens the checks, an unknown status keeps them waiting', () => {
  const { licensesNeeded, activeInSite } = licenseFill
  const folders = new Map([['wsal', 'wsal-premium']])
  // The key fill was skipped, so there are no fill results. The licensed list includes a
  // licence that has expired but still unlocks the premium features (Lex, 2026-11-21).
  const licensed = { unlicensed: [], licensed: ['wsal-premium'] }
  assert.deepEqual(checksGate(licensesNeeded(['wsal'], licensed, folders), [], activeInSite(licensed, folders)), { ready: true, active: 1, total: 1 })
  assert.deepEqual(checksGate(licensesNeeded(['wsal'], null, folders), [], activeInSite(null, folders)), { ready: false, active: 0, total: 1 })
})

test('reads the Freemius licence status through one PHP run, and reports unknown when that run fails', async () => {
  const { readFreemiusLicenses, FREEMIUS_LICENSES_CODE } = licenseFill
  const runs = []
  const client = { async run(request) { runs.push(request); return { text: 'TECHIES_FREEMIUS_LICENSES:{"unlicensed":["wsal-premium"],"licensed":[]}' } } }
  const signal = new AbortController().signal
  assert.deepEqual(await readFreemiusLicenses({ client, signal }), { unlicensed: ['wsal-premium'], licensed: [] })
  assert.deepEqual(runs, [{ code: FREEMIUS_LICENSES_CODE }])
  assert.equal(await readFreemiusLicenses({ client: { async run() { throw new Error('PHP crashed') } }, signal }), null)
  assert.equal(await readFreemiusLicenses({ client: { async run() { return { text: 'Fatal error' } } }, signal }), null)
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(readFreemiusLicenses({ client: { run: () => new Promise(() => {}) }, signal: aborted.signal }), { name: 'AbortError' })
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

test('a failure after the keys were read still names the record of each key', async () => {
  const { fillSavedLicenseKeys } = await import('./license-fill.js')
  const results = await fillSavedLicenseKeys({
    client: { async run() { throw new Error('boom') } },
    packages: [{ id: 'menu-image', vaultId: 'plugin:menu-image', label: 'Menu Image' }],
    folders: new Map([['menu-image', 'menu-image']]),
    signal: new AbortController().signal,
    getVaultKey: () => 'k',
    readKeys: async (key, ids) => new Map(ids.map((id) => [id, { recordId: 'record-1', licenseKey: 'secret' }])),
  })
  assert.deepEqual(results.map((result) => [result.recordId, result.status, result.message]), [['record-1', 'failed', 'boom']])
})

test('the fill result shows on the record whose key was used, else on the newest record', async () => {
  const { fillResultRecordId } = await import('./license-fill.js')
  const records = [
    { id: 'new', pluginId: 'plugin:menu-image' },
    { id: 'old', pluginId: 'plugin:menu-image' },
    { id: 'other', pluginId: 'plugin:other' },
  ]
  assert.equal(fillResultRecordId({ recordId: 'old' }, 'plugin:menu-image', records), 'old')
  assert.equal(fillResultRecordId({ recordId: 'deleted' }, 'plugin:menu-image', records), 'deleted')
  assert.equal(fillResultRecordId({ recordId: '' }, 'plugin:menu-image', records), 'new')
  assert.equal(fillResultRecordId(undefined, 'plugin:menu-image', records), '')
})
