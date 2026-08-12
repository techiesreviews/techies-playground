const THEME_DIRECTORY_API = 'https://api.wordpress.org/themes/info/1.2/'
const THEME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isWordPressOrgThemeSlug(value) {
  return typeof value === 'string' && value.length <= 100 && THEME_SLUG.test(value)
}

function normalizeImageUrl(value) {
  if (typeof value !== 'string' || !value) return ''
  const normalized = value.startsWith('//') ? `https:${value}` : value
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' && url.hostname === 'ts.w.org' ? url.href : ''
  } catch {
    return ''
  }
}

export function normalizeWordPressOrgThemeResults(payload) {
  if (!payload || !Array.isArray(payload.themes)) throw new Error('WordPress.org returned an invalid theme list.')
  return payload.themes.flatMap((theme) => {
    if (!theme || !isWordPressOrgThemeSlug(theme.slug) || typeof theme.name !== 'string') return []
    return [{
      slug: theme.slug,
      name: theme.name.trim() || theme.slug,
      version: typeof theme.version === 'string' ? theme.version : '',
      author: typeof theme.author === 'string' ? theme.author.replace(/<[^>]*>/g, '').trim() : '',
      rating: Number.isFinite(theme.rating) ? theme.rating : 0,
      image: normalizeImageUrl(theme.screenshot_url),
    }]
  })
}

export async function searchWordPressOrgThemes(query, { signal, fetchImpl = fetch } = {}) {
  const search = String(query || '').trim()
  if (search.length < 2) return []
  const parameters = new URLSearchParams({
    action: 'query_themes',
    'request[search]': search,
    'request[page]': '1',
    'request[per_page]': '12',
    'request[fields][description]': '0',
    'request[fields][sections]': '0',
    'request[fields][screenshot_url]': '1',
  })
  const response = await fetchImpl(`${THEME_DIRECTORY_API}?${parameters}`, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`WordPress.org theme search failed with status ${response.status}.`)
  return normalizeWordPressOrgThemeResults(await response.json())
}
