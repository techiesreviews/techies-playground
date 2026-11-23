import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as savedRecipes from './lib/saved-recipes.js'
import * as history from './lib/spinup-history.js'
import { createRecipeLibrary } from './lib/recipe-library.js'
import * as recipes from './lib/recipe.js'
import { markPluginSelected } from './lib/plugin-preferences.js'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { createPackageUploadQueue, detectPackageType } from './lib/package-upload.js'
import { selectUploadedPlugin } from './lib/checks.js'

// Execute the actual App event handlers with state setters and storage in memory.
// This tests orchestration (including the former persistence effect), without pretending to render JSX.
const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
function handler(name, scope) {
  const match = source.match(new RegExp(`^( +)(?:async )?function ${name}\\(`, 'm'))
  assert.ok(match, `${name} exists`)
  const start = match.index
  const end = source.indexOf(`\n${match[1]}}`, start) + match[1].length + 2
  return Function(...Object.keys(scope), `return (${source.slice(start, end)})`)(...Object.values(scope))
}
function storage() {
  const values = new Map()
  let writes = 0
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { writes += 1; values.set(key, value) },
    removeItem: (key) => values.delete(key), clear: () => values.clear(),
    get writes() { return writes },
  }
}
function tab(localStorage, locks, actualLaunch = false) {
  const library = createRecipeLibrary(localStorage, locks)
  const initial = library.read()
  const state = {
    records: initial.records, storageError: initial.error,
    recipe: recipes.validateRecipe({ name: 'Draft' }),
    activeSavedId: '', editingSavedId: '', selectionMode: 'plugins', exports: [], launches: [], runtimeStarts: [],
  }
  const scope = {
    ...savedRecipes, ...recipes, localStorage,
    recipe: state.recipe, recipeEditRef: { current: 0 }, recipeSessionRef: { current: { entry: { id: '' } } },
    recipeLibraryRef: { current: library },
    launchIdRef: { current: 0 }, launchAbortRef: { current: null },
    updateSavedRecipes: (store, update) => savedRecipes.updateSavedRecipes(store, update, locks),
    setRecipe: (next) => { scope.recipe = state.recipe = typeof next === 'function' ? next(state.recipe) : next },
    setSavedRecipeStorage: (next) => { state.records = next.records; state.storageError = next.error },
    setActiveSavedId: (next) => { scope.activeSavedId = state.activeSavedId = typeof next === 'function' ? next(state.activeSavedId) : next },
    setEditingSavedId: (next) => { scope.editingSavedId = state.editingSavedId = typeof next === 'function' ? next(state.editingSavedId) : next },
    setSelectionMode: (mode) => { state.selectionMode = mode },
    setActiveSpinupId() {},
    activeSavedId: '', editingSavedId: '', setError: (error) => { state.error = error },
    downloadRecipe: (recipe) => state.exports.push(structuredClone(recipe)),
    launch: (recipe) => state.launches.push(structuredClone(recipe)),
  }
  scope.saveRecipeToLibrary = (...args) => handler('saveRecipeToLibrary', scope)(...args)
  scope.applySavedRecipes = (...args) => handler('applySavedRecipes', scope)(...args)
  scope.reloadSavedRecipes = () => handler('reloadSavedRecipes', scope)()
  scope.stopEditingRecipe = () => handler('stopEditingRecipe', scope)()
  scope.loadSavedRecipe = (...args) => handler('loadSavedRecipe', scope)(...args)
  scope.chooseSavedRecipe = (...args) => handler('chooseSavedRecipe', scope)(...args)
  scope.refreshSavedRecipes = (...args) => handler('refreshSavedRecipes', scope)(...args)
  if (actualLaunch) {
    const runtime = {
      ...recipes, licenseRecords: [], plugins: [], themes: [], resolveCheckPlugins: (recipe) => recipe,
      launchIdRef: scope.launchIdRef, launchAbortRef: scope.launchAbortRef, launchedRecipeRef: { current: null },
      savedKeyPackages: new Set(), checksInSetup: () => [], persistedSiteId: () => 'test-site',
      createLauncherScope: () => 'test-scope', readPersistedSites: () => new Set(),
      PLAYGROUND_READY_TIMEOUT_MS: 1000,
      startPlaygroundWithin: () => {
        state.runtimeStarts.push({ recipe: runtime.launchedRecipeRef.current, signal: runtime.launchAbortRef.current.signal })
        return new Promise(() => {})
      },
    }
    // Render setters are irrelevant here; execute the real launch counter, abort controller and runtime-start path.
    const launchSource = source.slice(source.indexOf('  async function launch('))
    for (const setter of launchSource.match(/\bset[A-Z]\w+/g)) runtime[setter] = () => {}
    scope.launch = (candidate) => handler('launch', runtime)(candidate)
  }
  const listeners = new Map()
  const window = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name) },
  }
  const storageListener = source.indexOf("window.addEventListener('storage'")
  const effectStart = source.lastIndexOf('  useEffect(() => {', storageListener)
  const effectBody = source.slice(source.indexOf('{', effectStart) + 1, source.indexOf('\n  }, [])', storageListener))
  const cleanup = Function(...Object.keys(scope), 'window', effectBody)(...Object.values(scope), window)
  const persistEffect = source.match(/useEffect\(\(\) => \{\n(    localStorage.setItem\(SAVED_RECIPES_KEY,[\s\S]*?)\n  }, \[savedRecipes\]\)/)?.[1]
  async function run(name, ...args) {
    const result = await handler(name, scope)(...args)
    if (persistEffect) Function('localStorage', 'savedRecipes', ...Object.keys(savedRecipes), persistEffect)(localStorage, state.records, ...Object.values(savedRecipes))
    return result
  }
  return {
    state, save: (...args) => run('saveRecipeToLibrary', ...args),
    remove: (id) => run('removeSavedRecipe', id, state.records.find((record) => record.id === id)),
    edit: (record) => run('editSavedRecipe', record), update: (patch) => run('updateRecipe', patch),
    choose: (record) => run('chooseSavedRecipe', record), start: (record) => run('startSavedRecipe', record),
    export: () => run('handleRecipeExport'),
    mainLaunch: () => scope.launch(scope.recipe),
    storageEvent: (event) => listeners.get('storage')?.(event), cleanup,
    saveCurrent: () => run('handleSaveRecipe'),
    importRecipe: (recipe) => run('handleRecipeImport', { target: { files: [{ text: async () => JSON.stringify(recipe) }], value: 'recipe.json' } }),
  }
}

