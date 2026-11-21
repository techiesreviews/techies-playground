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
  // Up to 1040 px the mark is the icon alone, like the bar's other notes, so a full bar with
  // every label showing from 768 px still keeps Close on screen.
  assert.match(button, /<span className="sr-only">, <\/span>\s*<span className="max-\[1041px\]:sr-only">\{failed\} failed<\/span>/)
})

test('up to 1040 px "networking blocked" and "failed" after Updates are for screen readers only', () => {
  // The note without a count (skipped or error) is hidden visually, not removed.
  assert.match(button, /\$\{count \? 'max-\[1041px\]:hidden' : 'max-\[1041px\]:sr-only'\}/)
})

test('a failed or blocked update keeps an amber warning icon on the button at every width', () => {
  // The words are screen-reader only up to 1040 px, so the icon is what shows the state there,
  // like the Checks waiting note. It has no responsive hide class.
  assert.match(source, /const notRun = updates\.state === 'error' \|\| updates\.state === 'skipped'/)
  assert.match(button, /\{notRun && <ExclamationTriangleIcon className="size-3\.5 shrink-0 fill-amber-300" aria-hidden="true" \/>\}/)
  // The tooltip names the state instead of saying "Updated at start".
  assert.match(button, /updates\.state === 'error' \? 'Updates failed at start'/)
  assert.match(button, /updates\.state === 'skipped' \? 'Updates · networking blocked'/)
})

test('only the name in the note is cut short, so the versions and +N always show', () => {
  const name = button.match(/<span className="([^"]*)" title=\{note\}>\{note\}<\/span>\s*\{noteEnd\}/)
  assert.ok(name, 'the name has its own span, followed by noteEnd outside it')
  assert.match(name[1], /\bmin-w-0\b/)
  assert.match(name[1], /\bmax-w-\S+/)
  assert.match(name[1], /\btruncate\b/)
  // An item WordPress sent without a name still shows its versions and +N, with one space.
  assert.match(button, /\{\(note \|\| noteEnd\) && \(/)
  assert.match(button, /\{count \? \(note \? ': ' : ':'\) : '· '\}/)
})

test('where a name shows, the Updates button shrinks instead of pushing Close off the edge', () => {
  // Every box from the wrapper down to the name may shrink below its content width, but only
  // from 1041 px: below that the note is a count with nothing to cut, so it keeps its width.
  assert.match(source, /export const BAR_BUTTON_CLASS = '[^']*\bshrink-0\b/)
  assert.match(source, /const SHRINK_WITH_NAME = 'min-\[1041px\]:shrink min-\[1041px\]:min-w-0'/)
  assert.match(source, /const UPDATES_BUTTON_CLASS = `\$\{BAR_BUTTON_CLASS\} \$\{SHRINK_WITH_NAME\}`/)
  assert.match(source, /<span ref=\{wrapRef\} className=\{`relative flex shrink-0 \$\{SHRINK_WITH_NAME\}`\}>/)
  assert.match(button, /className=\{UPDATES_BUTTON_CLASS\}/)
  // Very long versions are clipped inside the note rather than drawn over Close.
  assert.match(button, /<span className=\{`flex min-w-0 overflow-hidden /)
  // Now that the button may shrink, the label, the count and "N failed" must not wrap onto a
  // second line: "Update failed" would break at its space and be clipped by the bar row.
  const label = button.match(/<span className="([^"]*)">\{label\}<\/span>/)
  assert.ok(label, 'the label has its own span')
  assert.match(label[1], /\bshrink-0\b/)
  assert.match(label[1], /\bwhitespace-nowrap\b/)
  assert.match(button, /<span className="[^"]*\bwhitespace-nowrap\b[^"]*min-\[1041px\]:hidden">/)
  assert.match(button, /<span className="inline-flex [^"]*\bwhitespace-nowrap\b[^"]*text-amber-300">/)
})

test('the note can be reached and scrolled with the keyboard, and takes focus when it opens', () => {
  const note = source.slice(source.indexOf('{open && ('), source.indexOf('</h3>'))
  assert.match(note, /ref=\{noteRef\}/)
  assert.match(note, /role="dialog"/)
  // Named by its heading, which says "Updates at start" when networking is blocked or the update failed.
  assert.match(note, /aria-labelledby=\{titleId\}/)
  assert.match(note, /<h3 id=\{titleId\}/)
  assert.doesNotMatch(note, /aria-label="/)
  assert.match(note, /tabIndex=\{0\}/)
  assert.match(note, /focus-visible:outline-2/)
  // Opening the note moves focus into it, so arrow keys scroll a long list; Escape returns focus
  // to Updates (App.jsx).
  assert.match(source, /useEffect\(\(\) => \{\s*if \(open\) noteRef\.current\?\.focus\(\)\s*\}, \[open\]\)/)
})

test('rows in the note are keyed by position, not by a name two items can share', () => {
  assert.doesNotMatch(source, /key=\{entry\.name\}/)
  assert.equal(source.match(/\[overflow-wrap:anywhere\]/g).length, 3, 'updated names, failed rows and the Already current line wrap long names')
})
