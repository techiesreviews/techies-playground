import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addHostPackages,
  findAffectingAdvisories,
  HOST_PACKAGES,
  isInRange,
  listPlaygroundPackages,
} from './check-playground-advisories.mjs'

test('reads GitHub version ranges', () => {
  assert.equal(isInRange('3.1.64', '<= 3.1.64'), true)
  assert.equal(isInRange('3.1.65', '<= 3.1.64'), false)
  assert.equal(isInRange('3.1.64', '>= 3.0.0, < 3.1.65'), true)
  assert.equal(isInRange('2.9.9', '>= 3.0.0, < 3.1.65'), false)
  assert.equal(isInRange('3.1.64', '= 3.1.64'), true)
  assert.equal(isInRange('3.1.64', '> 3.1.64'), false)
  assert.equal(isInRange('3.1.64', '< 3.2'), true)
  assert.throws(() => isInRange('3.1.64', '~3.1'), /version range/)
})

test('reads hand-written repository advisory ranges', () => {
  // A bare version means that version only, and * means every version.
  assert.equal(isInRange('3.1.64', '3.1.64'), true)
  assert.equal(isInRange('3.1.65', '3.1.64'), false)
  assert.equal(isInRange('3.1.64', '*'), true)
  // A pre-release bound counts as its release.
  assert.equal(isInRange('3.1.64', '< 3.1.65-rc.1'), true)
  assert.equal(isInRange('3.1.65', '< 3.1.65-rc.1'), false)
  assert.equal(isInRange('3.1.65', '>= 3.1.65-beta.2, < 3.1.66'), true)
})

test('names the advisory whose range it cannot read', () => {
  const advisory = {
    ghsa_id: 'GHSA-zzzz-zzzz-zzzz',
    html_url: 'https://github.com/advisories/GHSA-zzzz-zzzz-zzzz',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: '@wp-playground/blueprints' }, vulnerable_version_range: '^3.1.0' }],
  }
  assert.throws(
    () => findAffectingAdvisories([advisory], [{ name: '@wp-playground/blueprints', version: '3.1.64' }]),
    /GHSA-zzzz-zzzz-zzzz .*"\^3\.1\.0".*github\.com\/advisories/,
  )
})

test('lists every Playground package the lockfile installs, once per version', () => {
  const lock = {
    packages: {
      '': { name: 'techies-playground' },
      'node_modules/@wp-playground/blueprints': { version: '3.1.64' },
      'node_modules/@wp-playground/storage': { version: '3.1.64' },
      'node_modules/@php-wasm/universal': { version: '3.1.64' },
      'node_modules/@wp-playground/storage/node_modules/@php-wasm/universal': { version: '3.1.63' },
      'node_modules/other/node_modules/@php-wasm/universal': { version: '3.1.64' },
      'node_modules/isomorphic-git': { version: '1.38.6' },
    },
  }
  assert.deepEqual(listPlaygroundPackages(lock), [
    { name: '@php-wasm/universal', version: '3.1.63' },
    { name: '@php-wasm/universal', version: '3.1.64' },
    { name: '@wp-playground/blueprints', version: '3.1.64' },
    { name: '@wp-playground/storage', version: '3.1.64' },
  ])
})

test('keeps only the advisories that cover an installed version, once each', () => {
  const installed = [
    { name: '@wp-playground/blueprints', version: '3.1.64' },
    { name: '@php-wasm/universal', version: '3.1.64' },
  ]
  const advisory = (id, name, range, ecosystem = 'npm') => ({
    ghsa_id: id,
    severity: 'high',
    summary: `${id} summary`,
    html_url: `https://github.com/advisories/${id}`,
    vulnerabilities: [{ package: { ecosystem, name }, vulnerable_version_range: range, patched_versions: '3.1.65' }],
  })
  const found = findAffectingAdvisories([
    advisory('GHSA-aaaa', '@wp-playground/blueprints', '< 3.1.65'),
    advisory('GHSA-aaaa', '@wp-playground/blueprints', '< 3.1.65'),
    advisory('GHSA-bbbb', '@wp-playground/blueprints', '< 3.1.60'),
    advisory('GHSA-cccc', '@php-wasm/universal', '<= 3.1.64'),
    advisory('GHSA-dddd', '@php-wasm/universal', '<= 3.1.64', 'pip'),
    advisory('GHSA-eeee', '@wp-playground/cli', '<= 3.1.64'),
  ], installed)
  assert.deepEqual(found.map(({ id, packageName, version }) => `${id} ${packageName}@${version}`), [
    'GHSA-aaaa @wp-playground/blueprints@3.1.64',
    'GHSA-cccc @php-wasm/universal@3.1.64',
  ])
  assert.equal(found[0].patched, '3.1.65')
  assert.equal(found[0].url, 'https://github.com/advisories/GHSA-aaaa')

  // The advisory database names the fixed version first_patched_version.
  const database = advisory('GHSA-ffff', '@php-wasm/universal', '<= 3.1.64')
  database.vulnerabilities[0] = { ...database.vulnerabilities[0], patched_versions: undefined, first_patched_version: '3.1.66' }
  assert.equal(findAffectingAdvisories([database], installed)[0].patched, '3.1.66')
})

test('also checks the packages the Playground host ships at the pinned version', () => {
  const launcher = [
    { name: '@php-wasm/universal', version: '3.1.64' },
    { name: '@wp-playground/blueprints', version: '3.1.64' },
  ]
  const installed = addHostPackages(launcher, '3.1.64')
  assert.deepEqual(installed.map(({ name, version }) => `${name}@${version}`), [
    '@php-wasm/universal@3.1.64',
    '@php-wasm/web@3.1.64',
    '@wp-playground/blueprints@3.1.64',
    '@wp-playground/client@3.1.64',
    '@wp-playground/remote@3.1.64',
  ])
  for (const name of HOST_PACKAGES) assert.ok(!launcher.some((entry) => entry.name === name), `${name} is not in the lockfile list`)

  // An advisory for the client counts even though the lockfile does not install it.
  const client = {
    ghsa_id: 'GHSA-gggg',
    severity: 'high',
    summary: 'client summary',
    html_url: 'https://github.com/advisories/GHSA-gggg',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: '@wp-playground/client' }, vulnerable_version_range: '<= 3.1.64', first_patched_version: '3.1.65' }],
  }
  assert.deepEqual(findAffectingAdvisories([client], launcher), [])
  assert.deepEqual(findAffectingAdvisories([client], installed).map(({ id, packageName, version }) => `${id} ${packageName}@${version}`), [
    'GHSA-gggg @wp-playground/client@3.1.64',
  ])
})
