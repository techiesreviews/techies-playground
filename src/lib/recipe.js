export const DEFAULT_RECIPE = Object.freeze({
  schemaVersion: 1,
  name: 'Untitled playground',
  wordpress: 'latest',
  php: '8.3',
  networking: true,
  intl: false,
  storage: 'temporary',
  language: 'en_US',
  multisite: false,
  siteTitle: 'My WordPress Website',
  tagline: '',
  permalinkStructure: '/%postname%/',
  debug: false,
  debugLog: false,
  scriptDebug: false,
  wpCli: false,
  wxrUrl: '',
  phpExtensionManifestUrl: '',
  landingPage: '/wp-admin/plugins.php',
  plugins: [],
  repositoryPlugins: [],
  theme: '',
  repositoryTheme: '',
})

const PHP_VERSIONS = new Set(['7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
const STORAGE_MODES = new Set(['temporary', 'browser'])
const PERMALINK_STRUCTURES = new Set(['', '/%postname%/', '/%year%/%monthnum%/%postname%/'])
const LOCALE = /^[a-z]{2,3}_[A-Z]{2}(?:_[A-Za-z0-9]+)?$/
const WORDPRESS_ORG_PLUGIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WP_CHANNELS = new Set(['latest', 'beta', 'nightly'])
const WP_RELEASE = /^\d+\.\d+(?:\.\d+)?(?:-(?:beta\d+|rc\d+))?$/i
const VERSION_SUFFIX = /(?:[-_.\s]+v?\d+(?:\.\d+){1,3}(?:[-_.]?(?:alpha|beta|rc)(?:[-_.]?\d+)?)?)$/i

export function isWordPressVersion(value) {
  return typeof value === 'string' && (WP_CHANNELS.has(value) || WP_RELEASE.test(value))
}

function normalizeOptionalUrl(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a URL or empty.`)
  const trimmed = value.trim()
  if (!trimmed) return ''
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`${label} must be a valid URL.`)
  }
  const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !isLocalHttp) throw new Error(`${label} must use HTTPS.`)
  return parsed.href
}

export function pluginLabelFromFilename(filename) {
  const basename = filename.replace(/\.zip$/i, '')
  return (basename.replace(VERSION_SUFFIX, '') || basename).replace(/[-_.]+/g, ' ').trim()
}

export function normalizePluginId(filename) {
  const basename = filename.replace(/\.zip$/i, '')
  const withoutVersion = basename.replace(VERSION_SUFFIX, '')

  return (withoutVersion || basename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

export function extractVersionHint(filename) {
  const match = filename
    .replace(/\.zip$/i, '')
    .match(/(?:^|[-_.\s])v?(\d+(?:\.\d+){1,3}(?:[-_.]?(?:alpha|beta|rc)(?:[-_.]?\d+)?)?)$/i)
  return match?.[1]?.replace(/_/g, '.') ?? ''
}

export function validateRecipe(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Recipe must be a JSON object.')
  }

  const recipe = { ...DEFAULT_RECIPE, ...candidate }
  if (recipe.schemaVersion !== 1) throw new Error('Unsupported recipe version.')
  if (typeof recipe.name !== 'string' || !recipe.name.trim()) throw new Error('Recipe name is required.')
  if (!isWordPressVersion(recipe.wordpress)) {
    throw new Error('WordPress must be a release number, latest, beta, or nightly.')
  }
  if (!PHP_VERSIONS.has(recipe.php)) throw new Error('Unsupported PHP version.')
  if (typeof recipe.networking !== 'boolean') throw new Error('Networking must be true or false.')
  if (typeof recipe.intl !== 'boolean') throw new Error('Intl support must be true or false.')
  if (!STORAGE_MODES.has(recipe.storage)) throw new Error('Storage must be temporary or browser.')
  if (typeof recipe.language !== 'string' || !LOCALE.test(recipe.language)) throw new Error('WordPress language must be a locale such as en_US.')
  if (typeof recipe.multisite !== 'boolean') throw new Error('Multisite must be true or false.')
  if (typeof recipe.siteTitle !== 'string') throw new Error('Site title must be text.')
  if (typeof recipe.tagline !== 'string') throw new Error('Tagline must be text.')
  if (!PERMALINK_STRUCTURES.has(recipe.permalinkStructure)) throw new Error('Unsupported permalink structure.')
  if (typeof recipe.debug !== 'boolean' || typeof recipe.debugLog !== 'boolean' || typeof recipe.scriptDebug !== 'boolean') {
    throw new Error('Debug settings must be true or false.')
  }
  if (typeof recipe.wpCli !== 'boolean') throw new Error('WP-CLI support must be true or false.')
  if (typeof recipe.landingPage !== 'string' || !recipe.landingPage.startsWith('/')) {
    throw new Error('Landing page must be an absolute WordPress path.')
  }
  if (!Array.isArray(recipe.plugins) || recipe.plugins.some((id) => typeof id !== 'string')) {
    throw new Error('Plugins must be an array of local vault IDs.')
  }
  if (!Array.isArray(recipe.repositoryPlugins) || recipe.repositoryPlugins.some((slug) => (
    typeof slug !== 'string' || slug.length > 100 || !WORDPRESS_ORG_PLUGIN_SLUG.test(slug)
  ))) {
    throw new Error('WordPress.org plugins must be an array of valid directory slugs.')
  }
  if (typeof recipe.theme !== 'string') throw new Error('Theme must be a local vault ID or an empty string.')
  if (typeof recipe.repositoryTheme !== 'string' || (recipe.repositoryTheme && (
    recipe.repositoryTheme.length > 100 || !WORDPRESS_ORG_PLUGIN_SLUG.test(recipe.repositoryTheme)
  ))) throw new Error('WordPress.org theme must be a valid directory slug or empty.')
  if (recipe.theme && recipe.repositoryTheme) throw new Error('Choose either a browser-local theme or a WordPress.org theme.')

  const serialized = JSON.stringify(candidate).toLowerCase()
  const forbidden = ['licensekey', 'license_key', 'license-key', 'api_key', 'apikey', 'secret']
  if (forbidden.some((field) => serialized.includes(`\"${field}\"`))) {
    throw new Error('Recipes may not contain license keys or secrets.')
  }

  return {
    schemaVersion: 1,
    name: recipe.name.trim().slice(0, 80),
    wordpress: recipe.wordpress,
    php: recipe.php,
    networking: recipe.networking,
    intl: recipe.intl,
    storage: recipe.storage,
    language: recipe.language,
    multisite: recipe.multisite,
    siteTitle: recipe.siteTitle.trim().slice(0, 120),
    tagline: recipe.tagline.trim().slice(0, 240),
    permalinkStructure: recipe.permalinkStructure,
    debug: recipe.debug,
    debugLog: recipe.debugLog,
    scriptDebug: recipe.scriptDebug,
    wpCli: recipe.wpCli,
    wxrUrl: normalizeOptionalUrl(recipe.wxrUrl, 'WXR import'),
    phpExtensionManifestUrl: normalizeOptionalUrl(recipe.phpExtensionManifestUrl, 'PHP extension manifest'),
    landingPage: recipe.landingPage,
    plugins: [...new Set(recipe.plugins)],
    repositoryPlugins: [...new Set(recipe.repositoryPlugins)],
    theme: recipe.theme.trim(),
    repositoryTheme: recipe.repositoryTheme.trim(),
  }
}

export function buildPlaygroundBlueprint(candidate, { includeOneTimeSetup = true } = {}) {
  const recipe = validateRecipe(candidate)
  const steps = [
    {
      step: 'defineWpConfigConsts',
      consts: {
        WP_DEBUG: recipe.debug,
        WP_DEBUG_LOG: recipe.debug && recipe.debugLog,
        WP_DEBUG_DISPLAY: recipe.debug,
        SCRIPT_DEBUG: recipe.scriptDebug,
      },
    },
    {
      step: 'setSiteOptions',
      options: {
        blogname: recipe.siteTitle,
        blogdescription: recipe.tagline,
        permalink_structure: recipe.permalinkStructure,
      },
    },
  ]

  if (recipe.language !== 'en_US') steps.push({ step: 'setSiteLanguage', language: recipe.language })
  if (includeOneTimeSetup && recipe.multisite) steps.push({ step: 'enableMultisite' })
  if (includeOneTimeSetup && recipe.wxrUrl) {
    steps.push({
      step: 'importWxr',
      file: { resource: 'url', url: recipe.wxrUrl },
    })
  }
  for (const slug of recipe.repositoryPlugins) {
    steps.push({
      step: 'installPlugin',
      pluginData: { resource: 'wordpress.org/plugins', slug },
      options: { activate: true, targetFolderName: slug },
      ifAlreadyInstalled: 'overwrite',
    })
  }
  if (recipe.repositoryTheme) {
    steps.push({
      step: 'installTheme',
      themeData: { resource: 'wordpress.org/themes', slug: recipe.repositoryTheme },
      options: { activate: true, targetFolderName: recipe.repositoryTheme },
      ifAlreadyInstalled: 'overwrite',
    })
  }
  steps.push({ step: 'login' })

  return {
    landingPage: recipe.landingPage,
    preferredVersions: { php: recipe.php, wp: recipe.wordpress },
    features: { networking: recipe.networking, intl: recipe.intl },
    ...(recipe.wpCli ? { extraLibraries: ['wp-cli'] } : {}),
    steps,
  }
}

export function downloadRecipe(recipe) {
  const safeRecipe = validateRecipe(recipe)
  const blob = new Blob([`${JSON.stringify(safeRecipe, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${normalizePluginId(safeRecipe.name) || 'playground'}.recipe.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
