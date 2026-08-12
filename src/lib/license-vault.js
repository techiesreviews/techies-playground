const DATABASE_NAME = 'private-playground-license-vault'
const DATABASE_VERSION = 1
const LICENSE_STORE = 'licenses'
const META_STORE = 'meta'
const META_ID = 'vault'
const VERIFIER_TEXT = 'private-playground-license-vault:v1'
const DEFAULT_ITERATIONS = 600_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LICENSE_STORE)) {
        request.result.createObjectStore(LICENSE_STORE, { keyPath: 'id' })
      }
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact(storeName, mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    let result
    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error || new Error('The license vault transaction was aborted.'))
    }
  }))
}

function getRecord(storeName, id) {
  return transact(storeName, 'readonly', (store) => store.get(id))
}

function putRecord(storeName, record) {
  return transact(storeName, 'readwrite', (store) => store.put(record))
}

function licenseAdditionalData({ id, name, pluginId }) {
  return encoder.encode(`license-v1\u0000${id}\u0000${pluginId}\u0000${name}`)
}

export async function deriveLicenseVaultKey(password, salt, iterations = DEFAULT_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptLicenseSecret(key, plaintext, additionalData = new Uint8Array()) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    key,
    encoder.encode(plaintext),
  )
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) }
}

export async function decryptLicenseSecret(key, encrypted, additionalData = new Uint8Array()) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encrypted.iv), additionalData },
    key,
    base64ToBytes(encrypted.ciphertext),
  )
  return decoder.decode(plaintext)
}

export async function getLicenseVaultStatus() {
  return { initialized: Boolean(await getRecord(META_STORE, META_ID)) }
}

export async function createLicenseVault(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Use a master password with at least 12 characters.')
  }
  if ((await getLicenseVaultStatus()).initialized) throw new Error('The encrypted license vault already exists.')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveLicenseVaultKey(password, salt)
  const verifier = await encryptLicenseSecret(key, VERIFIER_TEXT, encoder.encode(VERIFIER_TEXT))
  await putRecord(META_STORE, {
    id: META_ID,
    salt: bytesToBase64(salt),
    iterations: DEFAULT_ITERATIONS,
    verifier,
  })
  return key
}

export async function unlockLicenseVault(password) {
  const meta = await getRecord(META_STORE, META_ID)
  if (!meta) throw new Error('Create the encrypted license vault first.')
  try {
    const key = await deriveLicenseVaultKey(password, base64ToBytes(meta.salt), meta.iterations)
    const verifier = await decryptLicenseSecret(key, meta.verifier, encoder.encode(VERIFIER_TEXT))
    if (verifier !== VERIFIER_TEXT) throw new Error('Invalid verifier.')
    return key
  } catch {
    throw new Error('The master password is incorrect.')
  }
}

export async function listLicenseMetadata() {
  const records = await transact(LICENSE_STORE, 'readonly', (store) => store.getAll())
  return records
    .map(({ id, name, pluginId, createdAt }) => ({ id, name, pluginId, createdAt }))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
}

export async function addLicense(key, { name, pluginId, licenseKey }) {
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  const normalizedPluginId = typeof pluginId === 'string' ? pluginId.trim() : ''
  if (!normalizedName) throw new Error('Give the license a name.')
  if (!normalizedPluginId) throw new Error('Choose the plugin this license belongs to.')
  if (typeof licenseKey !== 'string' || !licenseKey.trim()) throw new Error('Enter a license key.')

  const id = crypto.randomUUID()
  const metadata = { id, name: normalizedName, pluginId: normalizedPluginId }
  const encrypted = await encryptLicenseSecret(key, licenseKey.trim(), licenseAdditionalData(metadata))
  await putRecord(LICENSE_STORE, {
    ...metadata,
    ...encrypted,
    createdAt: new Date().toISOString(),
  })
  return id
}

export async function copyLicenseToClipboard(key, id) {
  const record = await getRecord(LICENSE_STORE, id)
  if (!record) throw new Error('That license no longer exists.')
  const plaintext = await decryptLicenseSecret(key, record, licenseAdditionalData(record))
  await navigator.clipboard.writeText(plaintext)
}

export function deleteLicense(id) {
  return transact(LICENSE_STORE, 'readwrite', (store) => store.delete(id))
}

export function resetLicenseVault() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other launcher tabs before resetting the vault.'))
  })
}
