#!/usr/bin/env node
// Turns WordPress Playground's built website (dist/packages/playground/wasm-wordpress-net
// from `npm run build:website` in WordPress/wordpress-playground) into the folder the
// playground-host Worker serves: drops what the launcher never uses, splits files above
// Cloudflare's per-file limit, and writes the `_headers` file for the static assets.
import { copyFile, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHP_VERSIONS } from '../src/lib/recipe.js'

// Cloudflare Workers static assets: 25 MiB per file, 20,000 files per version (Free plan).
export const FILE_SIZE_LIMIT = 25 * 1024 * 1024
export const FILE_LIMIT = 20_000
export const PART_SIZE = 20 * 1024 * 1024
export const SPLIT_MANIFEST = 'split-files.json'

const DROPPED_DIRECTORIES = new Set(['test-fixtures', 'demos', 'php-next', 'wp-nightly'])
// The launcher offers beta, but its whole unpacked tree (about 3,900 files) would pass
// the file limit. Its archive, static ZIP and asset list stay, with the minified CSS,
// JavaScript and fonts the first page loads; Playground backfills the rest from
// wordpress-static.zip after that page. Nightly is a full download from GitHub and
// Playground looks for /wp-trunk/, so wp-nightly is never used.
const BETA_DIRECTORY = 'wp-beta'
const BETA_TOP_FILES = new Set(['wordpress-static.zip', 'wordpress-remote-asset-paths'])
const BETA_FIRST_PAGE_FILE = /\.(min\.css|min\.js|woff2?|ttf|eot)$/
const DROPPED_FILES = new Set(['.htaccess'])
// The host origin keeps saved sites and filled licence keys, so it serves no page that
// starts a Playground from its URL (index.html?blueprint-url=…, the builder, demos).
// The launcher frames remote.html, which opens the other two pages. WordPress's own
// static pages (readme.html, wp-includes/empty.html) stay with their release.
const LAUNCHER_PAGES = new Set(['remote.html', 'wordpress-bridge.html', 'wordpress-popup.html'])
const WORDPRESS_DIRECTORY = /^wp-(\d+\.\d+|beta|nightly|trunk)$/

export function isKept(relativePath, { phpVersions = PHP_VERSIONS, offlineAssets = new Set() } = {}) {
  const segments = relativePath.split('/')
  const name = segments.at(-1)
  // Checked before the offline list, which names the website pages too. Playground only
  // prefetches that list when the launcher's site runs on the host origin, and the
  // prefetch already fails on "/", which this host never served.
  if (/\.html?$/i.test(name) && !LAUNCHER_PAGES.has(relativePath) && !WORDPRESS_DIRECTORY.test(segments[0])) return false
  if (offlineAssets.has(`/${relativePath}`)) return true
  if (DROPPED_DIRECTORIES.has(segments[0]) || DROPPED_FILES.has(relativePath)) return false
  if (segments[0] === BETA_DIRECTORY) return segments.length === 2 ? BETA_TOP_FILES.has(name) : BETA_FIRST_PAGE_FILE.test(name)
  if (name.endsWith('.map') || name.endsWith('.php')) return false
  // Nightly and trunk download from a remote URL, so bundled archives of them are unused.
  if (/^wp-(nightly|trunk)\.tar-/.test(name)) return false
  if (/-php52-/.test(name)) return false
  const php = name.match(/^php_(\d+)_(\d+)-/)
  if (php && !phpVersions.has(`${php[1]}.${php[2]}`)) return false
  return true
}

// remote.html starts with an inline script that runs before Playground's own scripts.
//
// Playground starts only inside a launcher's frame. The host's frame rules let only the
// launchers and this origin frame remote.html, and every launcher is on another origin.
// So remote.html opened as its own window (any site that opened it could message it) or
// framed by a page of this origin (such as a copy of the old public website still in a
// browser's cache) stops loading before Playground's scripts run, and shows nothing.
export function isLauncherFrame(view) {
  if (view.parent === view) return false
  try {
    void view.parent.location.href
    return false
  } catch {
    return true
  }
}

// Playground's service worker answers a page it once cached without asking the server
// (cache first, ignoring the query string) and keeps that cache until the next Playground
// release. The worker always fetches remote.html fresh, so remote.html also deletes the
// website pages from Playground's caches.
export async function removeCachedWebsitePages(cacheStorage, keptPages) {
  if (!cacheStorage) return []
  const removed = []
  for (const name of await cacheStorage.keys()) {
    if (!name.startsWith('playground-cache')) continue
    const cache = await cacheStorage.open(name)
    for (const request of await cache.keys()) {
      const { pathname } = new URL(request.url)
      if (/\.html?$/i.test(pathname) && !keptPages.includes(pathname) && !/^\/wp-(\d+\.\d+|beta|nightly|trunk)\//.test(pathname)) {
        await cache.delete(request)
        removed.push(pathname)
      }
    }
  }
  return removed
}