function controlledLocks() {
  const requests = []
  const waiting = []
  return {
    request(name, write) {
      assert.equal(name, savedRecipes.SAVED_RECIPES_KEY)
      return new Promise((resolve, reject) => {
        requests.push(() => { try { resolve(write()) } catch (error) { reject(error) } })
        waiting.shift()?.()
      })
    },
    async finishNext() {
      if (!requests.length) await new Promise((resolve) => waiting.push(resolve))
      requests.shift()()
    },
  }
}

test('PG-01: two stale tabs saving distinct recipes keep both after reload', async () => {
  const localStorage = storage()
  const a = tab(localStorage)
  const b = tab(localStorage)
  await a.save({ name: 'Tab A' })
  await b.save({ name: 'Tab B' })
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['tab-b', 'tab-a'])
})

test('damaged recipes load with a notice and Save leaves their raw storage intact', async () => {
  const localStorage = storage()
  localStorage.setItem(savedRecipes.SAVED_RECIPES_KEY, '{damaged recipes')
  const library = createRecipeLibrary(localStorage, null)
  assert.deepEqual(library.read(), { records: [], error: savedRecipes.SAVED_RECIPES_READ_ERROR })
  const a = tab(localStorage, null)
  await a.saveCurrent()
  assert.match(a.state.error, /Recipe not saved/)
  assert.equal(a.state.storageError, savedRecipes.SAVED_RECIPES_READ_ERROR)
  assert.equal(localStorage.getItem(savedRecipes.SAVED_RECIPES_KEY), '{damaged recipes')
  await a.importRecipe({ name: 'Imported' })
  assert.match(a.state.error, /Recipe not saved/)
  assert.equal(a.state.storageError, savedRecipes.SAVED_RECIPES_READ_ERROR)
  await a.remove('missing')
  assert.equal(a.state.storageError, savedRecipes.SAVED_RECIPES_READ_ERROR)
  assert.match(a.state.error, /Recipe not removed/)
  assert.equal(localStorage.getItem(savedRecipes.SAVED_RECIPES_KEY), '{damaged recipes')
})

