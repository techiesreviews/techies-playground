import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWordPressOrgImageUrl } from './wordpress-org-images.js'

test('upgrades a protocol-relative artwork URL on the allowed host to HTTPS', () => {
  assert.equal(normalizeWordPressOrgImageUrl('//ps.w.org/i.svg', 'ps.w.org'), 'https://ps.w.org/i.svg')
})

test('matches the allowed artwork host exactly', () => {
  for (const value of [
    'https://evil.ps.w.org/i.svg',
    'https://ps.w.org.evil.example/i.svg',
    'https://ps.w.org@evil.example/i.svg',
  ]) {
    assert.equal(normalizeWordPressOrgImageUrl(value, 'ps.w.org'), '', value)
  }
})

test('gives no artwork for values that are not URLs', () => {
  for (const value of [42, null, undefined, '']) {
    assert.equal(normalizeWordPressOrgImageUrl(value, 'ps.w.org'), '')
  }
})
