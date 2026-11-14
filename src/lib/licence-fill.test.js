import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LICENCE_FILL_CODE,
  licenceFillBody,
  licenceFillSummary,
  packagesWithSavedKeys,
  parseLicenceFillResult,
  pluginFolderFromAssetPath,
} from './licence-fill.js'

test('finds the plugin folder from the installed asset path', () => {
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/plugins/menu-image'), 'menu-image')
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/plugins/wp-security-audit-log/'), 'wp-security-audit-log')
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/plugins/hello.php'), '')
  assert.equal(pluginFolderFromAssetPath('/wordpress/wp-content/themes/x'), '')
  assert.equal(pluginFolderFromAssetPath(undefined), '')
})

test('the request body carries each key by plugin folder and nothing else', () => {
  const body = licenceFillBody([
    { folder: 'menu-image', licenseKey: ' sk_one ' },
    { folder: 'wp-security-audit-log', licenseKey: 'sk_two' },
  ])
  assert.deepEqual(JSON.parse(body), { 'menu-image': 'sk_one', 'wp-security-audit-log': 'sk_two' })
  assert.throws(() => licenceFillBody([{ folder: '../x', licenseKey: 'k' }]), /plugin folder/)
  assert.throws(() => licenceFillBody([{ folder: 'a', licenseKey: '' }]), /licence key/)
})

test('the fill code reads keys from the request body, never from its own text', () => {
  assert.match(LICENCE_FILL_CODE, /php:\/\/input/)
  assert.match(LICENCE_FILL_CODE, /activate_migrated_license/)
  assert.match(LICENCE_FILL_CODE, /has_active_valid_license/)
  assert.match(LICENCE_FILL_CODE, /str_replace\( \$key, '\[key\]'/)
  assert.doesNotMatch(LICENCE_FILL_CODE, /sk_/)
})

test('parses the per-plugin answer after the marker and keeps known statuses only', () => {
  const text = 'Notice: noise\nTECHIES_LICENCE_FILL:{"menu-image":{"status":"rejected","message":"Invalid license key."},"x":{"status":"not-freemius"},"y":{"status":"weird"}}'
  assert.deepEqual(parseLicenceFillResult(text), {
    'menu-image': { status: 'rejected', message: 'Invalid license key.' },
    x: { status: 'not-freemius', message: '' },
    y: { status: 'failed', message: 'WordPress returned an unknown licence status.' },
  })
  assert.throws(() => parseLicenceFillResult('Fatal error'), /did not report/)
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
  assert.equal(licenceFillSummary([]), '')
  assert.equal(licenceFillSummary([{ status: 'activated' }, { status: 'active' }]), '2 of 2 active')
  assert.equal(licenceFillSummary([{ status: 'activated' }, { status: 'rejected' }, { status: 'not-freemius' }]), '1 of 3 active')
})
