import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findMissingReleaseParts,
  getNextPatchVersion,
  getPinnedPlaygroundVersion,
  preparePlaygroundSync,
} from './sync-playground-release.mjs'

const appSource = `const CHANGELOG_ENTRIES = [
  {
    version: '0.10.4',
  },
]`
const packageDocument = {
  name: 'techies-playground',
  version: '0.10.4',
  dependencies: {
    '@heroicons/react': '^2.2.0',
    '@wp-playground/blueprints': '3.1.64',
    react: '^19.1.1',
  },
  devDependencies: {
    '@php-wasm/node-8-3': '3.1.64',
    '@php-wasm/universal': '3.1.64',
    vite: '^7.3.8',
  },
  overrides: {
    sharp: '0.35.5',
    'isomorphic-git': '1.38.6',
  },
}

test('reads the exact Playground release the launcher and host are built from', () => {
  assert.equal(getPinnedPlaygroundVersion(packageDocument), '3.1.64')
  assert.throws(
    () => getPinnedPlaygroundVersion({ dependencies: { '@wp-playground/blueprints': '^3.1.64' } }),
    /exact version/,
  )
})

test('bumps the app patch version', () => {
  assert.equal(getNextPatchVersion('0.10.4'), '0.10.5')
  assert.throws(() => getNextPatchVersion('0.10'), /Invalid application version/)
})

test('does nothing when the pinned release is the newest one', () => {
  for (const latestVersion of ['3.1.64', '3.1.63']) {
    const result = preparePlaygroundSync({ appSource, packageDocument, latestVersion })
    assert.equal(result.changed, false)
    assert.equal(result.packageDocument, packageDocument)
    assert.equal(result.appSource, appSource)
  }
})

test('moves every Playground package, the app version and the changelog to a new release together', () => {
  const result = preparePlaygroundSync({
    appSource,
    packageDocument,
    latestVersion: '3.1.65',
    releaseDate: new Date('2026-11-20T12:00:00Z'),
    upstreamDependencies: { 'isomorphic-git': '1.37.6' },
  })

  assert.equal(result.changed, true)
  assert.equal(result.playgroundVersion, '3.1.65')
  assert.equal(result.previousVersion, '3.1.64')
  assert.equal(result.appVersion, '0.10.5')
  assert.equal(result.packageDocument.version, '0.10.5')
  assert.equal(result.packageDocument.dependencies['@wp-playground/blueprints'], '3.1.65')
  assert.equal(result.packageDocument.devDependencies['@php-wasm/node-8-3'], '3.1.65')
  assert.equal(result.packageDocument.devDependencies['@php-wasm/universal'], '3.1.65')
  // Other packages and the input document stay as they were.
  assert.equal(result.packageDocument.dependencies.react, '^19.1.1')
  assert.equal(result.packageDocument.devDependencies.vite, '^7.3.8')
  assert.equal(packageDocument.dependencies['@wp-playground/blueprints'], '3.1.64')
  // The release still pins the vulnerable isomorphic-git, so the override stays.
  assert.deepEqual(result.packageDocument.overrides, packageDocument.overrides)
  assert.deepEqual(result.droppedOverrides, [])

  assert.match(result.appSource, /version: '0\.10\.5',\n {4}date: 'November 20, 2026',\n {4}title: 'WordPress Playground 3\.1\.65',/)
  assert.match(result.appSource, /'Playground is updated to 3\.1\.65\.'/)
  assert.ok(result.appSource.indexOf("'0.10.5'") < result.appSource.indexOf("'0.10.4'"))
})

test('drops an override once the release itself asks for that version or newer', () => {
  for (const upstream of ['1.38.6', '1.44.17']) {
    const result = preparePlaygroundSync({
      appSource,
      packageDocument,
      latestVersion: '3.1.66',
      upstreamDependencies: { 'isomorphic-git': upstream },
    })
    assert.deepEqual(result.packageDocument.overrides, { sharp: '0.35.5' })
    assert.deepEqual(result.droppedOverrides, ['isomorphic-git'])
  }
})

test('keeps the Windows line endings of the app source', () => {
  const result = preparePlaygroundSync({
    appSource: appSource.replaceAll('\n', '\r\n'),
    packageDocument,
    latestVersion: '3.1.65',
  })
  assert.equal(result.appSource.replaceAll('\r\n', '').includes('\n'), false)
})

test('names each part of a release that is not published yet', async () => {
  const published = new Set(['@wp-playground/blueprints@3.1.65', '@php-wasm/universal@3.1.65'])
  const missing = await findMissingReleaseParts('3.1.65', {
    packages: ['@wp-playground/blueprints', '@php-wasm/node-8-3', '@php-wasm/universal'],
    hasPackage: async (name, version) => published.has(`${name}@${version}`),
    hasTag: async (tag) => tag === 'v3.1.64',
  })
  assert.deepEqual(missing, ['@php-wasm/node-8-3@3.1.65 on npm', 'tag v3.1.65 in WordPress/wordpress-playground'])

  assert.deepEqual(await findMissingReleaseParts('3.1.65', {
    packages: ['@wp-playground/blueprints'],
    hasPackage: async () => true,
    hasTag: async () => true,
  }), [])
})
