import { normalizePluginId, validateRecipe } from './recipe.js'

export const SAVED_RECIPES_KEY = 'private-playground-launcher:saved-recipes'
export const SAVED_RECIPES_READ_ERROR = 'Saved recipes could not be read. Stored data was kept.'

export function parseSavedRecipes(serialized) {
  if (serialized == null) return []
  try {
    const records = JSON.parse(serialized)
    if (!Array.isArray(records)) throw new Error(SAVED_RECIPES_READ_ERROR)
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
    throw new Error(SAVED_RECIPES_READ_ERROR)
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

export async function updateSavedRecipes(storage, update, locks = globalThis.navigator?.locks) {
  const write = () => {
    const records = update(parseSavedRecipes(storage.getItem(SAVED_RECIPES_KEY)))
    storage.setItem(SAVED_RECIPES_KEY, serializeSavedRecipes(records))
    return records
  }
  // Serialize cooperating tabs where Web Locks are available; always read at write time.
  return locks ? locks.request(SAVED_RECIPES_KEY, write) : write()
}