test('a damaged external library clears saved edit identity and shows only its inline notice', async () => {
  const localStorage = storage()
  const a = tab(localStorage, null)
  await a.save({ name: 'Original' })
  await a.edit(a.state.records[0])
  localStorage.setItem(savedRecipes.SAVED_RECIPES_KEY, '{damaged recipes')
  await a.storageEvent({ storageArea: localStorage, key: savedRecipes.SAVED_RECIPES_KEY })
  assert.equal(a.state.editingSavedId, '')
  assert.equal(a.state.activeSavedId, '')
  assert.equal(a.state.recipe.name, 'Original')
  assert.equal(a.state.storageError, savedRecipes.SAVED_RECIPES_READ_ERROR)
  assert.ok(!a.state.error)
})

test('page mount keeps damaged history without writing an empty list', () => {
  const localStorage = storage()
  localStorage.setItem(history.SPINUP_HISTORY_KEY, '{damaged history')
  const writes = localStorage.writes
  const stateStart = source.search(/^  const \[(?:spinupHistory|historyStorage),/m)
  const stateEnd = source.indexOf('\n', stateStart)
  const init = source.slice(stateStart, stateEnd)
  const useState = (initialize) => [initialize(), () => {}]
  Function('localStorage', 'useState', ...Object.keys(history), init)(localStorage, useState, ...Object.values(history))
  assert.equal(localStorage.getItem(history.SPINUP_HISTORY_KEY), '{damaged history')
  assert.equal(localStorage.writes, writes)
  let state = { records: [], error: '' }
  const save = handler('saveSpinupHistory', {
    ...history, localStorage,
    setHistoryStorage: (next) => { state = typeof next === 'function' ? next(state) : next },
  })
  assert.equal(save((records) => history.appendSpinup(records, { recipe: recipes.DEFAULT_RECIPE, plugins: [] })), false)
  assert.match(state.error, /Past spin-ups could not be read/)
  assert.equal(localStorage.getItem(history.SPINUP_HISTORY_KEY), '{damaged history')
  assert.equal(localStorage.writes, writes, 'a failed history append does not throw through launch cleanup')
  assert.doesNotMatch(source, /SPINUP_HISTORY_KEY|serializeSpinupHistory/)
  assert.equal((source.match(/\bupdateSpinupHistory\(/g) || []).length, 1)
})

test('a failed readable history write keeps rows and the active selection with a plain notice', () => {
  const records = history.appendSpinup([], { recipe: recipes.DEFAULT_RECIPE, plugins: [] }, '2026-08-01T12:00:00.000Z', 'active')
  const raw = history.serializeSpinupHistory(records)
  let state = { records, error: '' }
  let activeId = 'active'
  const localStorage = storage()
  localStorage.setItem(history.SPINUP_HISTORY_KEY, raw)
  localStorage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
  const scope = {
    ...history, localStorage, activeSpinupId: activeId,
    setActiveSpinupId: (id) => { activeId = id },
    setHistoryStorage: (next) => { state = typeof next === 'function' ? next(state) : next },
  }
  scope.saveSpinupHistory = handler('saveSpinupHistory', scope)
  assert.equal(scope.saveSpinupHistory((current) => history.appendSpinup(current, { recipe: recipes.DEFAULT_RECIPE, plugins: [] })), false)
  assert.deepEqual(state.records, records)
  assert.equal(state.error, 'Past spin-ups could not be saved. Stored data was kept.')
  handler('removeSpinup', scope)('active')
  assert.equal(activeId, 'active')
  assert.deepEqual(state.records, records)
  assert.equal(localStorage.getItem(history.SPINUP_HISTORY_KEY), raw)
})

test('PG-01: two stale libraries without Web Locks retain both recipes after reload', async () => {
  const localStorage = storage()
  const a = tab(localStorage, null)
  const b = tab(localStorage, null)
  await a.save({ name: 'Tab A' })
  await b.save({ name: 'Tab B' })
  assert.deepEqual(tab(localStorage, null).state.records.map((record) => record.id), ['tab-b', 'tab-a'])
})

test('PG-01: rename from a stale tab keeps another tab’s new recipe', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Old name' })
  const a = tab(localStorage)
  const b = tab(localStorage)
  await a.save({ name: 'Other recipe' })
  await b.save({ name: 'New name' }, 'old-name')
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['new-name', 'other-recipe'])
})

