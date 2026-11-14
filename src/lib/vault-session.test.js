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
