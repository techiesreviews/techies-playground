import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildHeaders,
  isKept,
  parseArguments,
  preparePlaygroundHost,
} from './prepare-playground-host.mjs'

const offered = new Set(['7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])

test('keeps the runtime, offered PHP builds and offered WordPress builds', () => {
  for (const file of [
    'remote.html',
    'sw.js',
    'index.html',
    'assets/php_8_3-BNI3Jl72.wasm',
    'assets/php_7_4-Ab12Cd34.js',
    'assets/wp-7.1.tar-DIqobjh1.zst',
    'wp-6.3/wp-includes/css/dashicons.min.css',
    'wp-7.1/wordpress-static.zip',
    'wp-cli.phar',
  ]) {
    assert.equal(isKept(file, { phpVersions: offered, offlineAssets: new Set() }), true, file)
  }
})

test('drops source maps, unoffered PHP and WordPress builds, demos, test fixtures and PHP endpoints', () => {
  for (const file of [
    'sw.js.map',
    'assets/index-B1tm9G29.js.map',
    'assets/php_5_2-Xy12Zz34.wasm',
    'assets/php_5_2-Xy12Zz34.js',
    'assets/wp-beta.tar-CqF4p5bg.zst',
    'assets/sqlite-database-integration-v3.0.0-rc.3-php52-gDghoRWW.zip',
    'wp-beta/wordpress-static.zip',
    'wp-nightly/wp-includes/version.php',
    'test-fixtures/plugin.zip',
    'demos/index.html',
    'php-next/php_8_6.wasm',
    'php-8-6.html',
    'plugin-proxy.php',
    'builder/index.php',
    '.htaccess',
  ]) {
    assert.equal(isKept(file, { phpVersions: offered, offlineAssets: new Set() }), false, file)
  }
})

test('never drops a file the Playground service worker caches for offline use', () => {
  const offlineAssets = new Set(['/demos/index.html'])
  assert.equal(isKept('demos/index.html', { phpVersions: offered, offlineAssets }), true)
})

test('headers allow framing only by the launcher and cache hashed assets for a year', () => {
  const headers = buildHeaders({
    launcherOrigins: ['https://play.techies.tools'],
    wordpressDirectories: ['wp-6.9', 'wp-7.1'],
  })
  assert.match(headers, /^\/\*\n {2}Content-Security-Policy: frame-ancestors 'self' https:\/\/play\.techies\.tools\n/)
  assert.match(headers, /\n\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable\n/)
  assert.match(headers, /\n\/client\/\*\n {2}Access-Control-Allow-Origin: \*\n/)
  assert.match(headers, /\n\/wp-6\.9\/\*\n {2}Cache-Control: public, max-age=3600\n/)
  assert.match(headers, /\n\/wp-7\.1\/\*\n {2}Cache-Control: public, max-age=3600\n/)
  assert.doesNotMatch(headers, /Cross-Origin-(Opener|Embedder)-Policy/)
})

test('rejects launcher origins that are not plain HTTPS origins, except local development', () => {
  assert.throws(() => buildHeaders({ launcherOrigins: ['http://play.techies.tools'], wordpressDirectories: [] }), /launcher origin/)
  assert.throws(() => buildHeaders({ launcherOrigins: ['https://play.techies.tools/path'], wordpressDirectories: [] }), /launcher origin/)
  assert.throws(() => buildHeaders({ launcherOrigins: [], wordpressDirectories: [] }), /launcher origin/)
  assert.match(buildHeaders({ launcherOrigins: ['http://127.0.0.1:4173'], wordpressDirectories: [] }), /frame-ancestors 'self' http:\/\/127\.0\.0\.1:4173/)
})

test('reads the source, output and launcher origins from the command line', () => {
  assert.deepEqual(parseArguments(['build', 'out', '--launcher-origin', 'https://a.test', '--launcher-origin', 'https://b.test']), {
    source: 'build',
    out: 'out',
    launcherOrigins: ['https://a.test', 'https://b.test'],
  })
  assert.throws(() => parseArguments(['build']), /Usage/)
  assert.throws(() => parseArguments(['build', 'out', '--launcher-origin']), /Usage/)
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'playground-host-'))
  const source = path.join(root, 'source')
  const files = {
    'remote.html': '<html></html>',
    'remote.html.map': '{}',
    'assets/php_8_3-AAAAAAAA.wasm': 'php83',
    'assets/php_5_2-BBBBBBBB.wasm': 'php52',
    'wp-7.1/wordpress-static.zip': 'x'.repeat(25),
    'wp-7.1/wp-includes/a.css': 'a',
    'wp-beta/wordpress-static.zip': 'beta',
    'assets-required-for-offline-mode.json': JSON.stringify(['/remote.html']),
  }
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true })
    await writeFile(path.join(source, name), content)
  }
  return { root, source, out: path.join(root, 'out') }
}

async function listFiles(directory, prefix = '') {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...await listFiles(path.join(directory, entry.name), relative))
    else found.push(relative)
  }
  return found.sort()
}

test('prepares a trimmed host folder and splits files above the per-file limit', async (t) => {
  const { root, source, out } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))

  const result = await preparePlaygroundHost({
    source,
    out,
    launcherOrigins: ['https://play.techies.tools'],
    phpVersions: offered,
    fileSizeLimit: 20,
    partSize: 10,
  })

  assert.deepEqual(await listFiles(out), [
    '_headers',
    'assets-required-for-offline-mode.json',
    'assets/php_8_3-AAAAAAAA.wasm',
    'remote.html',
    'split-files.json',
    'wp-7.1/wordpress-static.zip.part0',
    'wp-7.1/wordpress-static.zip.part1',
    'wp-7.1/wordpress-static.zip.part2',
    'wp-7.1/wp-includes/a.css',
  ])
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'split-files.json'), 'utf8')), {
    '/wp-7.1/wordpress-static.zip': {
      size: 25,
      parts: ['/wp-7.1/wordpress-static.zip.part0', '/wp-7.1/wordpress-static.zip.part1', '/wp-7.1/wordpress-static.zip.part2'],
    },
  })
  const joined = await Promise.all([0, 1, 2].map((index) => readFile(path.join(out, `wp-7.1/wordpress-static.zip.part${index}`), 'utf8')))
  assert.equal(joined.join(''), 'x'.repeat(25))
  assert.match(await readFile(path.join(out, '_headers'), 'utf8'), /\n\/wp-7\.1\/\*\n/)
  assert.equal(result.fileCount, 9)
  assert.deepEqual(result.split, ['/wp-7.1/wordpress-static.zip'])
})

test('refuses a host folder with more files than Cloudflare allows', async (t) => {
  const { root, source, out } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await assert.rejects(preparePlaygroundHost({
    source,
    out,
    launcherOrigins: ['https://play.techies.tools'],
    phpVersions: offered,
    fileLimit: 3,
  }), /more than 3 files/)
})

test('refuses to write into a folder that already has files', async (t) => {
  const { root, source, out } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(out, { recursive: true })
  await writeFile(path.join(out, 'stale.txt'), 'old')
  await assert.rejects(preparePlaygroundHost({ source, out, launcherOrigins: ['https://play.techies.tools'], phpVersions: offered }), /not empty/)
})
