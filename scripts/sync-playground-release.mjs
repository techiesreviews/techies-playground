#!/usr/bin/env node
// Moves the launcher to the newest WordPress Playground release. One version number drives
// all three parts: the blueprints package the launcher bundles, the Playground client and
// the self-hosted build (deploy-site.yml builds wp.techies.tools from the tag that matches
// the @wp-playground/blueprints pin). So a release is taken only when its npm packages and
// its tag in WordPress/wordpress-playground are all published.
//
// Run by .github/workflows/sync-playground-release.yml; it writes package.json and
// src/App.jsx, then refreshes package-lock.json with npm.
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const PIN = '@wp-playground/blueprints'
const PLAYGROUND_PACKAGE = /^@(wp-playground|php-wasm)\//
const EXACT_VERSION = /^\d+\.\d+\.\d+$/
const UPSTREAM_REPOSITORY = 'WordPress/wordpress-playground'
// The package whose own pins decide whether an override is still needed.
const UPSTREAM_PINS_PACKAGE = '@wp-playground/storage'

export function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference) return difference
  }
  return 0
}

export function getPinnedPlaygroundVersion(packageDocument) {
  const version = packageDocument.dependencies?.[PIN]
  if (!EXACT_VERSION.test(version || '')) throw new Error(`${PIN} must pin an exact version, found ${version}.`)
  return version
}

export function getNextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Invalid application version: ${version}`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function formatReleaseDate(date) {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', timeZone: 'UTC', year: 'numeric' }).format(date)
}

function insertChangelogEntry(source, { appVersion, playgroundVersion, releaseDate }) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const marker = `const CHANGELOG_ENTRIES = [${eol}`
  if (!source.includes(marker)) throw new Error('Could not find CHANGELOG_ENTRIES in src/App.jsx.')
  const lines = [
    '  {',
    `    version: '${appVersion}',`,
    `    date: '${releaseDate}',`,
    `    title: 'WordPress Playground ${playgroundVersion}',`,
    "    summary: 'Playground runs on its newest release.',",
    '    changes: [',
    `      'Playground is updated to ${playgroundVersion}.',`,
    "      'The update was prepared automatically from the official Playground release.',",
    '    ],',
    '  },',
  ]
  return source.replace(marker, `${marker}${lines.join(eol)}${eol}`)
}

function movePins(section, from, to) {
  if (!section) return section
  return Object.fromEntries(Object.entries(section).map(([name, version]) => [
    name,
    PLAYGROUND_PACKAGE.test(name) && version === from ? to : version,
  ]))
}

// An override holds a package above the version Playground pins (isomorphic-git, for its
// advisories). Once the release itself pins that version or a newer one, the override
// would only hold the package back, so it goes.
function dropSettledOverrides(overrides, upstreamDependencies) {
  if (!overrides) return { overrides, dropped: [] }
  const kept = {}
  const dropped = []
  for (const [name, version] of Object.entries(overrides)) {
    const upstream = upstreamDependencies[name]
    if (typeof version === 'string' && EXACT_VERSION.test(version) && EXACT_VERSION.test(upstream || '') && compareVersions(upstream, version) >= 0) {
      dropped.push(name)
    } else {
      kept[name] = version
    }
  }
  return { overrides: kept, dropped }
}

export function preparePlaygroundSync({
  appSource,
  packageDocument,
  latestVersion,
  releaseDate = new Date(),
  upstreamDependencies = {},
}) {
  const previousVersion = getPinnedPlaygroundVersion(packageDocument)
  if (!EXACT_VERSION.test(latestVersion) || compareVersions(latestVersion, previousVersion) <= 0) {
    return { appSource, changed: false, packageDocument, playgroundVersion: previousVersion, previousVersion }
  }

  const appVersion = getNextPatchVersion(packageDocument.version)
  const { overrides, dropped } = dropSettledOverrides(packageDocument.overrides, upstreamDependencies)
  const updatedPackageDocument = {
    ...packageDocument,
    version: appVersion,
    dependencies: movePins(packageDocument.dependencies, previousVersion, latestVersion),
    devDependencies: movePins(packageDocument.devDependencies, previousVersion, latestVersion),
    ...(packageDocument.overrides ? { overrides } : {}),
  }
  if (updatedPackageDocument.overrides && !Object.keys(updatedPackageDocument.overrides).length) delete updatedPackageDocument.overrides

  return {
    appSource: insertChangelogEntry(appSource, {
      appVersion,
      playgroundVersion: latestVersion,
      releaseDate: formatReleaseDate(releaseDate),
    }),
    appVersion,
    changed: true,
    droppedOverrides: dropped,
    packageDocument: updatedPackageDocument,
    playgroundVersion: latestVersion,
    previousVersion,
  }
}

export async function findMissingReleaseParts(version, { packages, hasPackage, hasTag }) {
  const missing = []
  for (const name of packages) {
    if (!await hasPackage(name, version)) missing.push(`${name}@${version} on npm`)
  }
  if (!await hasTag(`v${version}`)) missing.push(`tag v${version} in ${UPSTREAM_REPOSITORY}`)
  return missing
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`)
  return response.json()
}

