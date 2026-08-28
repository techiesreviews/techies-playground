const PLUGIN_DIRECTORY_API = 'https://api.wordpress.org/plugins/info/1.2/'
const PLUGIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function normalizeImageUrl(value) {
  if (typeof value !== 'string' || !value) return ''
  const normalized = value.startsWith('//') ? `https:${value}` : value
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' && url.hostname === 'ps.w.org' ? url.href : ''
  } catch {
    return ''
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function isWordPressOrgPluginSlug(value) {
  return typeof value === 'string' && value.length <= 100 && PLUGIN_SLUG.test(value)
}

export function normalizeWordPressOrgPluginResults(payload) {
  if (!payload || !Array.isArray(payload.plugins)) throw new Error('WordPress.org returned an invalid plugin list.')

  return payload.plugins.flatMap((plugin) => {
    if (!plugin || !isWordPressOrgPluginSlug(plugin.slug) || typeof plugin.name !== 'string') return []
    return [{
      slug: plugin.slug,
      name: decodeHtmlEntities(plugin.name.trim()) || plugin.slug,
      version: typeof plugin.version === 'string' ? plugin.version : '',
      author: typeof plugin.author === 'string' ? plugin.author.replace(/<[^>]*>/g, '').trim() : '',
      activeInstalls: Number.isSafeInteger(plugin.active_installs) ? plugin.active_installs : 0,
      tested: typeof plugin.tested === 'string' ? plugin.tested : '',
      image: normalizeImageUrl(plugin.icons?.svg || plugin.icons?.['2x'] || plugin.icons?.['1x'] || plugin.icons?.default),
    }]
  })
}

function buildPluginDirectoryParameters({ search = '', browse = '', perPage = 12 }) {
  const parameters = new URLSearchParams({
    action: 'query_plugins',
    'request[page]': '1',
    'request[per_page]': String(perPage),
    'request[fields][description]': '0',
    'request[fields][short_description]': '0',
    'request[fields][sections]': '0',
    'request[fields][icons]': '1',
    'request[fields][banners]': '0',
  })
  if (search) parameters.set('request[search]', search)
  if (browse) parameters.set('request[browse]', browse)
  return parameters
}

async function queryWordPressOrgPlugins(parameters, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${PLUGIN_DIRECTORY_API}?${parameters}`, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`WordPress.org plugin request failed with status ${response.status}.`)
  return normalizeWordPressOrgPluginResults(await response.json())
}

export function fetchFeaturedWordPressOrgPlugins(options = {}) {
  return queryWordPressOrgPlugins(buildPluginDirectoryParameters({ browse: 'featured', perPage: 8 }), options)
}

export async function searchWordPressOrgPlugins(query, { signal, fetchImpl = fetch } = {}) {
  const search = String(query || '').trim()
  if (search.length < 2) return []
  return queryWordPressOrgPlugins(buildPluginDirectoryParameters({ search }), { signal, fetchImpl })
}
