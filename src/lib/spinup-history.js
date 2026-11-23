import { extractVersionHint, pluginLabelFromFilename, validateRecipe } from './recipe.js'
import { persistedSiteId } from './playground-persistence.js'

export const SPINUP_HISTORY_KEY = 'private-playground-launcher:spinup-history'
export const MAX_SPINUP_HISTORY = 30
export const SPINUP_HISTORY_READ_ERROR = 'Past spin-ups could not be read. Stored data was kept.'

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

function normalizeSpinup(candidate, fallbackId) {
  if (!candidate || typeof candidate !== 'object') throw new Error('Spin-up history entry must be an object.')
  const launchedAt = new Date(candidate.launchedAt)
  if (Number.isNaN(launchedAt.getTime())) throw new Error('Spin-up history entry has an invalid date.')

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : fallbackId || crypto.randomUUID(),
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
  if (serialized == null) return []
  try {
    const parsed = JSON.parse(serialized)
    if (!Array.isArray(parsed)) throw new Error(SPINUP_HISTORY_READ_ERROR)
    const ids = new Set(parsed.map((candidate) => candidate?.id))
    return keepLatestBrowserEnvironment(parsed.flatMap((candidate, index) => {
      try {
        let fallbackId = `legacy-spinup-${index}`
        while (ids.has(fallbackId)) fallbackId = `_${fallbackId}`
        ids.add(fallbackId)
        return [normalizeSpinup(candidate, fallbackId)]
      } catch {
        return []
      }
    })).slice(0, MAX_SPINUP_HISTORY)
  } catch {
    throw new Error(SPINUP_HISTORY_READ_ERROR)
  }
}

export function readSpinupHistory(storage) {
  try {
    return { records: parseSpinupHistory(storage.getItem(SPINUP_HISTORY_KEY)), error: '' }
  } catch {
    return { records: [], error: SPINUP_HISTORY_READ_ERROR }
  }
}

export function updateSpinupHistory(storage, update) {
  const records = update(parseSpinupHistory(storage.getItem(SPINUP_HISTORY_KEY)))
  storage.setItem(SPINUP_HISTORY_KEY, serializeSpinupHistory(records))
  return records
}

export function appendSpinup(records, { recipe, plugins, theme }, launchedAt = new Date().toISOString(), id = crypto.randomUUID()) {
  const record = normalizeSpinup({ id, launchedAt, recipe, plugins, theme })
  return keepLatestBrowserEnvironment([record, ...records]).slice(0, MAX_SPINUP_HISTORY)
}

export function serializeSpinupHistory(records) {
  return JSON.stringify(keepLatestBrowserEnvironment(records.map(normalizeSpinup)).slice(0, MAX_SPINUP_HISTORY))
}
