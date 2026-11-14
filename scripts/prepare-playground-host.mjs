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
const DROPPED_FILES = new Set(['.htaccess', 'php-8-6.html'])

export function isKept(relativePath, { phpVersions = PHP_VERSIONS, offlineAssets = new Set() } = {}) {
  if (offlineAssets.has(`/${relativePath}`)) return true
  const segments = relativePath.split('/')
  const name = segments.at(-1)
  if (DROPPED_DIRECTORIES.has(segments[0]) || DROPPED_FILES.has(relativePath)) return false
  if (segments[0] === BETA_DIRECTORY) return segments.length === 2 ? BETA_TOP_FILES.has(name) : BETA_FIRST_PAGE_FILE.test(name)
  if (name.endsWith('.map') || name.endsWith('.php')) return false
  if (/^wp-(nightly|trunk)\.tar-/.test(name)) return false
  if (/-php52-/.test(name)) return false
  const php = name.match(/^php_(\d+)_(\d+)-/)
  if (php && !phpVersions.has(`${php[1]}.${php[2]}`)) return false
  return true
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
  let fileCount = 0
  for (const file of files) {
    const from = path.join(source, file)
    const to = path.join(out, file)
    await mkdir(path.dirname(to), { recursive: true })
    const top = file.split('/')[0]
    if (file.includes('/') && /^wp-(\d+\.\d+|beta)$/.test(top)) wordpressDirectories.add(top)
    const { size } = await stat(from)
    if (size > fileSizeLimit) {
      const parts = await splitFile(from, to, size, partSize)
      manifest[`/${file}`] = { size, parts: parts.map((index) => `/${file}.part${index}`) }
      fileCount += parts.length
    } else {
      await copyFile(from, to)
      fileCount += 1
    }
  }

  await writeFile(path.join(out, SPLIT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  const sortedDirectories = [...wordpressDirectories].sort()
  await writeFile(path.join(out, '_headers'), sortedDirectories.length
    ? buildHeaders({ launcherOrigins, wordpressDirectories: sortedDirectories })
    : headers)
  fileCount += 2
  if (fileCount > fileLimit) throw new Error(`The Playground host would have ${fileCount} files, more than ${fileLimit} files allowed.`)
  return { fileCount, split: Object.keys(manifest), wordpressDirectories: sortedDirectories }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await preparePlaygroundHost(parseArguments(process.argv.slice(2)))
    console.log(`Prepared ${result.fileCount} files; WordPress ${result.wordpressDirectories.join(', ')}; split: ${result.split.join(', ') || 'none'}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
