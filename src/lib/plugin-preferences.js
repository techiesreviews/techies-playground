export const PLUGIN_RECENCY_KEY = 'private-playground-launcher:plugin-recency'
export const THEME_RECENCY_KEY = 'private-playground-launcher:theme-recency'

export function parsePluginRecency(serialized) {
  if (!serialized) return {}
  try {
    const parsed = JSON.parse(serialized)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([id, timestamp]) => (
      typeof id === 'string' && id && Number.isFinite(timestamp) && timestamp >= 0
    )))
  } catch {
    return {}
  }
}

export function markPluginSelected(recency, id, timestamp = Date.now()) {
  if (typeof id !== 'string' || !id || !Number.isFinite(timestamp)) return recency
  return { ...recency, [id]: timestamp }
}

export function forgetPluginRecency(recency, id) {
  const next = { ...recency }
  delete next[id]
  return next
}

export function sortAndFilterPlugins(plugins, recency, query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return plugins
    .filter((plugin) => {
      if (!normalizedQuery) return true
      return [plugin.label, plugin.id, plugin.filename, plugin.versionHint]
        .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(normalizedQuery))
    })
    .toSorted((first, second) => {
      const recencyDifference = (recency[second.id] || 0) - (recency[first.id] || 0)
      if (recencyDifference) return recencyDifference
      return (first.label || first.id).localeCompare(second.label || second.id, undefined, { sensitivity: 'base' })
    })
}
