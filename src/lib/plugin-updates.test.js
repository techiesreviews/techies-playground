import assert from 'node:assert/strict'
import test from 'node:test'
import { PLUGIN_UPDATES_CODE, UPDATES_MARKER, parsePluginUpdates, runPluginUpdates, updatedNote } from './plugin-updates.js'

const answer = (result) => `<p>noise</p>${UPDATES_MARKER}${JSON.stringify(result)}`

test('reads each update as old and new version, plus what failed and what was already current', () => {
  const result = parsePluginUpdates(answer({
    updated: [{ name: 'WP 2FA', from: '3.1', to: '3.2' }, { name: 'Twenty Twenty-Five', from: '1.2', to: '1.3' }],
    failed: [{ name: 'Example Pro', message: 'Update package not available.' }, { name: 'Bare' }],
    current: [{ name: 'Query Monitor', version: '4.1.1' }],
  }))
  assert.deepEqual(result, {
    updated: [{ name: 'WP 2FA', from: '3.1', to: '3.2' }, { name: 'Twenty Twenty-Five', from: '1.2', to: '1.3' }],
    failed: [{ name: 'Example Pro', message: 'Update package not available.' }, { name: 'Bare', message: 'Update failed.' }],
    current: [{ name: 'Query Monitor', version: '4.1.1' }],
  })
})

test('a missing or odd answer is an error or reads as empty lists', () => {
  assert.throws(() => parsePluginUpdates('<html>fatal</html>'), /did not return an update result/)
  assert.deepEqual(parsePluginUpdates(answer({ updated: 'x', failed: [null, 3] })), { updated: [], failed: [], current: [] })
  assert.deepEqual(parsePluginUpdates(answer({ updated: [{ name: 5, from: null }] })).updated, [{ name: '', from: '', to: '' }])
})

test('runs the update code once and reads its answer', async () => {
  const calls = []
  const client = { run: async (request) => { calls.push(request); return { text: answer({ updated: [], failed: [], current: [] }) } } }
  assert.deepEqual(await runPluginUpdates(client), { updated: [], failed: [], current: [] })
  assert.deepEqual(calls, [{ code: PLUGIN_UPDATES_CODE }])
})

test('the note names the first change and counts the rest', () => {
  assert.equal(updatedNote({ updated: [] }), '')
  assert.equal(updatedNote({ updated: [{ name: 'WP 2FA', from: '3.1', to: '3.2' }] }), 'WP 2FA 3.1 → 3.2')
  assert.equal(updatedNote({ updated: [{ name: 'WP 2FA', from: '3.1', to: '3.2' }, { name: 'B', from: '1', to: '2' }, { name: 'C', from: '1', to: '2' }] }), 'WP 2FA 3.1 → 3.2 +2')
})
