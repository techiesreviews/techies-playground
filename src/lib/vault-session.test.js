import assert from 'node:assert/strict'
import test from 'node:test'
import { getVaultSessionKey, isVaultSessionUnlocked, lockVaultSession, startVaultSession, subscribeVaultSession } from './vault-session.js'

test('keeps the unlocked key in memory until it is locked, and tells listeners', () => {
  const seen = []
  const unsubscribe = subscribeVaultSession(() => seen.push(isVaultSessionUnlocked()))
  assert.equal(isVaultSessionUnlocked(), false)
  assert.equal(getVaultSessionKey(), null)
  const key = { type: 'secret' }
  startVaultSession(key)
  assert.equal(getVaultSessionKey(), key)
  lockVaultSession()
  assert.equal(getVaultSessionKey(), null)
  unsubscribe()
  startVaultSession(key)
  lockVaultSession()
  assert.deepEqual(seen, [true, false])
  assert.throws(() => startVaultSession(null), /key/)
})

test('a launch waits for an unlock from anywhere, a skip or a close, then stops listening', async () => {
  const { waitForVaultUnlock } = await import('./vault-session.js')
  let answer
  const unlocking = waitForVaultUnlock((resolve) => { answer = resolve })
  lockVaultSession()
  startVaultSession({ type: 'secret' })
  assert.equal(await unlocking, 'unlocked')
  lockVaultSession()
  let settled = 'pending'
  const skipping = waitForVaultUnlock((resolve) => { answer = resolve })
  skipping.then((value) => { settled = value })
  lockVaultSession()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, 'pending')
  answer('skip')
  assert.equal(await skipping, 'skip')
  let stops = 0
  const counted = (listener) => {
    const stop = subscribeVaultSession(listener)
    return () => { stops += 1; stop() }
  }
  const skipped = waitForVaultUnlock((resolve) => resolve('skip'), counted)
  assert.equal(await skipped, 'skip')
  assert.equal(stops, 1)
  const unlocked = waitForVaultUnlock(() => {}, counted)
  startVaultSession({ type: 'secret' })
  assert.equal(await unlocked, 'unlocked')
  assert.equal(stops, 2)
  lockVaultSession()
})

test('an unlock that finishes after its prompt closed does not unlock the session', async () => {
  const { unlockVaultSessionIfCurrent } = await import('./vault-session.js')
  lockVaultSession()
  let finish
  let current = true
  const pending = unlockVaultSessionIfCurrent(() => new Promise((resolve) => { finish = resolve }), () => current)
  current = false
  finish({ type: 'secret' })
  assert.equal(await pending, false)
  assert.equal(isVaultSessionUnlocked(), false)
  assert.equal(await unlockVaultSessionIfCurrent(async () => ({ type: 'secret' }), () => true), true)
  assert.equal(isVaultSessionUnlocked(), true)
  lockVaultSession()
})
