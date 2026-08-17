import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendSpinup,
  MAX_SPINUP_HISTORY,
  parseSpinupHistory,
  serializeSpinupHistory,
} from './spinup-history.js'
import { validateRecipe } from './recipe.js'

const recipe = validateRecipe({
  schemaVersion: 1,
  name: 'Unblock',
  wordpress: 'latest',
  php: '8.4',
  networking: true,
  storage: 'temporary',
  landingPage: '/wp-admin/plugins.php',
  plugins: ['unblock'],
  theme: '',
})

test('records safe launch metadata without plugin files', () => {
  const records = appendSpinup([], {
    recipe,
    plugins: [{ id: 'unblock', label: 'Unblock', versionHint: '1.0.0-beta.7', file: 'not-stored' }],
  }, '2026-08-01T12:00:00.000Z', 'launch-1')

  assert.deepEqual(records[0], {
    id: 'launch-1',
    launchedAt: '2026-08-01T12:00:00.000Z',
    recipe,
    plugins: [{ id: 'unblock', label: 'Unblock', version: '1.0.0-beta.7' }],
    theme: null,
  })
  assert.deepEqual(parseSpinupHistory(serializeSpinupHistory(records)), records)
})

test('keeps newest launches first and caps local history', () => {
  let records = []
  for (let index = 0; index < MAX_SPINUP_HISTORY + 2; index += 1) {
    records = appendSpinup(records, { recipe, plugins: [] }, `2026-08-01T12:${String(index).padStart(2, '0')}:00.000Z`, `launch-${index}`)
  }

  assert.equal(records.length, MAX_SPINUP_HISTORY)
  assert.equal(records[0].id, `launch-${MAX_SPINUP_HISTORY + 1}`)
})

test('round trips history and drops unsafe entries', () => {
  const safe = appendSpinup([], { recipe, plugins: [] }, '2026-08-01T12:00:00.000Z', 'safe')
  const unsafe = { ...safe[0], id: 'unsafe', recipe: { ...recipe, licenseKey: 'secret' } }
  const parsed = parseSpinupHistory(JSON.stringify([...safe, unsafe]))

  assert.deepEqual(parseSpinupHistory(serializeSpinupHistory(parsed)), safe)
})

test('records the active premium theme without its ZIP', () => {
  const themedRecipe = { ...recipe, theme: 'novamira-pro' }
  const records = appendSpinup([], {
    recipe: themedRecipe,
    plugins: [],
    theme: { id: 'novamira-pro', filename: 'novamira-pro-1.8.0.zip', versionHint: '1.8.0', file: 'not-stored' },
  }, '2026-08-01T12:00:00.000Z', 'theme-launch')

  assert.deepEqual(records[0].theme, { id: 'novamira-pro', label: 'novamira pro', version: '1.8.0' })
  assert.equal('file' in records[0].theme, false)
})

test('keeps only the latest launch of the same browser-saved environment', () => {
  const browserRecipe = { ...recipe, storage: 'browser', wordpress: '7.0.4' }
  const first = appendSpinup([], {
    recipe: browserRecipe,
    plugins: [{ id: 'unblock', label: 'Unblock', version: '1.0.0' }],
  }, '2026-08-01T12:00:00.000Z', 'first-launch')
  const relaunched = appendSpinup(first, {
    recipe: browserRecipe,
    plugins: [{ id: 'unblock', label: 'Unblock', version: '1.1.0' }],
  }, '2026-08-01T13:00:00.000Z', 'latest-launch')

  assert.equal(relaunched.length, 1)
  assert.equal(relaunched[0].id, 'latest-launch')
  assert.equal(relaunched[0].plugins[0].version, '1.1.0')
})
