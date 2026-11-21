import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source inspection of UpdatesControl: the Node runner cannot render JSX, so these tests read the
// button and note markup. The rendered look is recorded in docs/changes, apart from these tests.
const source = readFileSync(new URL('./UpdatesControl.jsx', import.meta.url), 'utf8')
const button = source.slice(source.indexOf('<button'), source.indexOf('</button>'))

test('the Updates button shows how many failed next to what updated', () => {
  assert.match(source, /const \{ label, note, noteEnd, count, failed, ready \} = updatesLabel\(updates\)/)
  assert.match(button, /\{failed && \(/)
  assert.match(button, /ExclamationTriangleIcon/)
  // The icon is hidden from screen readers, so a separator keeps the count apart from the note.
  assert.match(button, /<span className="sr-only">, <\/span>\s*<span className="max-sm:sr-only">\{failed\} failed<\/span>/)
})

test('only the name in the note is cut short, so the versions and +N always show', () => {
  const name = button.match(/<span className="([^"]*)" title=\{note\}>\{note\}<\/span>\s*\{noteEnd\}/)
  assert.ok(name, 'the name has its own span, followed by noteEnd outside it')
  assert.match(name[1], /\bmax-w-\S+/)
  assert.match(name[1], /\btruncate\b/)
})

test('rows in the note are keyed by position, not by a name two items can share', () => {
  assert.doesNotMatch(source, /key=\{entry\.name\}/)
  assert.equal(source.match(/\[overflow-wrap:anywhere\]/g).length, 3, 'updated names, failed rows and the Already current line wrap long names')
})
