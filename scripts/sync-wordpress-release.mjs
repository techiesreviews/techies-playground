import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const WORDPRESS_VERSION_API_URL = 'https://api.wordpress.org/core/version-check/1.7/'
const STABLE_RELEASE = /^\d+\.\d+(?:\.\d+)?$/

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference) return difference
  }
  return 0
}

export function getLatestStableRelease(payload) {
  if (!payload || !Array.isArray(payload.offers)) throw new Error('WordPress returned an invalid version list.')

  const stableOffers = payload.offers.filter((offer) => {
    const version = offer.current || offer.version
    return (!offer.locale || offer.locale === 'en_US')
      && typeof version === 'string'
      && STABLE_RELEASE.test(version)
  })
  const upgrade = stableOffers.find((offer) => offer.response === 'upgrade')
  const version = upgrade?.current || upgrade?.version || stableOffers
    .map((offer) => offer.current || offer.version)
    .sort((left, right) => compareVersions(right, left))[0]

  if (!version) throw new Error('WordPress returned no stable release.')
  return version
}

export function getReleaseBranch(version) {
  const match = /^(\d+)\.(\d+)/.exec(version)
  if (!match) throw new Error(`Invalid WordPress release: ${version}`)
  return `${match[1]}.${match[2]}`
}

export function getNextMinorVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Invalid application version: ${version}`)
  return `${match[1]}.${Number(match[2]) + 1}.0`
}

function formatReleaseDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date)
}

function insertFallbackBranch(source, branch) {
  const existingBranches = [...source.matchAll(/\{ value: '(\d+\.\d+)', label: 'WordPress \1' \}/g)]
    .map((match) => match[1])
  if (existingBranches.some((existing) => compareVersions(existing, branch) >= 0)) return source

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const marker = "  { value: 'latest', label: 'Latest stable — resolved at launch', resolvedVersion: '' },"
  if (!source.includes(marker)) throw new Error('Could not find the WordPress fallback insertion point.')
  return source.replace(marker, `${marker}${eol}  { value: '${branch}', label: 'WordPress ${branch}' },`)
}

function insertChangelogEntry(source, { appVersion, releaseBranch, releaseDate }) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const marker = `const CHANGELOG_ENTRIES = [${eol}`
  if (!source.includes(marker)) throw new Error('Could not find CHANGELOG_ENTRIES in src/App.jsx.')

  const lines = [
    '  {',
    `    version: '${appVersion}',`,
    `    date: '${releaseDate}',`,
    `    title: 'WordPress ${releaseBranch} support',`,
    `    summary: 'The latest stable WordPress release is ready to launch.',`,
    '    changes: [',
    `      'Latest stable now resolves to WordPress ${releaseBranch}.',`,
    `      'WordPress ${releaseBranch} is available when the version API is offline.',`,
    '      \'The pinned release list was synchronized automatically from WordPress.org.\',',
    '    ],',
    '  },',
  ]
  return source.replace(marker, `${marker}${lines.join(eol)}${eol}`)
}

export function prepareReleaseSync({
  appSource,
  lockDocument,
  packageDocument,
  releaseDate = new Date(),
  wordpressSource,
  wordpressVersion,
}) {
  const releaseBranch = getReleaseBranch(wordpressVersion)
  const updatedWordPressSource = insertFallbackBranch(wordpressSource, releaseBranch)
  if (updatedWordPressSource === wordpressSource) {
    return {
      appSource,
      changed: false,
      lockDocument,
      packageDocument,
      releaseBranch,
      wordpressSource,
    }
  }

  const appVersion = getNextMinorVersion(packageDocument.version)
  const updatedPackageDocument = { ...packageDocument, version: appVersion }
  const updatedLockDocument = {
    ...lockDocument,
    version: appVersion,
    packages: {
      ...lockDocument.packages,
      '': { ...lockDocument.packages?.[''], version: appVersion },
    },
  }

  return {
    appSource: insertChangelogEntry(appSource, {
      appVersion,
      releaseBranch,
      releaseDate: formatReleaseDate(releaseDate),
    }),
    appVersion,
    changed: true,
    lockDocument: updatedLockDocument,
    packageDocument: updatedPackageDocument,
    releaseBranch,
    wordpressSource: updatedWordPressSource,
  }
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`)
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const filenames = {
    app: path.join(repositoryRoot, 'src', 'App.jsx'),
    lock: path.join(repositoryRoot, 'package-lock.json'),
    package: path.join(repositoryRoot, 'package.json'),
    wordpress: path.join(repositoryRoot, 'src', 'lib', 'wordpress-versions.js'),
  }
  const response = await fetch(WORDPRESS_VERSION_API_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`WordPress version check failed with status ${response.status}.`)
  const wordpressVersion = getLatestStableRelease(await response.json())
  const [appSource, lockSource, packageSource, wordpressSource] = await Promise.all([
    readFile(filenames.app, 'utf8'),
    readFile(filenames.lock, 'utf8'),
    readFile(filenames.package, 'utf8'),
    readFile(filenames.wordpress, 'utf8'),
  ])
  const packageDocument = JSON.parse(packageSource)
  const result = prepareReleaseSync({
    appSource,
    lockDocument: JSON.parse(lockSource),
    packageDocument,
    wordpressSource,
    wordpressVersion,
  })

  if (result.changed) {
    await Promise.all([
      writeFile(filenames.app, result.appSource),
      writeJson(filenames.lock, result.lockDocument),
      writeJson(filenames.package, result.packageDocument),
      writeFile(filenames.wordpress, result.wordpressSource),
    ])
  }

  const output = process.env.GITHUB_OUTPUT
  if (output) {
    await writeFile(output, [
      `app_version=${result.appVersion || packageDocument.version}`,
      `changed=${result.changed}`,
      `wordpress_version=${result.releaseBranch}`,
      '',
    ].join('\n'), { flag: 'a' })
  }
  console.log(result.changed
    ? `Prepared WordPress ${result.releaseBranch} support as app ${result.appVersion}.`
    : `WordPress ${result.releaseBranch} is already represented by the offline fallback.`)
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFilename === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
