import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteLicense,
  decryptLicenseSecret,
  deriveLicenseVaultKey,
  encryptLicenseSecret,
} from './license-vault.js'

test('encrypts and decrypts a license with authenticated metadata', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveLicenseVaultKey('correct horse battery staple', salt, 1_000)
  const metadata = new TextEncoder().encode('unblock-license')
  const encrypted = await encryptLicenseSecret(key, 'synthetic-license-key', metadata)

  assert.notEqual(encrypted.ciphertext, 'synthetic-license-key')
  assert.equal(await decryptLicenseSecret(key, encrypted, metadata), 'synthetic-license-key')
  await assert.rejects(
    decryptLicenseSecret(key, encrypted, new TextEncoder().encode('different-plugin')),
  )
})

test('a different master password cannot decrypt the license', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const correctKey = await deriveLicenseVaultKey('correct horse battery staple', salt, 1_000)
  const wrongKey = await deriveLicenseVaultKey('different master password', salt, 1_000)
  const encrypted = await encryptLicenseSecret(correctKey, 'synthetic-license-key')

  await assert.rejects(decryptLicenseSecret(wrongKey, encrypted))
})

test('waits for the license deletion transaction to commit', async () => {
  const originalIndexedDB = globalThis.indexedDB
  let transaction
  let databaseClosed = false

  const database = {
    transaction() {
      transaction = {
        error: null,
        objectStore() {
          return {
            delete() {
              const request = {}
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
    let settled = false
    const deletion = deleteLicense('synthetic-license').then(() => {
      settled = true
    })

    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settled, false)
    assert.equal(databaseClosed, false)

    transaction.oncomplete()
    await deletion
    assert.equal(settled, true)
    assert.equal(databaseClosed, true)
  } finally {
    globalThis.indexedDB = originalIndexedDB
  }
})
