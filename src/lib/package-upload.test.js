import test from 'node:test'
import assert from 'node:assert/strict'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { detectPackageType, registerPackageDrop } from './package-upload.js'

async function archive(entries, name = 'package.zip') {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
  for (const [path, content] of Object.entries(entries)) await writer.add(path, new TextReader(content))
  return new File([await writer.close()], name)
}

test('detects plugins and classic/block themes from headers, regardless of ZIP filename', async () => {
  assert.equal(await detectPackageType(await archive({ 'thing/main.php': '<?php\n/* Plugin Name: Example */' }, 'theme.zip')), 'plugin')
  assert.equal(await detectPackageType(await archive({ 'thing/style.css': '/*\nTheme Name: Example\n*/', 'thing/theme.json': '{}' })), 'theme')
  assert.equal(await detectPackageType(await archive({ 'style.css': '/* Theme Name: Flat theme */' })), 'theme')
})

test('rejects invalid, unrelated, nested and ambiguous archives', async () => {
  await assert.rejects(detectPackageType(new File(['no'], 'bad.zip')), /signature/)
  for (const entries of [
    { 'readme.txt': 'hello' },
    { 'bundle/plugin/main.php': '<?php\n/* Plugin Name: Nested */' },
    { 'plugin/main.php': '<?php\n/* Plugin Name: Example */', 'theme/style.css': '/* Theme Name: Example */' },
    { '__MACOSX/main.php': '/* Plugin Name: Metadata */' },
  ]) await assert.rejects(detectPackageType(await archive(entries)), /one installable/)
})

test('global drops preserve file batches, ignore text and clean up listeners', () => {
  const target = new EventTarget()
  const active = []
  const batches = []
  const cleanup = registerPackageDrop(target, { onActive: (value) => active.push(value), onFiles: (files) => batches.push(files) })
  function fire(type, files = [], types = ['Files'], relatedTarget = target) {
    const event = new Event(type, { cancelable: true })
    Object.assign(event, { dataTransfer: { files, types }, relatedTarget })
    target.dispatchEvent(event)
    return event
  }
  assert.equal(fire('dragover', [], ['text/plain']).defaultPrevented, false)
  fire('dragenter')
  fire('dragenter')
  fire('dragleave')
  assert.equal(active.at(-1), true)
  const files = Array.from({ length: 150 }, (_, index) => new File(['zip'], `${index}.zip`))
  assert.equal(fire('drop', files).defaultPrevented, true)
  assert.deepEqual(batches, [files])
  assert.equal(active.at(-1), false)
  fire('dragenter')
  fire('dragleave', [], ['Files'], null)
  assert.equal(active.at(-1), false)
  cleanup()
  assert.equal(fire('drop', files).defaultPrevented, false)
  assert.equal(batches.length, 1)
})
