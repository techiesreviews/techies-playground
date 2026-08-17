import { extractVersionHint, pluginLabelFromFilename, validateRecipe } from './recipe.js'
import { persistedSiteId } from './playground-persistence.js'

export const SPINUP_HISTORY_KEY = 'private-playground-launcher:spinup-history'
export const MAX_SPINUP_HISTORY = 30

function normalizePackageSummary(item) {
  if (!item || typeof item.id !== 'string' || !item.id.trim()) return null
  const labelSource = typeof item.filename === 'string' && item.filename
    ? item.filename
    : (typeof item.label === 'string' && item.label ? item.label : item.id)
  return {
    id: item.id,
    label: pluginLabelFromFilename(labelSource) || item.id,
    version: [item.version, item.versionHint, extractVersionHint(labelSource)]
      .find((value) => typeof value === 'string' && value.trim())?.trim() || '',
  }
}

function normalizeSpinup(candidate) {
  if (!candidate || typeof candidate !== 'object') throw new Error('Spin-up history entry must be an object.')
  const launchedAt = new Date(candidate.launchedAt)
  if (Number.isNaN(launchedAt.getTime())) throw new Error('Spin-up history entry has an invalid date.')

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
    launchedAt: launchedAt.toISOString(),
    recipe: validateRecipe(candidate.recipe),
    plugins: Array.isArray(candidate.plugins) ? candidate.plugins.map(normalizePackageSummary).filter(Boolean) : [],
    theme: normalizePackageSummary(candidate.theme),
  }
}

function keepLatestBrowserEnvironment(records) {
  const seen = new Set()
  return records.filter((record) => {
    if (record.recipe.storage !== 'browser') return true
    const environmentId = persistedSiteId(record.recipe)
    if (seen.has(environmentId)) return false
    seen.add(environmentId)
    return true
  })
}

export function parseSpinupHistory(serialized) {
  if (!serialized) return []
  try {
    const parsed = JSON.parse(serialized)
    if (!Array.isArray(parsed)) return []
    return keepLatestBrowserEnvironment(parsed.flatMap((candidate) => {
      try {
        return [normalizeSpinup(candidate)]
      } catch {
        return []
      }
    })).slice(0, MAX_SPINUP_HISTORY)
  } catch {
    return []
  }
}

export function appendSpinup(records, { recipe, plugins, theme }, launchedAt = new Date().toISOString(), id = crypto.randomUUID()) {
  const record = normalizeSpinup({ id, launchedAt, recipe, plugins, theme })
  return keepLatestBrowserEnvironment([record, ...records]).slice(0, MAX_SPINUP_HISTORY)
}

export function serializeSpinupHistory(records) {
  return JSON.stringify(keepLatestBrowserEnvironment(records.map(normalizeSpinup)).slice(0, MAX_SPINUP_HISTORY))
}
