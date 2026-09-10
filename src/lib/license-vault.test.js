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

test('cancels copy after pending storage or decryption while preserving active copy', async () => {
  const { copyLicenseToClipboard } = await import('./license-vault.js')
  const originalIndexedDB = globalThis.indexedDB
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalDecrypt = crypto.subtle.decrypt
  const key = await deriveLicenseVaultKey('synthetic master password', new Uint8Array(16), 1000)
  const metadata = { id: 'test', pluginId: 'plugin:test', name: 'Test' }
  const aad = new TextEncoder().encode(`license-v1\0${metadata.id}\0${metadata.pluginId}\0${metadata.name}`)
  const record = { ...metadata, ...await encryptLicenseSecret(key, 'synthetic-only', aad) }
  let completeRead
  const writes = []
  globalThis.indexedDB = { open() {
    const request = { result: { close() {}, transaction() {
      const transaction = { objectStore() { return { get() {
        const read = { result: record }
        completeRead = () => { read.onsuccess(); transaction.oncomplete() }
        return read
      } } } }
      return transaction
    } } }
    queueMicrotask(() => request.onsuccess())
    return request
  } }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText(value) { writes.push(value) } } } })
  try {
    const session = new AbortController()
    const pending = copyLicenseToClipboard(key, metadata.id, session.signal)
    const rejected = assert.rejects(pending, { name: 'AbortError' })
    await new Promise(resolve => setImmediate(resolve))
    session.abort()
    completeRead()
    await rejected
    assert.deepEqual(writes, [])

    const duringDecrypt = new AbortController()
    crypto.subtle.decrypt = async function (...args) {
      const result = await originalDecrypt.apply(this, args)
      duringDecrypt.abort()
      return result
    }
    const decrypting = copyLicenseToClipboard(key, metadata.id, duringDecrypt.signal)
    const decryptRejected = assert.rejects(decrypting, { name: 'AbortError' })
    await new Promise(resolve => setImmediate(resolve))
    completeRead()
    await decryptRejected
    assert.deepEqual(writes, [])
    crypto.subtle.decrypt = originalDecrypt

    const active = copyLicenseToClipboard(key, metadata.id, new AbortController().signal)
    await new Promise(resolve => setImmediate(resolve))
    completeRead()
    await active
    assert.deepEqual(writes, ['synthetic-only'])
    await assert.rejects(copyLicenseToClipboard(key, metadata.id), /active vault session/)
  } finally {
    crypto.subtle.decrypt = originalDecrypt
    globalThis.indexedDB = originalIndexedDB
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
})
