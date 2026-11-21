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
  assert.match(name[1], /\bmin-w-0\b/)
  assert.match(name[1], /\bmax-w-\S+/)
  assert.match(name[1], /\btruncate\b/)
  // An item WordPress sent without a name still shows its versions and +N.
  assert.match(button, /\{\(note \|\| noteEnd\) && \(/)
})

test('on a full bar the Updates button shrinks instead of pushing Close off the edge', () => {
  // Every box from the wrapper down to the name may shrink below its content width.
  assert.match(source, /const UPDATES_BUTTON_CLASS = BAR_BUTTON_CLASS\.replace\('shrink-0', 'min-w-0'\)/)
  assert.match(source, /<span ref=\{wrapRef\} className="relative flex min-w-0">/)
  assert.match(button, /className=\{UPDATES_BUTTON_CLASS\}/)
  assert.match(button, /<span className=\{`flex min-w-0 /)
  // Now that the button may shrink, the count and "N failed" must not wrap onto a second line.
  assert.match(button, /<span className="[^"]*\bwhitespace-nowrap\b[^"]*min-\[1041px\]:hidden">/)
  assert.match(button, /<span className="inline-flex [^"]*\bwhitespace-nowrap\b[^"]*text-amber-300">/)
})

test('rows in the note are keyed by position, not by a name two items can share', () => {
  assert.doesNotMatch(source, /key=\{entry\.name\}/)
  assert.equal(source.match(/\[overflow-wrap:anywhere\]/g).length, 3, 'updated names, failed rows and the Already current line wrap long names')
})