export function withLauncherGuard(html) {
  const head = html.match(/<head[^>]*>/i)
  if (!head) throw new Error('remote.html has no <head> for the launcher guard.')
  const kept = JSON.stringify([...LAUNCHER_PAGES].map((page) => `/${page}`))
  // Both functions are self-contained, so their source runs as is. Stopping the load ends
  // the parser before it reaches Playground's module scripts. A failed cache cleanup must
  // never stop Playground from starting.
  const script = `<script>if (!(${isLauncherFrame})(window)) { window.stop(); document.documentElement.replaceChildren() }\n(${removeCachedWebsitePages})(self.caches, ${kept}).catch(() => {})</script>`
  const at = head.index + head[0].length
  return `${html.slice(0, at)}${script}${html.slice(at)}`
}

// Playground downloads WP-CLI from playground.wordpress.net, a URL fixed in its source,
// whenever a Blueprint asks for WP-CLI. The upstream build ships the same file as
// /wp-cli.phar, so every Playground script points at the host's copy instead. The client
// runs in the launcher's page, so it finds the host from its own file's URL; every other
// script runs on the host's origin (its frame, workers and service worker), and some of
// them are not modules.
const UPSTREAM_WP_CLI = /(["'`])https:\/\/playground\.wordpress\.net\/wp-cli\.phar\1/g
export const WP_CLI_FILE = 'wp-cli.phar'

export function pointWpCliAtHost(source, { module = false } = {}) {
  const base = module ? 'import.meta.url' : 'self.location.href'
  let count = 0
  const rewritten = source.replace(UPSTREAM_WP_CLI, () => {
    count += 1
    return `new URL("/${WP_CLI_FILE}", ${base}).href`
  })
  return { source: rewritten, count }
}

// The launcher bundles @wp-playground/blueprints, which carries the same URL. Vite knows
// the Playground host when it builds the launcher, so the bundle names the host's copy.
export function wpCliFromHostPlugin(origin) {
  const url = JSON.stringify(`${origin}/${WP_CLI_FILE}`)
  return {
    name: 'wp-cli-from-playground-host',
    transform(code) {
      const rewritten = code.replace(UPSTREAM_WP_CLI, url)
      return rewritten === code ? null : { code: rewritten, map: null }
    },
  }
}

function launcherOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid launcher origin: ${value}`)
  }
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Invalid launcher origin: ${value}`)
  }
  return url.origin
}

export function buildHeaders({ launcherOrigins, wordpressDirectories }) {
  if (!launcherOrigins?.length) throw new Error('At least one launcher origin is required.')
  const ancestors = launcherOrigins.map(launcherOrigin)
  const rules = [
    ['/*', [
      // 'self' because Playground nests WordPress pages in frames of this origin.
      `Content-Security-Policy: frame-ancestors 'self' ${ancestors.join(' ')}`,
      'X-Content-Type-Options: nosniff',
    ]],
    // Every file under /assets/ carries a content hash in its name.
    ['/assets/*', ['Cache-Control: public, max-age=31536000, immutable']],
    // The launcher imports the Playground client from here as a cross-origin module.
    ['/client/*', ['Access-Control-Allow-Origin: *']],
    // The client downloads WP-CLI from the launcher's page, so it is a cross-origin fetch too.
    [`/${WP_CLI_FILE}`, ['Access-Control-Allow-Origin: *']],
    // Matches upstream: WordPress static files change when a build moves to a newer minor release.
    ...wordpressDirectories.map((directory) => [`/${directory}/*`, ['Cache-Control: public, max-age=3600']]),
  ]
  return rules.map(([pattern, headers]) => `${pattern}\n${headers.map((header) => `  ${header}\n`).join('')}`).join('')
}

export function parseArguments(argv) {
  const usage = 'Usage: prepare-playground-host.mjs <built website> <output folder> --launcher-origin <origin> [--launcher-origin <origin>…]'
  const positional = []
  const launcherOrigins = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--launcher-origin') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(usage)
      launcherOrigins.push(value)
      index += 1
    } else {
      positional.push(argv[index])
    }
  }
  if (positional.length !== 2) throw new Error(usage)
  return { source: positional[0], out: positional[1], launcherOrigins }
}

