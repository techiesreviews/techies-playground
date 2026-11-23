import { normalizePluginId, validateRecipe } from './recipe.js'
import { parseSavedRecipes, replaceSavedRecipe, SAVED_RECIPES_KEY, SAVED_RECIPES_READ_ERROR, updateSavedRecipes, upsertSavedRecipe } from './saved-recipes.js'

export function createRecipeLibrary(storage, locks = globalThis.navigator?.locks) {
  const inFlight = new Set()
  let clearVersion = 0
  const byId = new Map()
  const byRecord = new WeakMap()

  function isRemoved(entry) {
    return Boolean(entry.removed || (entry.version !== undefined && entry.version !== clearVersion))
  }

  function identity(record) {
    let entry = byRecord.get(record)
    if (!entry) {
      entry = byId.get(record.id)
      const recordVersion = JSON.stringify(record)
      if (entry && entry.recordVersion !== recordVersion) entry.removed = true
      if (!entry || isRemoved(entry)) entry = { id: record.id, version: clearVersion, recordVersion }
      byId.set(record.id, entry)
      byRecord.set(record, entry)
    }
    return entry
  }

  function snapshot() {
    const records = parseSavedRecipes(storage.getItem(SAVED_RECIPES_KEY))
    records.forEach(identity)
    return records
  }

  function read() {
    try {
      return { records: snapshot(), error: '' }
    } catch {
      return { records: [], error: SAVED_RECIPES_READ_ERROR }
    }
  }

  function enqueue(entry, operation) {
    const result = entry.pending ? entry.pending.then(operation, operation) : operation()
    entry.pending = result
    inFlight.add(result)
    const finished = () => {
      inFlight.delete(result)
      if (entry.pending === result) entry.pending = null
    }
    result.then(finished, finished)
    return result
  }

  function checkCurrent(entry, records) {
    const record = records.find((item) => item.id === entry.id)
    if (record && entry.recordVersion && JSON.stringify(record) !== entry.recordVersion) {
      entry.removed = true
      throw new Error('This saved recipe changed in another tab. Select its latest version before updating or removing it.')
    }
    return record
  }

  function save(candidate, entry = { id: '' }) {
    const recipe = validateRecipe(candidate)
    const id = normalizePluginId(recipe.name) || 'recipe'
    entry.version ??= clearVersion
    return enqueue(entry, async () => {
      const records = await updateSavedRecipes(storage, (current) => {
        if (isRemoved(entry) || (entry.id && !checkCurrent(entry, current))) {
          entry.removed = true
          throw new Error('This saved recipe was removed. Save the draft as a new recipe.')
        }
        return entry.id ? replaceSavedRecipe(current, entry.id, recipe) : upsertSavedRecipe(current, recipe)
      }, locks)
      if (byId.get(entry.id) === entry) byId.delete(entry.id)
      entry.id = id
      entry.recordVersion = JSON.stringify(records.find((record) => record.id === id))
      if (!isRemoved(entry)) byId.set(id, entry)
      records.forEach(identity)
      return records
    })
  }

  function remove(record) {
    const entry = identity(record)
    return enqueue(entry, async () => {
      const records = await updateSavedRecipes(storage, (current) => {
        if (isRemoved(entry)) return current
        checkCurrent(entry, current)
        return current.filter((item) => item.id !== entry.id)
      }, locks)
      entry.removed = true
      if (byId.get(entry.id) === entry) byId.delete(entry.id)
      records.forEach(identity)
      return records
    })
  }

  function resolve(record) {
    const entry = identity(record)
    return enqueue(entry, async () => {
      const records = snapshot()
      return { records, record: isRemoved(entry) ? null : records.find((item) => item.id === entry.id) || null }
    })
  }

  function refresh(clear = false) {
    // An external clear invalidates even a new draft whose first write is waiting for its lock.
    if (clear) { clearVersion += 1; byId.clear() }
    return Promise.allSettled([...inFlight]).then(() => {
      const records = snapshot()
      const ids = new Set(records.map((record) => record.id))
      for (const [id, entry] of byId) {
        if (!ids.has(id)) { entry.removed = true; byId.delete(id) }
      }
      return records
    })
  }

  return { identity, isRemoved, snapshot, read, save, remove, resolve, refresh }
}
