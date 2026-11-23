import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as savedRecipes from './lib/saved-recipes.js'
import * as recipes from './lib/recipe.js'
import { markPluginSelected } from './lib/plugin-preferences.js'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { createPackageUploadQueue, detectPackageType } from './lib/package-upload.js'
import { selectUploadedPlugin } from './lib/checks.js'

// Execute the actual App event handlers with state setters and storage in memory.
// This tests orchestration (including the former persistence effect), without pretending to render JSX.
const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
function handler(name, scope) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'))
  assert.ok(start >= 0, `${name} exists`)
  const end = source.indexOf('\n  }', start) + 4
  return Function(...Object.keys(scope), `return (${source.slice(start, end)})`)(...Object.values(scope))
}
function storage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
function tab(localStorage, locks) {
  const state = {
    records: savedRecipes.parseSavedRecipes(localStorage.getItem(savedRecipes.SAVED_RECIPES_KEY)),
    recipe: recipes.validateRecipe({ name: 'Draft' }),
    activeSavedId: '', editingSavedId: '', selectionMode: 'plugins',
  }
  const scope = {
    ...savedRecipes, ...recipes, localStorage,
    recipe: state.recipe, recipeEditRef: { current: 0 },
    updateSavedRecipes: (store, update) => savedRecipes.updateSavedRecipes(store, update, locks),
    setRecipe: (next) => { scope.recipe = state.recipe = typeof next === 'function' ? next(state.recipe) : next },
    setSavedRecipes: (next) => { state.records = typeof next === 'function' ? next(state.records) : next },
    setActiveSavedId: (id) => { scope.activeSavedId = state.activeSavedId = id },
    setEditingSavedId: (id) => { scope.editingSavedId = state.editingSavedId = id },
    setSelectionMode: (mode) => { state.selectionMode = mode },
    setActiveSpinupId() {},
    activeSavedId: '', editingSavedId: '', setError: (error) => { state.error = error },
  }
  scope.saveRecipeToLibrary = (...args) => handler('saveRecipeToLibrary', scope)(...args)
  scope.stopEditingRecipe = () => handler('stopEditingRecipe', scope)()
  const persistEffect = source.match(/useEffect\(\(\) => \{\n(    localStorage.setItem\(SAVED_RECIPES_KEY,[\s\S]*?)\n  }, \[savedRecipes\]\)/)?.[1]
  async function run(name, ...args) {
    await handler(name, scope)(...args)
    if (persistEffect) Function('localStorage', 'savedRecipes', ...Object.keys(savedRecipes), persistEffect)(localStorage, state.records, ...Object.values(savedRecipes))
  }
  return {
    state, save: (...args) => run('saveRecipeToLibrary', ...args), remove: (id) => run('removeSavedRecipe', id),
    edit: (record) => run('editSavedRecipe', record), update: (patch) => run('updateRecipe', patch),
    saveCurrent: () => run('handleSaveRecipe'),
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
