import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateStorageDefault, persistedSiteId, shouldWarnBeforeUnload, spinupPersistenceLabel } from './playground-persistence.js'

test('warns before unloading only an active temporary Playground', () => {
  assert.equal(shouldWarnBeforeUnload({ playgroundOpen: true, running: true, storage: 'temporary' }), true)
  assert.equal(shouldWarnBeforeUnload({ playgroundOpen: true, running: true, storage: 'browser' }), false)
  assert.equal(shouldWarnBeforeUnload({ playgroundOpen: false, running: true, storage: 'temporary' }), false)
})

test('moves an existing draft to the safer browser default only once', () => {
  const temporaryRecipe = { name: 'Existing draft', storage: 'temporary' }

  assert.equal(migrateStorageDefault(temporaryRecipe, false).storage, 'browser')
  assert.equal(migrateStorageDefault(temporaryRecipe, true).storage, 'temporary')
})

test('uses the recipe identity to distinguish resumable history', () => {
  const recipe = { name: 'Client Demo', wordpress: '7.0.4', php: '8.3', storage: 'browser' }
  const siteId = persistedSiteId(recipe)

  assert.equal(siteId, 'client-demo-7-0-4-8-3')
  assert.match(spinupPersistenceLabel({ recipe }, new Set([siteId])), /^Saved environment/)
  assert.match(spinupPersistenceLabel({ recipe }, new Set()), /^Setup only/)
  assert.match(spinupPersistenceLabel({ recipe: { ...recipe, storage: 'temporary' } }, new Set([siteId])), /temporary$/)
})
