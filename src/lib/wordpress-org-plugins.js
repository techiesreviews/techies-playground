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

export function isWordPressOrgPluginSlug(value) {
  return typeof value === 'string' && value.length <= 100 && PLUGIN_SLUG.test(value)
}

export function normalizeWordPressOrgPluginResults(payload) {
  if (!payload || !Array.isArray(payload.plugins)) throw new Error('WordPress.org returned an invalid plugin list.')

  return payload.plugins.flatMap((plugin) => {
    if (!plugin || !isWordPressOrgPluginSlug(plugin.slug) || typeof plugin.name !== 'string') return []
    return [{
      slug: plugin.slug,
      name: plugin.name.trim() || plugin.slug,
      version: typeof plugin.version === 'string' ? plugin.version : '',
      author: typeof plugin.author === 'string' ? plugin.author.replace(/<[^>]*>/g, '').trim() : '',
      activeInstalls: Number.isSafeInteger(plugin.active_installs) ? plugin.active_installs : 0,
      tested: typeof plugin.tested === 'string' ? plugin.tested : '',
      image: normalizeImageUrl(plugin.icons?.svg || plugin.icons?.['2x'] || plugin.icons?.['1x'] || plugin.icons?.default),
    }]
  })
}

export async function searchWordPressOrgPlugins(query, { signal, fetchImpl = fetch } = {}) {
  const search = String(query || '').trim()
  if (search.length < 2) return []

  const parameters = new URLSearchParams({
    action: 'query_plugins',
    'request[search]': search,
    'request[page]': '1',
    'request[per_page]': '12',
    'request[fields][description]': '0',
    'request[fields][short_description]': '0',
    'request[fields][sections]': '0',
    'request[fields][icons]': '1',
    'request[fields][banners]': '0',
  })
  const response = await fetchImpl(`${PLUGIN_DIRECTORY_API}?${parameters}`, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`WordPress.org plugin search failed with status ${response.status}.`)
  return normalizeWordPressOrgPluginResults(await response.json())
}
