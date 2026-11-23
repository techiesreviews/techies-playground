import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSavedRecipes, replaceSavedRecipe, SAVED_RECIPES_KEY, serializeSavedRecipes, updateSavedRecipes, upsertSavedRecipe } from './saved-recipes.js'

test('saves and replaces recipes by their normalized name', () => {
  const first = upsertSavedRecipe([], { name: 'Unblock stack', plugins: ['unblock'] }, 'first')
  const second = upsertSavedRecipe(first, { name: 'Unblock stack', plugins: ['unblock', 'seo'] }, 'second')
  assert.equal(second.length, 1)
  assert.equal(second[0].savedAt, 'second')
  assert.deepEqual(second[0].recipe.plugins, ['unblock', 'seo'])
})

test('updates and renames an existing saved recipe without leaving the old record', () => {
  const records = upsertSavedRecipe([], { name: 'Old name', plugins: ['one'] }, 'first')
  const updated = replaceSavedRecipe(records, 'old-name', { name: 'New name', plugins: ['two'] }, 'second')
  assert.equal(updated.length, 1)
  assert.equal(updated[0].id, 'new-name')
  assert.deepEqual(updated[0].recipe.plugins, ['two'])
})

test('round trips safe saved recipes and drops invalid records', () => {
  const records = upsertSavedRecipe([], { name: 'Safe stack', plugins: [] }, 'now')
  assert.deepEqual(parseSavedRecipes(serializeSavedRecipes(records)), records)
  assert.deepEqual(parseSavedRecipes('[{"recipe":{"licenseKey":"unsafe"}}]'), [])
  assert.deepEqual(parseSavedRecipes(JSON.stringify([...records, { recipe: { licenseKey: 'unsafe' } }])), records)
})

test('unreadable saved recipe lists report an error and cannot be overwritten', async () => {
  for (const raw of ['{damaged', '{}', 'null', '42', '"recipes"', '']) {
    let stored = raw
    const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value } }
    assert.throws(() => parseSavedRecipes(raw), /Saved recipes could not be read/)
    await assert.rejects(updateSavedRecipes(storage, (records) => upsertSavedRecipe(records, { name: 'New' }), null), /Saved recipes could not be read/)
    assert.equal(storage.getItem(SAVED_RECIPES_KEY), raw)
  }
  assert.deepEqual(parseSavedRecipes(null), [])
  assert.deepEqual(parseSavedRecipes('[]'), [])
})
