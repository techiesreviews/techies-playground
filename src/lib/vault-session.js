// The unlocked licence vault key for this page session. It lives in memory only, so one
// unlock lets every launch fill in saved keys; Lock, closing the tab or reloading drops it.
let sessionKey = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener()
}

export function getVaultSessionKey() {
  return sessionKey
}

export function isVaultSessionUnlocked() {
  return sessionKey !== null
}

export function startVaultSession(key) {
  if (!key) throw new Error('An unlocked vault key is required.')
  sessionKey = key
  notify()
}

export function lockVaultSession() {
  sessionKey = null
  notify()
}

export function subscribeVaultSession(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
