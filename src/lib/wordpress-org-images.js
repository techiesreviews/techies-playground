// Directory artwork is shown only when it is served over HTTPS from the one WordPress.org
// image host the caller names; anything else becomes '' so the card shows no image.
export function normalizeWordPressOrgImageUrl(value, allowedHostname) {
  if (typeof value !== 'string' || !value) return ''
  const normalized = value.startsWith('//') ? `https:${value}` : value
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' && url.hostname === allowedHostname ? url.href : ''
  } catch {
    return ''
  }
}
