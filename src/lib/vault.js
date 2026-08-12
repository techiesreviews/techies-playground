const DATABASE_NAME = 'private-playground-launcher'
const PLUGIN_STORE = 'plugins'
const THEME_STORE = 'themes'
const DATABASE_VERSION = 2

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PLUGIN_STORE)) {
        request.result.createObjectStore(PLUGIN_STORE, { keyPath: 'id' })
      }
      if (!request.result.objectStoreNames.contains(THEME_STORE)) {
        request.result.createObjectStore(THEME_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other launcher tabs so the local package vault can be upgraded.'))
  })
}

function transact(storeName, mode, operation) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = operation(store)
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
          reject(transaction.error || new Error('The local package vault transaction was aborted.'))
        }
      }),
  )
}

export function listPlugins() {
  return transact(PLUGIN_STORE, 'readonly', (store) => store.getAll()).then((plugins) =>
    plugins.sort((a, b) => a.label.localeCompare(b.label)),
  )
}

export function getPlugin(id) {
  return transact(PLUGIN_STORE, 'readonly', (store) => store.get(id))
}

export function savePlugin(plugin) {
  return transact(PLUGIN_STORE, 'readwrite', (store) => store.put(plugin))
}

export function removePlugin(id) {
  return transact(PLUGIN_STORE, 'readwrite', (store) => store.delete(id))
}

export function listThemes() {
  return transact(THEME_STORE, 'readonly', (store) => store.getAll()).then((themes) =>
    themes.sort((a, b) => a.label.localeCompare(b.label)),
  )
}

export function getTheme(id) {
  return transact(THEME_STORE, 'readonly', (store) => store.get(id))
}

export function saveTheme(theme) {
  return transact(THEME_STORE, 'readwrite', (store) => store.put(theme))
}

export function removeTheme(id) {
  return transact(THEME_STORE, 'readwrite', (store) => store.delete(id))
}

export async function assertZipFile(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error(`${file.name} is not a ZIP file.`)
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b
  if (!isZip) throw new Error(`${file.name} does not have a valid ZIP signature.`)
}
