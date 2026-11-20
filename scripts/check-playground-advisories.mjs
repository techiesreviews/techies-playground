#!/usr/bin/env node
// Fails when a published security advisory covers a WordPress Playground package the
// launcher installs, or one the self-hosted Playground on wp.techies.tools ships: it is
// built from the same release, at the pinned version (HOST_PACKAGES). It reads two sources:
// GitHub's advisory database (reviewed and unreviewed npm advisories) and the advisories
// WordPress/wordpress-playground publishes in its own repository.
//
// Run by .github/workflows/security-checks.yml and sync-playground-release.yml.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareVersions, getPinnedPlaygroundVersion } from './sync-playground-release.mjs'

const PLAYGROUND_PACKAGE = /(?:^|\/)node_modules\/(@(?:wp-playground|php-wasm)\/[^/]+)$/
// Packages the self-hosted Playground ships that the launcher's lockfile does not install
// (the client loads from the host, which runs the remote page and PHP in the browser).
export const HOST_PACKAGES = ['@php-wasm/web', '@wp-playground/client', '@wp-playground/remote']
// An operator is optional (a bare version means "= version"); a pre-release or build
// suffix on a bound counts as its release.
const COMPARATOR = /^(<=|>=|<|>|=)?\s*v?(\d+(?:\.\d+)*)(?:[-+][0-9A-Za-z.-]+)?$/
const UPSTREAM_REPOSITORY = 'WordPress/wordpress-playground'
// Keeps each advisory database request well under URL length limits.
const PACKAGES_PER_REQUEST = 20

const stableVersion = (version) => version.split(/[-+]/)[0]

// GitHub writes ranges as comma-separated comparators, such as ">= 3.0.0, < 3.1.65";
// repository advisories are written by hand and may also say "3.1.64" or "*".
export function isInRange(version, range) {
  const current = stableVersion(version)
  if (range.trim() === '*') return true
  return range.split(',').map((part) => part.trim()).every((part) => {
    const match = COMPARATOR.exec(part)
    if (!match) throw new Error(`Unknown version range: ${range}`)
    const difference = compareVersions(current, match[2])
    return { '<': difference < 0, '<=': difference <= 0, '>': difference > 0, '>=': difference >= 0, '=': difference === 0 }[match[1] || '=']
  })
}

function advisoryCovers(advisory, version, range) {
  try {
    return isInRange(version, range)
  } catch {
    throw new Error(`Advisory ${advisory.ghsa_id} names a version range this check cannot read: "${range}". Read it at ${advisory.html_url} and update scripts/check-playground-advisories.mjs.`)
  }
}

export function listPlaygroundPackages(lockDocument) {
  const found = new Map()
  for (const [location, entry] of Object.entries(lockDocument.packages || {})) {
    const name = PLAYGROUND_PACKAGE.exec(location)?.[1]
    if (name && entry.version) found.set(`${name}@${entry.version}`, { name, version: entry.version })
  }
  return sortPackages(found)
}

const sortPackages = (found) => [...found.values()].sort((left, right) => left.name.localeCompare(right.name) || compareVersions(left.version, right.version))

// The installed packages plus HOST_PACKAGES at the version the host is built from.
export function addHostPackages(installed, hostVersion) {
  const found = new Map(installed.map((entry) => [`${entry.name}@${entry.version}`, entry]))
  for (const name of HOST_PACKAGES) found.set(`${name}@${hostVersion}`, { name, version: hostVersion })
  return sortPackages(found)
}

export function findAffectingAdvisories(advisories, installed) {
  const found = new Map()
  for (const advisory of advisories) {
    for (const vulnerability of advisory.vulnerabilities || []) {
      if (vulnerability.package?.ecosystem !== 'npm' || !vulnerability.vulnerable_version_range) continue
      for (const { name, version } of installed) {
        if (vulnerability.package.name !== name || !advisoryCovers(advisory, version, vulnerability.vulnerable_version_range)) continue
        found.set(`${advisory.ghsa_id} ${name}@${version}`, {
          id: advisory.ghsa_id,
          packageName: name,
          // The advisory database names first_patched_version; repository advisories, patched_versions.
          patched: vulnerability.first_patched_version || vulnerability.patched_versions || 'none yet',
          severity: advisory.severity,
          summary: advisory.summary,
          url: advisory.html_url,
          version,
        })
      }
    }
  }
  return [...found.values()]
}

async function fetchAdvisories(url) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`)
  return response.json()
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const launcher = listPlaygroundPackages(JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8')))
  if (!launcher.length) throw new Error('package-lock.json installs no Playground packages.')
  const hostVersion = getPinnedPlaygroundVersion(JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')))
  const installed = addHostPackages(launcher, hostVersion)

  const advisories = await fetchAdvisories(`https://api.github.com/repos/${UPSTREAM_REPOSITORY}/security-advisories?state=published&per_page=100`)
  for (let index = 0; index < installed.length; index += PACKAGES_PER_REQUEST) {
    const affects = installed.slice(index, index + PACKAGES_PER_REQUEST).map(({ name, version }) => `${name}@${version}`).join(',')
    for (const type of ['reviewed', 'unreviewed']) {
      advisories.push(...await fetchAdvisories(`https://api.github.com/advisories?ecosystem=npm&type=${type}&per_page=100&affects=${encodeURIComponent(affects)}`))
    }
  }

  const found = findAffectingAdvisories(advisories, installed)
  const versions = [...new Set(installed.map(({ version }) => version))].join(', ')
  if (!found.length) {
    console.log(`No published advisory covers the ${installed.length} Playground packages installed or served by the Playground host (${versions}).`)
    return
  }
  for (const advisory of found) {
    console.error(`${advisory.id} (${advisory.severity}) ${advisory.packageName}@${advisory.version}: ${advisory.summary}. Fixed in ${advisory.patched}. ${advisory.url}`)
  }
  throw new Error(`${found.length} Playground advisory finding(s).`)
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFilename === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
