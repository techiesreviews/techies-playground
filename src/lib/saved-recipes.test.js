import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSavedRecipes, serializeSavedRecipes, upsertSavedRecipe } from './saved-recipes.js'

test('saves and replaces recipes by their normalized name', () => {
  const first = upsertSavedRecipe([], { name: 'Unblock stack', plugins: ['unblock'] }, 'first')
  const second = upsertSavedRecipe(first, { name: 'Unblock stack', plugins: ['unblock', 'seo'] }, 'second')
  assert.equal(second.length, 1)
  assert.equal(second[0].savedAt, 'second')
  assert.deepEqual(second[0].recipe.plugins, ['unblock', 'seo'])
})

test('round trips safe saved recipes and drops invalid records', () => {
  const records = upsertSavedRecipe([], { name: 'Safe stack', plugins: [] }, 'now')
  assert.deepEqual(parseSavedRecipes(serializeSavedRecipes(records)), records)
  assert.deepEqual(parseSavedRecipes('[{"recipe":{"licenseKey":"unsafe"}}]'), [])
})
