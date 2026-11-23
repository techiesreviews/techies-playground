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
    launchRef: { current: null },
  }
  scope.launchRef.current = scope.launch
  scope.saveRecipeToLibrary = (...args) => handler('saveRecipeToLibrary', scope)(...args)
  scope.applySavedRecipes = (...args) => handler('applySavedRecipes', scope)(...args)
  scope.reloadSavedRecipes = () => handler('reloadSavedRecipes', scope)()
  scope.stopEditingRecipe = () => handler('stopEditingRecipe', scope)()
  scope.loadSavedRecipe = (...args) => handler('loadSavedRecipe', scope)(...args)
  scope.chooseSavedRecipe = (...args) => handler('chooseSavedRecipe', scope)(...args)
  scope.refreshSavedRecipes = (...args) => handler('refreshSavedRecipes', scope)(...args)
  if (actualLaunch) {
    const runtime = {
      ...recipes,
      packagesWithSavedKeys: () => new Set(),
      licenseStorageRef: { current: { records: [], error: '', loading: false } },
      keysBlockLaunch: () => false, plugins: [], themes: [], resolveCheckPlugins: (recipe) => recipe,
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
    scope.launchRef.current = scope.launch
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

test('legacy history rows without IDs can be removed on the first click', () => {
  for (const id of [undefined, '']) {
    const localStorage = storage()
    const record = { id, launchedAt: '2026-08-01T12:00:00.000Z', recipe: { ...recipes.DEFAULT_RECIPE, storage: 'temporary' }, plugins: [] }
    const sibling = { ...record, id: 'legacy-spinup-0' }
    localStorage.setItem(history.SPINUP_HISTORY_KEY, JSON.stringify([record, sibling]))
    let state = history.readSpinupHistory(localStorage)
    const displayedId = state.records[0].id
    assert.notEqual(displayedId, sibling.id)
    const scope = {
      ...history, localStorage, activeSpinupId: displayedId,
      setActiveSpinupId() {},
      setHistoryStorage: (next) => { state = typeof next === 'function' ? next(state) : next },
    }
    scope.saveSpinupHistory = handler('saveSpinupHistory', scope)
    handler('removeSpinup', scope)(displayedId)
    assert.equal(state.records.length, 1)
    assert.equal(state.records[0].id, sibling.id)
    assert.deepEqual(history.readSpinupHistory(localStorage).records, state.records)
  }
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

const LICENSE_LIST_READ_ERROR = source.match(/^const LICENSE_LIST_READ_ERROR = '([^']+)'/m)?.[1] || ''
const LICENSE_LIST_RETRY_ERROR = source.match(/^const LICENSE_LIST_RETRY_ERROR = '([^']+)'/m)?.[1] || ''

function extractLicenseLaunchCheck() {
  const unavailableMatch = source.match(/^  const licenseListUnavailable = ([^\n]+)/m)
  const blockMatch = source.match(/^  const keysBlockLaunch = ([^\n]+)/m)
  assert.ok(unavailableMatch && blockMatch, 'licenseListUnavailable and keysBlockLaunch exist in App.jsx')
  return Function(
    'licenseStorage',
    `const licenseRecords = licenseStorage.records
     const licenseRecordsError = licenseStorage.error
     const licenseListUnavailable = ${unavailableMatch[1]}
     const keysBlockLaunch = ${blockMatch[1]}
     return keysBlockLaunch`,
  )
}

function licenseTab(listLicenseMetadata, initialRecords = null, timeoutMs = 10000) {
  const state = {
    records: initialRecords,
    error: '',
    loading: false,
    runtimeStarts: [],
  }
  const licenseReadIdRef = { current: 0 }
  const licenseStorageRef = { current: { records: initialRecords, error: '', loading: false } }
  const scope = {
    LICENSE_LIST_READ_ERROR,
    LICENSE_LIST_RETRY_ERROR,
    LICENSE_READ_TIMEOUT_MS: timeoutMs,
    listLicenseMetadata,
    licenseReadIdRef,
    licenseStorageRef,
    setLicenseStorage: (next) => {
      const updated = typeof next === 'function'
        ? next({ records: state.records, error: state.error, loading: state.loading })
        : next
      state.records = updated.records
      state.error = updated.error
      state.loading = Boolean(updated.loading)
      licenseStorageRef.current = { records: state.records, error: state.error, loading: state.loading }
    },
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
  async function refresh(options) {
    await handler('refreshLicenseRecords', scope)(options)
    await flush()
  }
  function startRefresh(options) {
    return handler('refreshLicenseRecords', scope)(options)
  }
  function createLaunchHandler() {
    const launchAbortRef = { current: null }
    const keysBlockLaunch = extractLicenseLaunchCheck()
    const renderSnapshot = { records: state.records, error: state.error, loading: state.loading }
    const runtime = {
      ...recipes,
      packagesWithSavedKeys: (records) => new Set((records || []).map((record) => record.pluginId)),
      licenseRecords: renderSnapshot.records,
      licenseRecordsError: renderSnapshot.error,
      licenseStorageRef,
      keysBlockLaunch: (target, current = renderSnapshot) => keysBlockLaunch(current)(target),
      plugins: [{ id: 'sample-plugin', label: 'Sample Plugin' }],
      themes: [],
      resolveCheckPlugins: (recipe) => recipe,
      launchIdRef: { current: 0 },
      launchAbortRef,
      launchedRecipeRef: { current: null },
      savedKeyPackages: new Set((renderSnapshot.records || []).map((record) => record.pluginId)),
      checksInSetup: () => [],
      persistedSiteId: () => 'test-site',
      createLauncherScope: () => 'test-scope',
      readPersistedSites: () => new Set(),
      isVaultSessionUnlocked: () => true,
      PLAYGROUND_READY_TIMEOUT_MS: 1000,
      startPlaygroundWithin: () => {
        state.runtimeStarts.push(runtime.launchedRecipeRef.current)
        return new Promise(() => {})
      },
    }
    const launchSource = source.slice(source.indexOf('  async function launch('))
    for (const setter of launchSource.match(/\bset[A-Z]\w+/g)) runtime[setter] = () => {}
    return handler('launch', runtime)
  }
  function launchWith(candidate) {
    return createLaunchHandler()(candidate)
  }
  return { state, refresh, startRefresh, launchWith, createLaunchHandler, licenseStorageRef }
}

test('TOOLS-438: initial license list read failure keeps null state, sets a clear error and blocks uploaded-plugin launch', async () => {
  assert.ok(LICENSE_LIST_READ_ERROR, 'App.jsx defines LICENSE_LIST_READ_ERROR')
  const session = licenseTab(async () => { throw new Error('IndexedDB unavailable') }, null)
  await session.refresh()
  assert.equal(session.state.records, null, 'initial read failure must keep licenseRecords as null, not []')
  assert.equal(session.state.error, LICENSE_LIST_READ_ERROR)
  assert.doesNotMatch(session.state.error, /IndexedDB unavailable/)
  assert.equal(session.state.loading, false)
  await session.launchWith(recipes.validateRecipe({ name: 'With plugin', wordpress: '6.8', storage: 'temporary', plugins: ['sample-plugin'] }))
  assert.equal(session.state.runtimeStarts.length, 0, 'launch must not proceed for uploaded plugins when initial license list read failed')
})

test('TOOLS-438: setups without uploaded plugins still launch when the license list cannot be read', async () => {
  const session = licenseTab(async () => { throw new Error('IndexedDB blocked') }, null)
  await session.refresh()
  assert.equal(session.state.records, null)
  assert.equal(session.state.error, LICENSE_LIST_READ_ERROR)
  session.launchWith(recipes.validateRecipe({ name: 'Plain', wordpress: '6.8', storage: 'temporary', plugins: [] }))
  assert.equal(session.state.runtimeStarts.length, 1, 'plain WordPress setup must still launch without a readable license list')
})

test('TOOLS-438: subsequent license list refresh failure keeps previous records, blocks stale launch and clears on recovery', async () => {
  const existing = [{ id: 'meta-1', pluginId: 'plugin:sample-plugin', name: 'Sample Plugin', createdAt: '2026-11-23T00:00:00.000Z' }]
  let shouldFail = true
  const updated = [
    ...existing,
    { id: 'meta-2', pluginId: 'plugin:second-plugin', name: 'Second Plugin', createdAt: '2026-11-23T00:01:00.000Z' },
  ]
  const session = licenseTab(async () => {
    if (shouldFail) throw new Error('Transient read failure')
    return updated
  }, existing)

  await session.refresh()
  assert.deepEqual(session.state.records, existing, 'refresh failure must keep previous license records intact')
  assert.equal(session.state.error, LICENSE_LIST_READ_ERROR)

  await session.refresh({ retry: true })
  assert.equal(session.state.error, LICENSE_LIST_RETRY_ERROR, 'a failed retry updates the message so the user sees it tried')

  await session.launchWith(recipes.validateRecipe({ name: 'With plugin', wordpress: '6.8', storage: 'temporary', plugins: ['sample-plugin'] }))
  assert.equal(session.state.runtimeStarts.length, 0, 'launch must not silently proceed after a failed license list refresh')

  shouldFail = false
  await session.refresh({ retry: true })
  assert.deepEqual(session.state.records, updated, 'a subsequent successful read updates records')
  assert.equal(session.state.error, '', 'a subsequent successful read clears the read error')
  assert.equal(session.state.loading, false)
})

test('TOOLS-438: launch is blocked while a license refresh is still in flight and allowed once it resolves', async () => {
  const existing = [{ id: 'meta-1', pluginId: 'plugin:sample-plugin', name: 'Sample Plugin', createdAt: '2026-11-23T00:00:00.000Z' }]
  let finishRead
  const session = licenseTab(() => new Promise((resolve) => { finishRead = resolve }), existing)
  const pending = session.startRefresh()
  assert.equal(session.state.loading, true)
  const candidate = recipes.validateRecipe({ name: 'With plugin', wordpress: '6.8', storage: 'temporary', plugins: ['sample-plugin'] })
  await session.launchWith(candidate)
  assert.equal(session.state.runtimeStarts.length, 0, 'uploaded-plugin launch must wait while a license refresh is in flight')
  finishRead(existing)
  await pending
  assert.equal(session.state.loading, false)
  session.launchWith(candidate)
  assert.equal(session.state.runtimeStarts.length, 1, 'uploaded-plugin launch proceeds once refresh settles')
})

test('TOOLS-438: deferred saved-recipe Start refuses to launch when a license refresh fails while waiting', async () => {
  const localStorage = storage()
  await tab(localStorage).save({ name: 'Pro Stack', wordpress: '6.8', storage: 'temporary', plugins: ['sample-plugin'] })
  const locks = controlledLocks()
  const existing = [{ id: 'meta-1', pluginId: 'plugin:sample-plugin', name: 'Sample Plugin', createdAt: '2026-11-23T00:00:00.000Z' }]
  const licenseSession = licenseTab(async () => { throw new Error('Read failed while waiting') }, existing)
  const capturedLaunch = licenseSession.createLaunchHandler()
  const a = tab(localStorage, locks)
  const original = a.state.records[0]
  await a.edit(original)
  await a.update({ siteTitle: 'Updated title' })
  const saving = a.saveCurrent()
  const startScope = {
    ...recipes,
    recipeEditRef: { current: 0 },
    launchIdRef: { current: 0 },
    chooseSavedRecipe: async () => {
      startScope.recipeEditRef.current += 1
      await a.choose(original)
      return a.state.records[0]
    },
    launch: capturedLaunch,
    launchRef: { current: capturedLaunch },
  }
  const starting = handler('startSavedRecipe', startScope)(original)
  // A license refresh fails while Start waits for the pending save lock.
  await licenseSession.refresh()
  assert.equal(licenseSession.state.error, LICENSE_LIST_READ_ERROR)
  await locks.finishNext()
  await saving
  await starting
  assert.equal(licenseSession.state.runtimeStarts.length, 0, 'deferred Start must read current license readiness and not launch after a failed refresh')
})

test('TOOLS-438: a hung license list read times out to an error with retry and ignores late answers', async () => {
  let lateResolve
  const existing = [{ id: 'meta-1', pluginId: 'plugin:sample-plugin', name: 'Sample Plugin', createdAt: '2026-11-23T00:00:00.000Z' }]
  const session = licenseTab(() => new Promise((resolve) => { lateResolve = resolve }), existing, 20)
  const pending = session.startRefresh()
  assert.equal(session.state.loading, true)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(session.state.loading, false, 'hung read clears loading on timeout')
  assert.deepEqual(session.state.records, existing, 'timeout preserves previous records')
  assert.equal(session.state.error, LICENSE_LIST_READ_ERROR)
  lateResolve([])
  await pending
  assert.deepEqual(session.state.records, existing, 'late answer after timeout is ignored')
  assert.equal(session.state.error, LICENSE_LIST_READ_ERROR)
})

test('TOOLS-438: out-of-order license list reads never let an older call overwrite newer state and track in-flight loading', async () => {
  const pending = []
  const session = licenseTab(() => new Promise((resolve, reject) => pending.push({ resolve, reject })), null)
  const first = session.refresh()
  assert.equal(session.state.loading, true, 'in-flight refresh marks loading so stale launches pause')
  const second = session.refresh()
  const fresh = [{ id: 'meta-1', pluginId: 'plugin:sample-plugin', name: 'Sample Plugin', createdAt: '2026-11-23T00:00:00.000Z' }]
  pending[1].resolve(fresh)
  await second
  assert.equal(session.state.loading, false)
  pending[0].reject(new Error('Late failure'))
  await first
  assert.deepEqual(session.state.records, fresh)
  assert.equal(session.state.error, '')
  assert.equal(session.state.loading, false)

  const third = session.refresh()
  assert.equal(session.state.loading, true)
  const fourth = session.refresh()
  pending[3].reject(new Error('Newer failure'))
  await fourth
  assert.equal(session.state.loading, false)
  pending[2].resolve([])
  await third
  assert.deepEqual(session.state.records, fresh)
  assert.equal(session.state.error, LICENSE_LIST_READ_ERROR)
  assert.equal(session.state.loading, false)
})

test('TOOLS-438: extracted App licenseListUnavailable and keysBlockLaunch enforce every state combination', () => {
  const makeCheck = extractLicenseLaunchCheck()
  const cases = [
    [{ records: null, error: '', loading: false }, true],
    [{ records: [], error: '', loading: true }, true],
    [{ records: [], error: 'read failed', loading: false }, true],
    [{ records: [], error: '', loading: false }, false],
  ]
  for (const [licenseStorage, expectedBlocked] of cases) {
    const check = makeCheck(licenseStorage)
    assert.equal(check({ plugins: [] }), false)
    assert.equal(check({ plugins: ['a'] }), expectedBlocked)
  }
})

test('TOOLS-438: keyCountsFor reports null saved count while unloaded and exact counts once loaded', () => {
  const match = source.match(/^  const keyCountsFor = (\([\s\S]*?\n  \}\))/m)
  assert.ok(match, 'keyCountsFor exists')
  const runKeyCounts = (licenseRecords, savedIds = []) => Function(
    'licenseRecords', 'savedKeyPackages', `return (${match[1]})`,
  )(licenseRecords, new Set(savedIds))
  const candidate = { plugins: ['sample-plugin', 'second-plugin'] }
  assert.deepEqual(runKeyCounts(null)(candidate), { total: 2, saved: null })
  assert.deepEqual(runKeyCounts([])(candidate), { total: 2, saved: 0 })
  assert.deepEqual(runKeyCounts([{ pluginId: 'plugin:sample-plugin' }], ['plugin:sample-plugin'])(candidate), { total: 2, saved: 1 })
})

test('TOOLS-438: launcher gates only uploaded-plugin launches on license readiness and exposes accessible retry', () => {
  assert.doesNotMatch(source, /catch\(\(\)\s*=>\s*setLicenseRecords\(\[\]\)\)/)
  assert.match(source, /const keysBlockLaunch = \(candidate, current = licenseStorage\) => Boolean\(candidate\?\.plugins\?\.length\) && licenseListUnavailable\(current\)/)
  assert.match(source, /starting=\{status\.running \|\| keysBlockLaunch\(record\.recipe\)\}/)
  assert.match(source, /disabled=\{status\.running \|\| keysBlockLaunch\(recipe\)\}/)
  assert.match(source, /launchReady=\{!keysBlockLaunch\(recipe\)\}/)
  assert.match(source, /aria-disabled=\{licenseStorage\.loading\}/)
  assert.match(source, /any-pointer-coarse:min-h-11[^<]*>\s*\{licenseStorage\.loading \? 'Retrying…' : 'Try again'\}/)
})
