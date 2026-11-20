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

test('the bar control names each state of the updates at start', async () => {
  const { updatesLabel } = await import('./plugin-updates.js')
  assert.deepEqual(updatesLabel({ state: 'idle' }), { label: 'Updates', note: '', count: '', ready: false })
  assert.deepEqual(updatesLabel({ state: 'running' }), { label: 'Updating…', note: '', count: '', ready: false })
  assert.deepEqual(updatesLabel({ state: 'skipped' }), { label: 'Updates', note: 'networking blocked', count: '', ready: true })
  assert.deepEqual(updatesLabel({ state: 'error', message: 'Boom' }), { label: 'Updates', note: 'failed', count: '', ready: true })
  const updated = { updated: [{ name: 'WP 2FA', from: '3.1', to: '3.2' }, { name: 'B', from: '1', to: '2' }], failed: [], current: [] }
  assert.deepEqual(updatesLabel({ state: 'done', result: updated }), { label: 'Updated', note: 'WP 2FA 3.1 → 3.2 +1', count: '2', ready: true })
  assert.deepEqual(updatesLabel({ state: 'done', result: { updated: [], failed: [{ name: 'X', message: 'No' }], current: [] } }), { label: 'Update failed', note: 'X', count: '1', ready: true })
  assert.deepEqual(updatesLabel({ state: 'done', result: { updated: [], failed: [], current: [] } }), { label: 'Up to date', note: '', count: '', ready: true })
})

test('screen readers hear what the updates at start changed', async () => {
  const { updatesAnnouncement } = await import('./plugin-updates.js')
  assert.equal(updatesAnnouncement({ state: 'idle' }), '')
  assert.equal(updatesAnnouncement({ state: 'running' }), 'Updating plugins and themes.')
  assert.equal(updatesAnnouncement({ state: 'skipped' }), 'Plugins were not updated: this setup blocks networking.')
  assert.equal(updatesAnnouncement({ state: 'error', message: 'Timed out.' }), 'Plugins were not updated. Timed out.')
  assert.equal(updatesAnnouncement({ state: 'done', result: { updated: [], failed: [], current: [] } }), 'Every plugin and theme was up to date.')
  assert.equal(
    updatesAnnouncement({ state: 'done', result: { updated: [{ name: 'WP 2FA', from: '3.1', to: '3.2' }], failed: [{ name: 'Example Pro', message: 'No package.' }], current: [] } }),
    'Updated at start: WP 2FA 3.1 to 3.2. Not updated: Example Pro.',
  )
})
