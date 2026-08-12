import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWordPressVersionOptions,
  fetchWordPressVersionOptions,
  preserveSelectedWordPressVersion,
} from './wordpress-versions.js'

test('builds a dynamic latest label and pinned historical releases', () => {
  const options = createWordPressVersionOptions({
    offers: [
      { response: 'autoupdate', current: '6.9.7', locale: 'en_US' },
      { response: 'upgrade', current: '7.0.4', locale: 'en_US' },
      { response: 'autoupdate', current: '7.0.4', locale: 'en_US' },
      { response: 'autoupdate', current: '6.3.10', locale: 'en_US' },
      { response: 'autoupdate', current: '6.2.11', locale: 'en_US' },
    ],
  })

  assert.deepEqual(options, [
    { value: 'latest', label: 'Latest stable — 7.0.4' },
    { value: '7.0.4', label: 'WordPress 7.0.4 (pinned)' },
    { value: '6.9.7', label: 'WordPress 6.9.7 (pinned)' },
    { value: '6.3.10', label: 'WordPress 6.3.10 (pinned)' },
  ])
})

test('keeps an exact saved version when it is absent from the live list', () => {
  assert.deepEqual(
    preserveSelectedWordPressVersion([{ value: 'latest', label: 'Latest stable — 7.0.4' }], '6.8.3'),
    [
      { value: 'latest', label: 'Latest stable — 7.0.4' },
      { value: '6.8.3', label: 'WordPress 6.8.3 (saved recipe)' },
    ],
  )
})

test('loads versions from the official endpoint response', async () => {
  const options = await fetchWordPressVersionOptions({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ offers: [{ response: 'upgrade', current: '7.0.4', locale: 'en_US' }] }),
    }),
  })

  assert.equal(options[0].label, 'Latest stable — 7.0.4')
})
