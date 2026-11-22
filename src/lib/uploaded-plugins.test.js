import assert from 'node:assert/strict'
import test from 'node:test'
import { installUploadedPlugin } from './uploaded-plugins.js'

const plugin = { id: 'paid-plugin', filename: 'paid-plugin.zip', file: new Blob(['fake zip']), label: 'Paid plugin' }

test('uploaded ZIP installs then activates and verifies WordPress state', async () => {
  const calls = []
  const client = {
    async writeFile(path) { calls.push(['notice', path]) },
    async run({ code }) {
      calls.push(['run', code])
      return { text: code.includes('TECHIES_PLUGIN_STATUS:') ? 'TECHIES_PLUGIN_STATUS:active' : '' }
    },
  }
  const result = await installUploadedPlugin(client, plugin, {
    install: async (_client, options) => {
      calls.push(['install', options])
      return { assetPath: '/wordpress/wp-content/plugins/paid-plugin' }
    },
  })
  assert.equal(result.status, 'active')
  assert.equal(result.folder, 'paid-plugin')
  const install = calls.find((call) => call[0] === 'install')[1]
  assert.equal(install.options.activate, false)
  assert.equal(install.ifAlreadyInstalled, 'overwrite')
  assert.ok(calls.some((call) => call[0] === 'run' && call[1].includes('activate_plugin(')))
})

test('failed activation preserves installed plugin and shows safe inline state', async () => {
  const result = await installUploadedPlugin({
    async writeFile() {},
    async run({ code }) {
      if (code.includes('TECHIES_PLUGIN_STATUS:')) return { text: 'noise\nTECHIES_PLUGIN_STATUS:inactive' }
      throw new Error('Vendor output containing sk_fake_secret')
    },
  }, plugin, { install: async () => ({ assetPath: '/wordpress/wp-content/plugins/paid-plugin' }) })
  assert.equal(result.status, 'inactive')
  assert.match(result.message, /Installed, but activation failed/)
  assert.doesNotMatch(JSON.stringify(result), /sk_fake_secret/)
})

test('stale upload never activates a replacement site', async () => {
  let current = true
  const result = await installUploadedPlugin({ async writeFile() {}, async run() { assert.fail('stale upload ran PHP') } }, plugin, {
    isCurrent: () => current,
    install: async () => { current = false; return { assetPath: '/wordpress/wp-content/plugins/paid-plugin' } },
  })
  assert.equal(result.status, 'cancelled')
})

test('a live free plugin without a saved key does not block checks; unknown premium state does', async () => {
  const { uploadedPluginLicenses } = await import('./uploaded-plugins.js')
  const folders = new Map([['free-plugin', 'free-plugin']])
  assert.deepEqual(uploadedPluginLicenses('free-plugin', new Set(), { licensed: [], unlicensed: [] }, folders), { needed: [], active: [] })
  assert.deepEqual(uploadedPluginLicenses('free-plugin', new Set(), null, folders), { needed: ['free-plugin'], active: [] })
})
