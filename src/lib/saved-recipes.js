import { normalizePluginId, validateRecipe } from './recipe.js'

export const SAVED_RECIPES_KEY = 'private-playground-launcher:saved-recipes'

export function parseSavedRecipes(serialized) {
  if (!serialized) return []
  try {
    const records = JSON.parse(serialized)
    if (!Array.isArray(records)) return []
    return records.flatMap((record) => {
      try {
        if (!record || typeof record !== 'object') return []
        return [{
          id: String(record.id || normalizePluginId(record.recipe?.name || '') || 'recipe'),
          savedAt: String(record.savedAt || ''),
          recipe: validateRecipe(record.recipe),
        }]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

export function upsertSavedRecipe(records, candidate, savedAt = new Date().toISOString()) {
  const recipe = validateRecipe(candidate)
  const id = normalizePluginId(recipe.name) || 'recipe'
  return [
    { id, savedAt, recipe },
    ...records.filter((record) => record.id !== id),
  ]
}

export function replaceSavedRecipe(records, recordId, candidate, savedAt = new Date().toISOString()) {
  const recipe = validateRecipe(candidate)
  const id = normalizePluginId(recipe.name) || 'recipe'
  return [
    { id, savedAt, recipe },
    ...records.filter((record) => record.id !== recordId && record.id !== id),
  ]
}

export function serializeSavedRecipes(records) {
  return JSON.stringify(records.map((record) => ({
    id: record.id,
    savedAt: record.savedAt,
    recipe: validateRecipe(record.recipe),
  })))
}
