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