async function listFiles(directory, prefix = '') {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...await listFiles(path.join(directory, entry.name), relative))
    else if (entry.isFile()) found.push(relative)
  }
  return found
}

async function readOfflineAssets(source) {
  try {
    const list = JSON.parse(await readFile(path.join(source, 'assets-required-for-offline-mode.json'), 'utf8'))
    return new Set(Array.isArray(list) ? list : [])
  } catch (error) {
    if (error.code === 'ENOENT') return new Set()
    throw error
  }
}

async function splitFile(from, to, size, partSize) {
  const parts = []
  const input = await open(from, 'r')
  try {
    for (let offset = 0, index = 0; offset < size; offset += partSize, index += 1) {
      const length = Math.min(partSize, size - offset)
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await input.read(buffer, 0, length, offset)
      if (bytesRead !== length) throw new Error(`Short read while splitting ${from}`)
      await writeFile(`${to}.part${index}`, buffer)
      parts.push(index)
    }
  } finally {
    await input.close()
  }
  return parts
}

export async function preparePlaygroundHost({
  source,
  out,
  launcherOrigins,
  phpVersions = PHP_VERSIONS,
  fileSizeLimit = FILE_SIZE_LIMIT,
  fileLimit = FILE_LIMIT,
  partSize = PART_SIZE,
}) {
  const headers = buildHeaders({ launcherOrigins, wordpressDirectories: [] })
  await mkdir(out, { recursive: true })
  if ((await readdir(out)).length) throw new Error(`Output folder is not empty: ${out}`)

  const offlineAssets = await readOfflineAssets(source)
  const files = (await listFiles(source)).filter((file) => isKept(file, { phpVersions, offlineAssets })).sort()
  const manifest = {}
  const wordpressDirectories = new Set()
  const wpCliLinks = []
  let fileCount = 0
  for (const file of files) {
    const from = path.join(source, file)
    const to = path.join(out, file)
    await mkdir(path.dirname(to), { recursive: true })
    const top = file.split('/')[0]
    if (file.includes('/') && /^wp-(\d+\.\d+|beta)$/.test(top)) wordpressDirectories.add(top)
    if (file === 'remote.html') {
      await writeFile(to, withLauncherGuard(await readFile(from, 'utf8')))
      fileCount += 1
      continue
    }
    const { size } = await stat(from)
    if (/\.m?js$/.test(file) && size <= fileSizeLimit) {
      const pointed = pointWpCliAtHost(await readFile(from, 'utf8'), { module: top === 'client' })
      if (pointed.count) {
        await writeFile(to, pointed.source)
        wpCliLinks.push(file)
        fileCount += 1
        continue
      }
    }
    if (size > fileSizeLimit) {
      if (/\.m?js$/.test(file) && (await readFile(from, 'utf8')).search(UPSTREAM_WP_CLI) !== -1) {
        throw new Error(`${file} is larger than the per-file limit and downloads WP-CLI from playground.wordpress.net; the host build only points smaller scripts at /${WP_CLI_FILE}.`)
      }
      const parts = await splitFile(from, to, size, partSize)
      manifest[`/${file}`] = { size, parts: parts.map((index) => `/${file}.part${index}`) }
      fileCount += parts.length
    } else {
      await copyFile(from, to)
      fileCount += 1
    }
  }

  if (wpCliLinks.length && !files.includes(WP_CLI_FILE)) {
    throw new Error(`${wpCliLinks.join(', ')} now download WP-CLI from /${WP_CLI_FILE}, which the Playground build does not have.`)
  }

  await writeFile(path.join(out, SPLIT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  const sortedDirectories = [...wordpressDirectories].sort()
  await writeFile(path.join(out, '_headers'), sortedDirectories.length
    ? buildHeaders({ launcherOrigins, wordpressDirectories: sortedDirectories })
    : headers)
  fileCount += 2
  if (fileCount > fileLimit) throw new Error(`The Playground host would have ${fileCount} files, more than ${fileLimit} files allowed.`)
  return { fileCount, split: Object.keys(manifest), wordpressDirectories: sortedDirectories, wpCliLinks }
}

// The same entry check as scripts/sync-wordpress-release.mjs.
const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFilename === fileURLToPath(import.meta.url)) {
  try {
    const result = await preparePlaygroundHost(parseArguments(process.argv.slice(2)))
    console.log(`Prepared ${result.fileCount} files; WordPress ${result.wordpressDirectories.join(', ')}; split: ${result.split.join(', ') || 'none'}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