test('PG-01: stale-tab delete preserves new records and a later save does not resurrect deletions', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Delete me' })
  const a = tab(localStorage)
  const b = tab(localStorage)
  await a.save({ name: 'Keep me' })
  await b.remove('delete-me')
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['keep-me'])
  await a.save({ name: 'Another recipe' })
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['another-recipe', 'keep-me'])
})

test('PG-01: a delayed save keeps a newer edit and its rename replaces the old record', async () => {
  const localStorage = storage()
  const seed = tab(localStorage)
  await seed.save({ name: 'Recipe A' })
  await seed.save({ name: 'Recipe B' })
  const pending = []
  const locks = { request: (_name, write) => new Promise((resolve) => pending.push(() => resolve(write()))) }
  const a = tab(localStorage, locks)
  await a.edit(a.state.records.find((record) => record.id === 'recipe-a'))
  const savingA = a.saveCurrent()
  assert.equal(pending.length, 1, 'save A waits for its storage lock')

  await a.edit(a.state.records.find((record) => record.id === 'recipe-b'))
  await a.update({ name: 'Recipe B renamed' })
  pending.shift()()
  await savingA
  assert.equal(a.state.editingSavedId, 'recipe-b', 'save A must keep B in editing mode')
  assert.equal(a.state.recipe.name, 'Recipe B renamed')
  assert.equal(a.state.activeSavedId, '', 'save A must not select A over the edited draft')
  assert.equal(a.state.selectionMode, 'plugins', 'save A must not switch the current tab')

  const savingB = a.saveCurrent()
  pending.shift()()
  await savingB
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['recipe-b-renamed', 'recipe-a'])
  assert.equal(a.state.editingSavedId, '', 'the current save still completes normally')
  assert.equal(a.state.activeSavedId, 'recipe-b-renamed')
  assert.equal(a.state.selectionMode, 'recipes')
})

test('PG-01: a delayed removal keeps the recipe now being edited', async () => {
  const localStorage = storage()
  const seed = tab(localStorage)
  await seed.save({ name: 'Recipe A' })
  await seed.save({ name: 'Recipe B' })
  let finishRemoval
  const locks = { request: (_name, write) => new Promise((resolve) => { finishRemoval = () => resolve(write()) }) }
  const a = tab(localStorage, locks)
  await a.edit(a.state.records.find((record) => record.id === 'recipe-a'))
  const removingA = a.remove('recipe-a')
  await a.edit(a.state.records.find((record) => record.id === 'recipe-b'))
  finishRemoval()
  await removingA
  assert.equal(a.state.editingSavedId, 'recipe-b')
  assert.equal(a.state.activeSavedId, 'recipe-b')
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['recipe-b'])
})

test('PG-01: importing during an edit never gives the imported draft the old editing identity', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Recipe A' })
  const pending = []
  const entered = Promise.withResolvers()
  const locks = { request: (name, write) => {
    assert.equal(name, savedRecipes.SAVED_RECIPES_KEY)
    return new Promise((resolve) => {
      pending.push(() => resolve(write()))
      entered.resolve()
    })
  } }
  const a = tab(localStorage, locks)
  await a.edit(a.state.records[0])
  const importingB = a.importRecipe({ name: 'Recipe B', siteTitle: 'Imported title' })
  await entered.promise
  await a.update({ siteTitle: 'New title while import waits' })
  pending.shift()()
  await importingB
  const savingB = a.saveCurrent()
  pending.shift()()
  await savingB

  const reloaded = tab(localStorage).state.records
  assert.deepEqual(reloaded.map((record) => record.id), ['recipe-b', 'recipe-a'])
  assert.equal(reloaded.find((record) => record.id === 'recipe-b').recipe.siteTitle, 'New title while import waits')
  assert.equal(reloaded.find((record) => record.id === 'recipe-a').recipe.name, 'Recipe A')
})

