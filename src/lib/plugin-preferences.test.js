import assert from 'node:assert/strict'
import test from 'node:test'
import {
  forgetPluginRecency,
  markPluginSelected,
  parsePluginRecency,
  sortAndFilterPlugins,
} from './plugin-preferences.js'

const plugins = [
  { id: 'unblock', label: 'Unblock', filename: 'unblock-1.0.0-beta.7.zip', versionHint: '1.0.0-beta.7' },
  { id: 'novamira-pro', label: 'Novamira Pro', filename: 'novamira-pro-1.8.0.zip', versionHint: '1.8.0' },
  { id: 'novamira', label: 'Novamira', filename: 'novamira-1.11.0.zip', versionHint: '1.11.0' },
]

test('sorts plugins by most recently selected and then alphabetically', () => {
  const recency = { unblock: 20, novamira: 10 }
  assert.deepEqual(sortAndFilterPlugins(plugins, recency).map((plugin) => plugin.id), [
    'unblock',
    'novamira',
    'novamira-pro',
  ])
})

test('searches plugin names, ids, filenames, and versions', () => {
  assert.deepEqual(sortAndFilterPlugins(plugins, {}, 'pro').map((plugin) => plugin.id), ['novamira-pro'])
  assert.deepEqual(sortAndFilterPlugins(plugins, {}, 'beta.7').map((plugin) => plugin.id), ['unblock'])
  assert.deepEqual(sortAndFilterPlugins(plugins, {}, '1.11').map((plugin) => plugin.id), ['novamira'])
})

test('persists only valid timestamps and can forget removed plugins', () => {
  const parsed = parsePluginRecency('{"unblock":12,"bad":"recent","negative":-1}')
  const marked = markPluginSelected(parsed, 'novamira', 20)
  assert.deepEqual(forgetPluginRecency(marked, 'unblock'), { novamira: 20 })
})
