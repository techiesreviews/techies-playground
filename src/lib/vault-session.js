// The unlocked licence vault key for this page session. It lives in memory only, so one
// unlock lets every launch fill in saved keys; Lock, closing the tab or reloading drops it.
let sessionKey = null
// Changes on every Lock (Reset locks first), so an unlock that was already running when the
// vault was locked or reset cannot bring its key back.
let lockCount = 0
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
  lockCount += 1
  sessionKey = null
  notify()
}

export function subscribeVaultSession(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Waits during a launch until the vault is unlocked (by the launch prompt or the Licenses
// manager) or until register's answer function is called with 'skip' or 'closed'.
export function waitForVaultUnlock(register, subscribe = subscribeVaultSession) {
  let stop = () => {}
  return new Promise((resolve) => {
    stop = subscribe(() => {
      if (isVaultSessionUnlocked()) resolve('unlocked')
    })
    register(resolve)
  }).finally(() => stop())
}

// Unlocks (or creates) the vault and starts the session only if the form that asked is still
// open: a result that arrives after its prompt closed is dropped.
export async function unlockVaultSessionIfCurrent(unlock, isCurrent) {
  const locksBefore = lockCount
  const key = await unlock()
  if (!isCurrent() || lockCount !== locksBefore) return false
  startVaultSession(key)
  return true
}

// Runs a save and reports whether the form that asked is still open, so a late success
// leaves a closed form (and whichever form replaced it) alone.
export async function saveIfCurrent(save, isCurrent) {
  await save()
  return isCurrent()
}
