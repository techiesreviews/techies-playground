import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source inspection of UpdatesControl: the Node runner cannot render JSX, so these tests read the
// button and note markup. The real-browser look is checked with kit ux and recorded in docs/changes.
const source = readFileSync(new URL('./UpdatesControl.jsx', import.meta.url), 'utf8')
const button = source.slice(source.indexOf('<button'), source.indexOf('</button>'))

test('the Updates button shows how many failed next to what updated', () => {
  assert.match(source, /const \{ label, note, count, failed, ready \} = updatesLabel\(updates\)/)
  assert.match(button, /\{failed && \(/)
  assert.match(button, /ExclamationTriangleIcon/)
  assert.match(button, /\{failed\} failed/)
})

test('the change note on the button has a width cap so it never pushes Close off the bar', () => {
  const note = button.match(/\{note && <span className=\{`([^`]*)`\}/)
  assert.ok(note, 'the note span has a class list')
  assert.match(note[1], /\bmax-w-\S+/)
  assert.match(note[1], /\btruncate\b/)
})

test('rows in the note are keyed by position, not by a name two items can share', () => {
  assert.doesNotMatch(source, /key=\{entry\.name\}/)
  assert.match(source, /\[overflow-wrap:anywhere\]/)
})