for (const queued of [false, true]) {
  test(`PG-01: consecutive renames replace the first saved ID (${queued ? 'both saves waiting' : 'save again after completion'})`, async () => {
    const localStorage = storage()
    await tab(localStorage).save({ name: 'Original' })
    const pending = []
    const finalEntered = Promise.withResolvers()
    let requests = 0
    const locks = { request: (name, write) => {
      assert.equal(name, savedRecipes.SAVED_RECIPES_KEY)
      return new Promise((resolve) => {
        pending.push(() => resolve(write()))
        if (++requests === 2) finalEntered.resolve()
      })
    } }
    const a = tab(localStorage, locks)
    await a.edit(a.state.records[0])
    await a.update({ name: 'First' })
    const savingFirst = a.saveCurrent()
    await a.update({ name: 'Final' })
    const queuedFinal = queued ? a.saveCurrent() : null
    pending.shift()()
    await savingFirst
    assert.equal(a.state.recipe.name, 'Final')
    const savingFinal = queuedFinal || a.saveCurrent()
    await finalEntered.promise
    pending.shift()()
    await savingFinal
    assert.deepEqual(a.state.records.map((record) => record.id), ['final'])
    assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['final'])
  })
}

for (const action of ['start', 'choose']) {
  test(`PG-01: main Launch cancels a deferred ${action} without aborting its runtime`, async () => {
    const localStorage = storage()
    await tab(localStorage).save({ name: 'Original', wordpress: '6.8', storage: 'temporary' })
    const locks = controlledLocks()
    const a = tab(localStorage, locks, true)
    const original = a.state.records[0]
    await a.edit(original)
    await a.update({ name: 'Renamed' })
    const saving = a.saveCurrent()
    const deferred = a[action](original)
    a.mainLaunch()
    assert.equal(a.state.runtimeStarts.length, 1)
    const firstSignal = a.state.runtimeStarts[0].signal
    await locks.finishNext()
    await saving
    await deferred
    assert.equal(a.state.runtimeStarts.length, 1, 'the real launch handler must start the runtime only once')
    assert.equal(firstSignal.aborted, false, 'the newer main launch must remain active')
    assert.equal(a.state.activeSavedId, '', 'the old deferred selection must not apply')
    assert.equal(a.state.editingSavedId, 'renamed')
    assert.equal(a.state.recipe.name, 'Renamed')
  })
}

test('PG-01: typing during a fresh save follows its saved identity without losing the draft', async () => {
  const localStorage = storage()
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.update({ name: 'Foo' })
  const savingFoo = a.saveCurrent()
  await a.update({ name: 'Bar' })
  await locks.finishNext()
  await savingFoo
  assert.equal(a.state.recipe.name, 'Bar')
  assert.equal(a.state.editingSavedId, 'foo')
  assert.deepEqual(a.state.records.map((record) => record.id), ['foo'])
  const savingBar = a.saveCurrent()
  await locks.finishNext()
  await savingBar
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['bar'])
  assert.equal(a.state.editingSavedId, '')
  assert.equal(a.state.activeSavedId, 'bar')
})

test('PG-01: Remove follows a pending rename and deletes its resulting ID', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.edit(a.state.records[0])
  await a.update({ name: 'Renamed' })
  const saving = a.saveCurrent()
  const removing = a.remove('original')
  await locks.finishNext()
  await saving
  await locks.finishNext()
  await removing
  assert.deepEqual(a.state.records, [])
  assert.deepEqual(tab(localStorage).state.records, [])
  assert.equal(a.state.editingSavedId, '')
  assert.equal(a.state.activeSavedId, '')
})

