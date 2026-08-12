import assert from 'node:assert/strict'
import test from 'node:test'
import { saveTheme } from './vault.js'

test('stores themes separately and waits for the write transaction to commit', async () => {
  const originalIndexedDB = globalThis.indexedDB
  let transaction
  let requestedStore = ''
  let requestedMode = ''
  let storedTheme
  let databaseClosed = false

  const database = {
    transaction(storeName, mode) {
      requestedStore = storeName
      requestedMode = mode
      transaction = {
        error: null,
        objectStore() {
          return {
            put(theme) {
              storedTheme = theme
              const request = { result: theme.id }
              queueMicrotask(() => request.onsuccess?.())
              return request
            },
          }
        },
      }
      return transaction
    },
    close() {
      databaseClosed = true
    },
  }

  globalThis.indexedDB = {
    open() {
      const request = { result: database }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }

  try {
    const theme = { id: 'premium-theme', label: 'Premium Theme' }
    let settled = false
    const save = saveTheme(theme).then(() => {
      settled = true
    })

    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(requestedStore, 'themes')
    assert.equal(requestedMode, 'readwrite')
    assert.deepEqual(storedTheme, theme)
    assert.equal(settled, false)

    transaction.oncomplete()
    await save
    assert.equal(settled, true)
    assert.equal(databaseClosed, true)
  } finally {
    globalThis.indexedDB = originalIndexedDB
  }
})
