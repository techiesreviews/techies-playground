import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildHeaders,
  isKept,
  isLauncherFrame,
  parseArguments,
  preparePlaygroundHost,
  removeCachedWebsitePages,
  withLauncherGuard,
} from './prepare-playground-host.mjs'

const offered = new Set(['7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])

test('keeps the runtime, offered PHP builds and offered WordPress builds', () => {
  for (const file of [
    'remote.html',
    'wordpress-bridge.html',
    'wordpress-popup.html',
    'sw.js',
    'client/index.js',
    'assets/php_8_3-BNI3Jl72.wasm',
    'assets/php_7_4-Ab12Cd34.js',
    'assets/wp-7.1.tar-DIqobjh1.zst',
    'wp-6.3/wp-includes/css/dashicons.min.css',
    'wp-7.1/readme.html',
    'wp-7.1/wordpress-static.zip',
    'wp-cli.phar',
    // Beta stays selectable: its archive, static ZIP, asset list, and the minified
    // CSS, JavaScript and fonts its first page needs.
    'assets/wp-beta.tar-CqF4p5bg.zst',
    'wp-beta/wordpress-static.zip',
    'wp-beta/wordpress-remote-asset-paths',
    'wp-beta/wp-includes/css/dashicons.min.css',
    'wp-beta/wp-includes/js/jquery/jquery.min.js',
    'wp-beta/wp-includes/fonts/dashicons.woff2',
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
    'assets/sqlite-database-integration-v3.0.0-rc.3-php52-gDghoRWW.zip',
    // The rest of beta's unpacked tree would pass the 20,000-file limit; Playground
    // backfills it from wordpress-static.zip after the first page.
    'wp-beta/wp-includes/css/buttons.css',
    'wp-beta/wp-includes/images/w-logo-blue.png',
    // Nightly comes as a full download, and Playground looks for /wp-trunk/, not here.
    'assets/wp-nightly.tar-AbCd1234.zst',
    'assets/wp-trunk.tar-AbCd1234.zst',
    'wp-nightly/wordpress-static.zip',
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
  const offlineAssets = new Set(['/demos/blueprints.phar', '/assets/wp-trunk.tar-AbCd1234.zst'])
  assert.equal(isKept('demos/blueprints.phar', { phpVersions: offered, offlineAssets }), true)
  assert.equal(isKept('assets/wp-trunk.tar-AbCd1234.zst', { phpVersions: offered, offlineAssets }), true)
})

test('drops the public Playground website pages, even when the offline list names them', () => {
  // The host origin holds saved sites and filled licence keys; a website page such as
  // index.html?blueprint-url=… would run anyone's setup there. The launcher only needs
  // remote.html and the two pages it opens.
  const pages = [
    'index.html',
    'api.html',
    'wordpress.html',
    'gutenberg.html',
    'php-playground.html',
    'php-code-snippet-demo.html',
    'php-code-snippet-e2e.html',
    'builder/builder.html',
    'demos/index.html',
    'wp-cli.html',
  ]
  const offlineAssets = new Set(pages.map((page) => `/${page}`))
  for (const page of pages) {
    assert.equal(isKept(page, { phpVersions: offered, offlineAssets }), false, page)
  }
})

function fakeCacheStorage(entries) {
  const stores = new Map(Object.entries(entries).map(([name, urls]) => [name, new Set(urls)]))
  return {
    stores,
    keys: async () => [...stores.keys()],
    open: async (name) => ({
      keys: async () => [...stores.get(name)].map((url) => new Request(url)),
      delete: async (request) => stores.get(name).delete(request.url),
    }),
  }
}

test('removes website pages a browser cached before they left the host, and nothing else', async () => {
  // Playground's service worker answers a cached page without asking the server, ignoring
  // the query string, until the next Playground release.
  const storage = fakeCacheStorage({
    'playground-cache-abc': [
      'https://wp.techies.tools/index.html',
      'https://wp.techies.tools/index.html?blueprint-url=https://evil.test/b.json',
      'https://wp.techies.tools/builder/builder.html',
      'https://wp.techies.tools/remote.html',
      'https://wp.techies.tools/wordpress-popup.html',
      'https://wp.techies.tools/wp-7.1/readme.html',
      'https://wp.techies.tools/assets/remote-AAAA.js',
      'https://wp.techies.tools/wp-7.1/wordpress-static.zip',
    ],
    'site-data': ['https://wp.techies.tools/index.html'],
  })
  await removeCachedWebsitePages(storage, ['/remote.html', '/wordpress-bridge.html', '/wordpress-popup.html'])
  assert.deepEqual([...storage.stores.get('playground-cache-abc')], [
    'https://wp.techies.tools/remote.html',
    'https://wp.techies.tools/wordpress-popup.html',
    'https://wp.techies.tools/wp-7.1/readme.html',
    'https://wp.techies.tools/assets/remote-AAAA.js',
    'https://wp.techies.tools/wp-7.1/wordpress-static.zip',
  ])
  assert.deepEqual([...storage.stores.get('site-data')], ['https://wp.techies.tools/index.html'])
  assert.deepEqual(await removeCachedWebsitePages(undefined, []), [])
})

function fakeWindow(parent) {
  const view = { stopped: false, stop() { this.stopped = true } }
  view.parent = parent === 'self' ? view : parent
  return view
}

const crossOriginParent = { location: { get href() { throw new Error('SecurityError: cross-origin frame') } } }
const sameOriginParent = { location: { href: 'https://wp.techies.tools/index.html?blueprint-url=https://evil.test/b.json' } }

test('the cache cleanup and the host build agree on which pages are website pages', async () => {
  const keptPages = ['/remote.html', '/wordpress-bridge.html', '/wordpress-popup.html']
  const paths = [
    'index.html', 'INDEX.HTML', 'api.html', 'builder/builder.html', 'wp-start.html', 'wp-foo/a.html',
    'remote.html', 'wordpress-bridge.html', 'wordpress-popup.html',
    // wp-beta and wp-nightly are trimmed for other reasons, so only release folders the build keeps.
    'wp-7.1/readme.html', 'wp-trunk/readme.html', 'wp-7.1/wp-includes/empty.html',
  ]
  const storage = fakeCacheStorage({ 'playground-cache-abc': paths.map((file) => `https://wp.techies.tools/${file}`) })
  const removed = new Set(await removeCachedWebsitePages(storage, keptPages))
  for (const file of paths) {
    const keptByBuild = isKept(file, { phpVersions: offered, offlineAssets: new Set() })
    assert.equal(removed.has(`/${file}`), !keptByBuild, file)
  }
})

test('Playground starts only inside a launcher frame on another origin', () => {
  assert.equal(isLauncherFrame(fakeWindow(crossOriginParent)), true)
  // remote.html opened as its own window, where the site that opened it could message it.
  assert.equal(isLauncherFrame(fakeWindow('self')), false)
  // A page of the host origin, such as the old website still in a browser's cache.
  assert.equal(isLauncherFrame(fakeWindow(sameOriginParent)), false)
})

function runGuard(html, view) {
  const script = html.match(/<head><script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'an inline script opens the head')
  const document = { emptied: false, documentElement: { replaceChildren() { document.emptied = true } } }
  const storage = fakeCacheStorage({ 'playground-cache-abc': ['https://wp.techies.tools/index.html', 'https://wp.techies.tools/remote.html'] })
  new Function('window', 'document', 'self', script)(view, document, { caches: storage })
  return { document, storage }
}

test('remote.html refuses to start outside a launcher frame and cleans the cache, before its own scripts', async () => {
  const html = '<!doctype html><html><head><title>x</title><script type="module" src="/assets/remote.js"></script></head><body></body></html>'
  const guarded = withLauncherGuard(html)
  assert.ok(guarded.endsWith('<title>x</title><script type="module" src="/assets/remote.js"></script></head><body></body></html>'))

  for (const parent of ['self', sameOriginParent]) {
    const view = fakeWindow(parent)
    const { document } = runGuard(guarded, view)
    assert.equal(view.stopped, true)
    assert.equal(document.emptied, true)
  }

  const launcher = fakeWindow(crossOriginParent)
  const { document, storage } = runGuard(guarded, launcher)
  assert.equal(launcher.stopped, false)
  assert.equal(document.emptied, false)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual([...storage.stores.get('playground-cache-abc')], ['https://wp.techies.tools/remote.html'])

  assert.throws(() => withLauncherGuard('<html><body></body></html>'), /remote\.html/)
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
    'remote.html': '<html><head></head></html>',
    'remote.html.map': '{}',
    'index.html': '<html>website</html>',
    'builder/builder.html': '<html>builder</html>',
    'assets/php_8_3-AAAAAAAA.wasm': 'php83',
    'assets/php_5_2-BBBBBBBB.wasm': 'php52',
    'wp-7.1/wordpress-static.zip': 'x'.repeat(25),
    'wp-7.1/wp-includes/a.css': 'a',
    'wp-beta/wordpress-static.zip': 'beta',
    'wp-beta/wp-includes/b.css': 'b',
    'wp-beta/wp-includes/b.min.css': 'b',
    'assets-required-for-offline-mode.json': JSON.stringify(['/index.html']),
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
    'wp-beta/wordpress-static.zip',
    'wp-beta/wp-includes/b.min.css',
  ])
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'split-files.json'), 'utf8')), {
    '/wp-7.1/wordpress-static.zip': {
      size: 25,
      parts: ['/wp-7.1/wordpress-static.zip.part0', '/wp-7.1/wordpress-static.zip.part1', '/wp-7.1/wordpress-static.zip.part2'],
    },
  })
  assert.match(await readFile(path.join(out, 'remote.html'), 'utf8'), /^<html><head><script>[\s\S]*isLauncherFrame[\s\S]*removeCachedWebsitePages[\s\S]*<\/script><\/head><\/html>$/)
  const joined = await Promise.all([0, 1, 2].map((index) => readFile(path.join(out, `wp-7.1/wordpress-static.zip.part${index}`), 'utf8')))
  assert.equal(joined.join(''), 'x'.repeat(25))
  const headers = await readFile(path.join(out, '_headers'), 'utf8')
  assert.match(headers, /\n\/wp-7\.1\/\*\n/)
  assert.match(headers, /\n\/wp-beta\/\*\n/)
  assert.equal(result.fileCount, 11)
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