for (const action of ['choose', 'edit', 'start']) {
  test(`PG-01: ${action} follows the resulting record of a pending rename`, async () => {
    const localStorage = storage()
    await tab(localStorage).save({ name: 'Original', siteTitle: 'Old title' })
    const locks = controlledLocks()
    const a = tab(localStorage, locks)
    const original = a.state.records[0]
    await a.edit(original)
    await a.update({ name: 'Renamed', siteTitle: 'Saved title' })
    const saving = a.saveCurrent()
    const acting = a[action](original)
    await locks.finishNext()
    await saving
    await acting
    assert.equal(a.state.recipe.name, 'Renamed')
    assert.equal(a.state.recipe.siteTitle, 'Saved title')
    assert.equal(a.state.activeSavedId, 'renamed')
    if (action === 'edit') {
      assert.equal(a.state.editingSavedId, 'renamed')
      await a.update({ name: 'Final' })
      const savingFinal = a.saveCurrent()
      await locks.finishNext()
      await savingFinal
      assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['final'])
    }
    if (action === 'start') assert.equal(a.state.launches[0].name, 'Renamed')
    if (action === 'choose') {
      await a.update({ name: 'Copy of renamed' })
      const savingCopy = a.saveCurrent()
      await locks.finishNext()
      await savingCopy
      assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['copy-of-renamed', 'renamed'])
    }
  })
}

test('PG-01: typing after a queued selection keeps the newer draft', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  const original = a.state.records[0]
  await a.edit(original)
  await a.update({ name: 'Renamed' })
  const saving = a.saveCurrent()
  const selecting = a.choose(original)
  await a.update({ siteTitle: 'Keep this newer edit' })
  await locks.finishNext()
  await saving
  await selecting
  assert.equal(a.state.recipe.name, 'Renamed')
  assert.equal(a.state.recipe.siteTitle, 'Keep this newer edit')
})

test('PG-01: editing a row queued for removal does not retain its deleted identity', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  const original = a.state.records[0]
  await a.edit(original)
  const removing = a.remove('original')
  const editing = a.edit(original)
  await locks.finishNext()
  await removing
  await editing
  assert.equal(a.state.editingSavedId, '')
  assert.deepEqual(tab(localStorage).state.records, [])
})

for (const cleared of [false, true]) {
  test(`PG-01: an external ${cleared ? 'clear' : 'deletion'} during a pending rename is never undone`, async () => {
    const localStorage = storage()
    await tab(localStorage).save({ name: 'Original' })
    const locks = controlledLocks()
    const a = tab(localStorage, locks)
    await a.edit(a.state.records[0])
    await a.update({ name: 'Renamed' })
    const saving = a.saveCurrent()
    if (cleared) localStorage.clear()
    else localStorage.setItem(savedRecipes.SAVED_RECIPES_KEY, '[]')
    const refreshing = a.storageEvent({ storageArea: localStorage, key: cleared ? null : savedRecipes.SAVED_RECIPES_KEY })
    await locks.finishNext()
    await saving
    await refreshing
    assert.deepEqual(a.state.records, [])
    assert.deepEqual(tab(localStorage).state.records, [])
    assert.equal(a.state.editingSavedId, '')
    assert.equal(a.state.activeSavedId, '')
  })
}

test('PG-01: storage refresh follows pending saves and never echoes or handles unrelated events', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.edit(a.state.records[0])
  await a.update({ name: 'Renamed' })
  const saving = a.saveCurrent()
  await tab(localStorage).save({ name: 'Other tab' })
  const refreshing = a.storageEvent({ storageArea: localStorage, key: savedRecipes.SAVED_RECIPES_KEY })
  await locks.finishNext()
  await saving
  const writes = localStorage.writes
  await refreshing
  assert.equal(localStorage.writes, writes)
  assert.deepEqual(a.state.records.map((record) => record.id), ['renamed', 'other-tab'])
  localStorage.setItem(savedRecipes.SAVED_RECIPES_KEY, '[]')
  await a.storageEvent({ storageArea: localStorage, key: 'unrelated' })
  await a.storageEvent({ storageArea: storage(), key: savedRecipes.SAVED_RECIPES_KEY })
  assert.equal(a.state.records.length, 2)
  a.cleanup()
  await a.storageEvent({ storageArea: localStorage, key: savedRecipes.SAVED_RECIPES_KEY })
  assert.equal(a.state.records.length, 2, 'cleanup removes the actual listener')
})

