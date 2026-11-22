import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { createPackageUploadQueue, detectPackageType } from './lib/package-upload.js'

const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')

// Execute the actual orchestration functions with focused adapters, without rendering JSX.
function appFunction(name, context) {
  const start = app.indexOf(`  async function ${name}(`)
  const end = app.indexOf('\n  }', start) + 4
  return runInNewContext(`(${app.slice(start, end)})`, context)
}

test('the theme picker queues mixed packages and clears its input', async () => {
  const files = []
  for (const [file, header] of [['plugin.php', 'Plugin Name: Example'], ['style.css', 'Theme Name: Example']]) {
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
    await writer.add(`example/${file}`, new TextReader(`/* ${header} */`))
    files.push(new File([await writer.close()], `${file}.zip`))
  }
  const stored = []
  let batches = 0
  const enqueue = createPackageUploadQueue(() => async (batch) => {
    batches += 1
    for (const file of batch) stored.push(await detectPackageType(file))
  }, (error) => { throw error })
  const handler = app.match(/name="theme-zips"[^>]*onChange=\{(\w+)\}/)[1]
  const input = { files, value: 'chosen' }
  await appFunction(handler, { uploadQueueRef: { current: enqueue }, setError() {}, setActiveSavedId() {} })({ target: input })
  assert.equal(batches, 1)
  assert.deepEqual(stored, ['plugin', 'theme'])
  assert.equal(input.value, '')
})

for (const failure of ['checks', 'navigation']) {
  test(`installed plugin stays active when ${failure} fails`, async () => {
    const results = []
    const client = {
      writeFile: async () => { if (failure === 'checks') throw new Error('write failed') },
      goTo: async () => { if (failure === 'navigation') throw new Error('navigation failed') },
    }
    const install = appFunction('installLiveUploads', {
      clientRef: { current: client }, launchIdRef: { current: 1 },
      setLiveUpload() {}, setPluginInstallResults: (update) => results.push(update({})),
      installUploadedPlugin: async () => ({ status: 'active', folder: 'example', message: 'Active in WordPress' }),
      launchedRecipeRef: { current: { plugins: [] } }, selectUploadedPlugin: () => ({ plugins: ['example'] }),
      checksInSetup: () => failure === 'checks' ? [{}] : [], setLaunchedChecks() {}, savedKeyPackages: new Set(),
      CHECKS_PLUGIN_PATH: '/checks.php', CHECKS_PLUGIN: '<?php',
    })
    const failures = await install([{ id: 'example', label: 'Example' }], client, 1)
    assert.equal(results[0].example.status, 'active')
    assert.equal(failures.length, 1)
    assert.match(failures[0], /Installed, but/)
    assert.doesNotMatch(failures[0], /could not be applied/)
  })
}
