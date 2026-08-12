import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlaygroundBlueprint, extractVersionHint, isWordPressVersion, normalizePluginId, pluginLabelFromFilename, validateRecipe } from './recipe.js'

test('normalizes versioned plugin filenames into stable vault ids', () => {
  assert.equal(normalizePluginId('My Premium Plugin 2.4.zip'), 'my-premium-plugin')
  assert.equal(normalizePluginId('unblock-1.0.0-beta.7.zip'), 'unblock')
})

test('extracts a readable version hint from a plugin filename', () => {
  assert.equal(extractVersionHint('unblock-1.0.0-beta.7.zip'), '1.0.0-beta.7')
  assert.equal(extractVersionHint('plugin.zip'), '')
})

test('creates a readable label without the version suffix', () => {
  assert.equal(pluginLabelFromFilename('Unblock-1.0.0-beta.7.zip'), 'Unblock')
})

test('deduplicates plugin ids in a valid recipe', () => {
  const recipe = validateRecipe({ name: 'Demo', plugins: ['one', 'one'], repositoryPlugins: ['woocommerce', 'woocommerce'] })
  assert.deepEqual(recipe.plugins, ['one'])
  assert.deepEqual(recipe.repositoryPlugins, ['woocommerce'])
  assert.equal(recipe.theme, '')
  assert.throws(() => validateRecipe({ name: 'Unsafe directory plugin', repositoryPlugins: ['../plugin'] }), /directory slugs/i)
})

test('keeps one browser-local theme id in a recipe', () => {
  const recipe = validateRecipe({ name: 'Theme demo', plugins: [], theme: '  premium-theme  ' })
  assert.equal(recipe.theme, 'premium-theme')
  assert.throws(() => validateRecipe({ name: 'Broken theme', theme: ['one', 'two'] }), /theme must be/i)
  assert.throws(() => validateRecipe({ name: 'Two themes', theme: 'premium', repositoryTheme: 'astra' }), /either/i)
})

test('accepts historical WordPress version lines and exact releases', () => {
  assert.equal(isWordPressVersion('6.3'), true)
  assert.equal(isWordPressVersion('6.8.3'), true)
  assert.equal(isWordPressVersion('7.1-RC1'), true)
  assert.equal(validateRecipe({ name: 'Compatibility check', wordpress: '6.4' }).wordpress, '6.4')
  assert.throws(() => validateRecipe({ name: 'Invalid version', wordpress: 'six point four' }), /release number/i)
})

test('normalizes advanced environment settings', () => {
  const recipe = validateRecipe({
    name: 'Advanced demo',
    php: '8.5',
    storage: 'browser',
    language: 'nl_NL',
    multisite: true,
    siteTitle: ' Demo site ',
    tagline: ' Testing ',
    debug: true,
    debugLog: true,
    wpCli: true,
    wxrUrl: 'https://example.com/content.xml',
  })

  assert.equal(recipe.siteTitle, 'Demo site')
  assert.equal(recipe.storage, 'browser')
  assert.equal(recipe.wxrUrl, 'https://example.com/content.xml')
  assert.throws(() => validateRecipe({ name: 'Unsafe import', wxrUrl: 'http://example.com/data.xml' }), /HTTPS/i)
})

test('builds a valid advanced Playground blueprint', () => {
  const blueprint = buildPlaygroundBlueprint({
    name: 'Advanced demo',
    language: 'nl_NL',
    multisite: true,
    intl: true,
    debug: true,
    debugLog: true,
    wpCli: true,
    wxrUrl: 'https://example.com/content.xml',
  })

  assert.deepEqual(blueprint.features, { networking: true, intl: true })
  assert.deepEqual(blueprint.extraLibraries, ['wp-cli'])
  assert.equal(blueprint.steps.some((step) => step.step === 'enableMultisite'), true)
  assert.equal(blueprint.steps.some((step) => step.step === 'setSiteLanguage' && step.language === 'nl_NL'), true)
  assert.equal(blueprint.steps.some((step) => step.step === 'importWxr'), true)
  assert.equal(blueprint.steps[0].consts.WP_DEBUG_LOG, true)

  const resumed = buildPlaygroundBlueprint({ name: 'Advanced demo', multisite: true, wxrUrl: 'https://example.com/content.xml' }, { includeOneTimeSetup: false })
  assert.equal(resumed.steps.some((step) => step.step === 'enableMultisite' || step.step === 'importWxr'), false)
})

test('installs WordPress.org plugins through official Blueprint resources', () => {
  const blueprint = buildPlaygroundBlueprint({ name: 'Directory demo', repositoryPlugins: ['woocommerce'] })
  assert.deepEqual(blueprint.steps.find((step) => step.step === 'installPlugin'), {
    step: 'installPlugin',
    pluginData: { resource: 'wordpress.org/plugins', slug: 'woocommerce' },
    options: { activate: true, targetFolderName: 'woocommerce' },
    ifAlreadyInstalled: 'overwrite',
  })
})

test('installs and activates a WordPress.org theme through an official Blueprint resource', () => {
  const blueprint = buildPlaygroundBlueprint({ name: 'Theme directory demo', repositoryTheme: 'astra' })
  assert.deepEqual(blueprint.steps.find((step) => step.step === 'installTheme'), {
    step: 'installTheme',
    themeData: { resource: 'wordpress.org/themes', slug: 'astra' },
    options: { activate: true, targetFolderName: 'astra' },
    ifAlreadyInstalled: 'overwrite',
  })
})

test('rejects recipes containing a license key field', () => {
  assert.throws(
    () => validateRecipe({ name: 'Unsafe', plugins: [], licenseKey: 'do-not-store-this' }),
    /may not contain license keys/i,
  )
})