test('PG-01: export during a pending save exports the current draft, without mutating the library', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.edit(a.state.records[0])
  await a.update({ name: 'First' })
  const saving = a.saveCurrent()
  await a.update({ name: 'Exported draft' })
  const writes = localStorage.writes
  await a.export()
  assert.equal(a.state.exports[0].name, 'Exported draft')
  assert.equal(localStorage.writes, writes)
  await locks.finishNext()
  await saving
  assert.equal(a.state.exports[0].name, 'Exported draft')
})

for (const action of ['save', 'remove']) {
  test(`PG-01: a pending ${action} never overwrites another tab's replacement at the same ID`, async () => {
    const localStorage = storage()
    await tab(localStorage).save({ name: 'Original', siteTitle: 'Original record' })
    const locks = controlledLocks()
    const a = tab(localStorage, locks)
    await a.edit(a.state.records[0])
    await a.update({ name: 'Renamed' })
    const acting = action === 'save' ? a.saveCurrent() : a.remove('original')
    await tab(localStorage).save({ name: 'Original', siteTitle: 'Other tab replacement' })
    await locks.finishNext()
    await acting
    const records = tab(localStorage).state.records
    assert.deepEqual(records.map((record) => record.id), ['original'])
    assert.equal(records[0].recipe.siteTitle, 'Other tab replacement')
  })
}

test('PG-01: Remove follows the old row when an import reuses its previous name', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original', siteTitle: 'Old record' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.edit(a.state.records[0])
  await a.update({ name: 'Renamed' })
  const saving = a.saveCurrent()
  const removing = a.remove('original')
  const importing = a.importRecipe({ name: 'Original', siteTitle: 'Imported record' })
  await locks.finishNext()
  await saving
  await locks.finishNext()
  await locks.finishNext()
  await Promise.all([importing, removing])
  const records = tab(localStorage).state.records
  assert.deepEqual(records.map((record) => record.id), ['original'])
  assert.equal(records[0].recipe.siteTitle, 'Imported record')
})

test('PG-01: an external clear cancels a new draft first save waiting for its lock', async () => {
  const localStorage = storage()
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.update({ name: 'New draft' })
  const saving = a.saveCurrent()
  localStorage.clear()
  const refreshing = a.storageEvent({ storageArea: localStorage, key: null })
  await locks.finishNext()
  await saving
  await refreshing
  assert.deepEqual(a.state.records, [])
  assert.deepEqual(tab(localStorage).state.records, [])
  assert.equal(a.state.recipe.name, 'New draft', 'the unsaved draft remains available')
})

test('PG-01: a save queued after removal never recreates the removed identity', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  const locks = controlledLocks()
  const a = tab(localStorage, locks)
  await a.edit(a.state.records[0])
  await a.update({ name: 'Renamed' })
  const saving = a.saveCurrent()
  const removing = a.remove('original')
  await a.update({ siteTitle: 'Keep this unsaved draft' })
  const lateSave = a.saveCurrent()
  await locks.finishNext()
  await saving
  await locks.finishNext()
  await removing
  await locks.finishNext()
  await lateSave
  assert.deepEqual(tab(localStorage).state.records, [])
  assert.equal(a.state.recipe.siteTitle, 'Keep this unsaved draft')
  assert.equal(a.state.editingSavedId, '')
  assert.match(a.state.error, /removed/)
})

