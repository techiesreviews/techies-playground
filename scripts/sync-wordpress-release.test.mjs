import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getLatestStableRelease,
  getNextMinorVersion,
  getReleaseBranch,
  prepareReleaseSync,
} from './sync-wordpress-release.mjs'

const wordpressSource = `export const WORDPRESS_VERSION_FALLBACK_OPTIONS = Object.freeze([
  { value: 'latest', label: 'Latest stable — resolved at launch', resolvedVersion: '' },
  { value: '7.1', label: 'WordPress 7.1' },
  { value: '7.0', label: 'WordPress 7.0' },
])`
const appSource = `const CHANGELOG_ENTRIES = [
  {
    version: '0.4.0',
  },
]`
const packageDocument = { name: 'techies-playground', version: '0.4.0' }
const lockDocument = { name: 'techies-playground', version: '0.4.0', packages: { '': { version: '0.4.0' } } }

test('selects the English stable upgrade from the WordPress response', () => {
  assert.equal(getLatestStableRelease({ offers: [
    { response: 'upgrade', current: '7.2', locale: 'de_DE' },
    { response: 'autoupdate', current: '7.1.3', locale: 'en_US' },
    { response: 'upgrade', current: '7.2', locale: 'en_US' },
  ] }), '7.2')
})

test('normalizes releases to branches and bumps the app minor version', () => {
  assert.equal(getReleaseBranch('7.2.1'), '7.2')
  assert.equal(getNextMinorVersion('0.4.3'), '0.5.0')
})

test('does nothing when the release branch is already represented', () => {
  const result = prepareReleaseSync({
    appSource,
    lockDocument,
    packageDocument,
    wordpressSource,
    wordpressVersion: '7.1.2',
  })
  assert.equal(result.changed, false)
  assert.equal(result.wordpressSource, wordpressSource)
})

test('prepares fallback, version, lockfile, and changelog updates for a new branch', () => {
  const result = prepareReleaseSync({
    appSource,
    lockDocument,
    packageDocument,
    releaseDate: new Date('2026-09-14T12:00:00Z'),
    wordpressSource,
    wordpressVersion: '7.2',
  })

  assert.equal(result.changed, true)
  assert.equal(result.appVersion, '0.5.0')
  assert.equal(result.packageDocument.version, '0.5.0')
  assert.equal(result.lockDocument.version, '0.5.0')
  assert.equal(result.lockDocument.packages[''].version, '0.5.0')
  assert.match(result.wordpressSource, /value: '7\.2', label: 'WordPress 7\.2'/)
  assert.match(result.appSource, /version: '0\.5\.0'/)
  assert.match(result.appSource, /date: 'September 14, 2026'/)
  assert.match(result.appSource, /title: 'WordPress 7\.2 support'/)
})