const registryUrl = (name, version) => `https://registry.npmjs.org/${name.replace('/', '%2F')}/${version}`

async function hasTag(tag) {
  try {
    await promisify(execFile)('git', ['ls-remote', '--exit-code', '--tags', `https://github.com/${UPSTREAM_REPOSITORY}.git`, `refs/tags/${tag}`], { timeout: 60_000 })
    return true
  } catch (error) {
    // git ls-remote --exit-code exits 2 when the ref does not exist.
    if (error.code === 2) return false
    throw error
  }
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const filenames = {
    app: path.join(repositoryRoot, 'src', 'App.jsx'),
    package: path.join(repositoryRoot, 'package.json'),
  }
  const [appSource, packageSource] = await Promise.all([readFile(filenames.app, 'utf8'), readFile(filenames.package, 'utf8')])
  const packageDocument = JSON.parse(packageSource)
  const pinned = getPinnedPlaygroundVersion(packageDocument)
  const latest = (await fetchJson(registryUrl(PIN, 'latest')))?.version
  if (!EXACT_VERSION.test(latest || '')) throw new Error(`npm returned no stable ${PIN} release.`)

  let result = { changed: false, playgroundVersion: pinned }
  if (compareVersions(latest, pinned) > 0) {
    const packages = Object.entries({ ...packageDocument.dependencies, ...packageDocument.devDependencies })
      .filter(([name, version]) => PLAYGROUND_PACKAGE.test(name) && version === pinned)
      .map(([name]) => name)
    const missing = await findMissingReleaseParts(latest, {
      packages,
      hasPackage: async (name, version) => Boolean(await fetchJson(registryUrl(name, version))),
      hasTag,
    })
    if (missing.length) {
      console.log(`Playground ${latest} is not complete yet; waiting for: ${missing.join(', ')}.`)
    } else {
      const upstream = await fetchJson(registryUrl(UPSTREAM_PINS_PACKAGE, latest))
      result = preparePlaygroundSync({
        appSource,
        packageDocument,
        latestVersion: latest,
        upstreamDependencies: upstream?.dependencies || {},
      })
    }
  }

  if (result.changed) {
    await writeFile(filenames.app, result.appSource)
    await writeFile(filenames.package, `${JSON.stringify(result.packageDocument, null, 2)}\n`)
    // Refreshes package-lock.json (and node_modules, for the checks that follow) from the
    // new pins. Install scripts stay off, as in the rest of the pipeline's npm ci runs.
    await promisify(execFile)('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: repositoryRoot, timeout: 600_000 })
  }

  const output = process.env.GITHUB_OUTPUT
  if (output) {
    await writeFile(output, [
      `changed=${result.changed}`,
      `playground_version=${result.playgroundVersion}`,
      `previous_version=${pinned}`,
      `app_version=${result.appVersion || packageDocument.version}`,
      `dropped_overrides=${(result.droppedOverrides || []).join(' ')}`,
      '',
    ].join('\n'), { flag: 'a' })
  }
  console.log(result.changed
    ? `Prepared Playground ${result.playgroundVersion} (from ${pinned}) as app ${result.appVersion}.${result.droppedOverrides.length ? ` Dropped overrides: ${result.droppedOverrides.join(', ')}.` : ''}`
    : `Playground ${pinned} is the newest complete release.`)
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFilename === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