test('PG-01: failed save and removal preserve storage, and their queues allow retry', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Original' })
  // Avoid the observed Node native-lock hang after a throwing callback; test the rejected lock promise directly.
  const a = tab(localStorage, { request: async (_name, write) => write() })
  await a.edit(a.state.records[0])
  await a.update({ name: 'First' })
  const setItem = localStorage.setItem
  let fail = true
  localStorage.setItem = (...args) => {
    if (fail) { fail = false; throw new Error('The quota has been exceeded.') }
    setItem(...args)
  }
  await a.saveCurrent()
  assert.match(a.state.error, /quota/)
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['original'])
  assert.equal(a.state.editingSavedId, 'original')
  await a.saveCurrent()
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['first'])
  await a.edit(a.state.records[0])
  fail = true
  await a.remove('first')
  assert.match(a.state.error, /quota/)
  assert.deepEqual(a.state.records.map((record) => record.id), ['first'])
  assert.deepEqual(tab(localStorage).state.records.map((record) => record.id), ['first'])
  await a.remove('first')
  assert.deepEqual(tab(localStorage).state.records, [])
  assert.equal(a.state.editingSavedId, '')
  assert.equal(a.state.activeSavedId, '')
})

for (const type of ['plugin', 'theme']) {
  test(`PG-02: ${type} picker imports valid ZIPs after invalid files and resets for retry`, async () => {
    const packages = new Map()
    const state = { recipe: recipes.validateRecipe({ name: 'Batch', repositoryTheme: 'twentytwentyfive' }), rows: [], error: '' }
    const setRecipe = (next) => { state.recipe = next(state.recipe) }
    const scope = {
      ...recipes, detectPackageType, selectUploadedPlugin, markPluginSelected,
      recipeEditRef: { current: 0 },
      status: { step: 0 }, showPlayground: false, launchIdRef: { current: 1 },
      setActiveSpinupId() {}, setUploadMessage() {},
      installLiveUploads: async () => ({ failures: [], problems: [] }),
      [type === 'theme' ? 'listPlugins' : 'listThemes']: async () => [],
      [type === 'theme' ? 'setPlugins' : 'setThemes']() {},
      setError: (value) => { state.error = value }, setActiveSavedId() {}, setRecipe,
      [type === 'theme' ? 'getTheme' : 'getPlugin']: async (id) => packages.get(id),
      [type === 'theme' ? 'saveTheme' : 'savePlugin']: async (record) => {
        if (record.id === 'storage-failed') throw new Error('The quota has been exceeded.')
        packages.set(record.id, record)
      },
      [type === 'theme' ? 'listThemes' : 'listPlugins']: async () => [...packages.values()],
      [type === 'theme' ? 'setThemes' : 'setPlugins']: (rows) => { state.rows = rows },
      [type === 'theme' ? 'setThemeRecency' : 'setPluginRecency']() {},
    }
    async function archive(name) {
      const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
      const path = type === 'theme' ? 'example/style.css' : 'example/main.php'
      const header = type === 'theme' ? '/* Theme Name: Example */' : '<?php\n/* Plugin Name: Example */'
      await writer.add(path, new TextReader(header))
      return new File([await writer.close()], name)
    }
    const files = [new File(['bad'], 'invalid.zip'), await archive('first.zip'), new File(['bad'], 'bad-again.zip'), await archive('storage-failed.zip'), await archive('last.zip')]
    const event = { target: { files, value: 'selected files' } }
    const enqueue = createPackageUploadQueue(() => handler('importDroppedPackages', scope), (error) => { throw error })
    const picker = source.match(new RegExp(`name="${type}-zips"[^>]*onChange=\\{(\\w+)\\}`))[1]
    const action = handler(picker, { uploadQueueRef: { current: enqueue } })
    await action(event)
    assert.deepEqual(state.rows.map((record) => record.id), ['first', 'last'])
    assert.match(state.error, /invalid.zip/)
    assert.match(state.error, /bad-again.zip/)
    assert.match(state.error, /storage-failed.zip/)
    assert.match(state.error, /The quota has been exceeded/)
    assert.equal(event.target.value, '')
    if (type === 'theme') {
      assert.equal(state.recipe.theme, 'last')
      assert.equal(state.recipe.repositoryTheme, '')
    } else assert.deepEqual(state.recipe.plugins, ['first', 'last'])
    await action(event)
    assert.deepEqual(state.rows.map((record) => record.id), ['first', 'last'])
  })
}
