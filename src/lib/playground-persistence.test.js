import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateStorageDefault, persistedSiteId, persistedSitesKey, shouldWarnBeforeUnload, spinupPersistenceLabel } from './playground-persistence.js'

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

test('keeps the saved-site list per Playground host, because each host has its own browser storage', () => {
  const legacy = 'private-playground-launcher:persisted-sites'
  assert.equal(persistedSitesKey('https://playground.wordpress.net'), legacy)
  assert.equal(persistedSitesKey('https://wp.techies.tools'), `${legacy}@https://wp.techies.tools`)
  assert.equal(persistedSitesKey('https://preview-wp.techies.tools'), `${legacy}@https://preview-wp.techies.tools`)
})

test('asks for persistent storage without waiting for the answer', async () => {
  const { requestPersistentStorage } = await import('./playground-persistence.js')
  let calls = 0
  // Firefox keeps this promise pending until the visitor answers its permission prompt.
  assert.equal(requestPersistentStorage({ persist() { calls += 1; return new Promise(() => {}) } }), undefined)
  assert.equal(calls, 1)
  requestPersistentStorage({ persist: () => Promise.reject(new Error('denied')) })
  requestPersistentStorage({ persist() { throw new Error('unsupported') } })
  requestPersistentStorage(undefined)
  requestPersistentStorage({})
  await new Promise((resolve) => setImmediate(resolve))
})
