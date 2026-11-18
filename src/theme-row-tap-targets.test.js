import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source inspection of ThemeRow in App.jsx, the same check as plugin-row-tap-targets.test.js: the Node runner
// cannot render JSX, so these tests read the classes. The real-browser geometry check is recorded in docs/changes.
const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const themeRow = source.slice(source.indexOf('function ThemeRow('), source.indexOf('function LaunchSummary('))

function actionButton(labelStart) {
  const start = themeRow.indexOf(`aria-label={\`${labelStart}`)
  assert.ok(start > 0, `ThemeRow has a button labelled "${labelStart}…"`)
  const open = themeRow.lastIndexOf('<button', start)
  const close = themeRow.indexOf('</button>', start)
  return themeRow.slice(open, close)
}

function classTokens(element) {
  return element.match(/className="([^"]*)"/)[1].split(/\s+/)
}

// Box edge in px for a pointer variant: a 16 px icon (size-4) plus the padding on both sides (Tailwind: 1 unit = 4 px).
function boxSize(tokens, variant) {
  const padding = (prefix) => tokens.find((token) => token.startsWith(`${prefix}p-`) && /^\d+(\.\d+)?$/.test(token.slice(prefix.length + 2)))
  const token = (variant && padding(`${variant}:`)) || padding('')
  assert.ok(token, 'a padding token sets the box size')
  return 16 + 2 * Number(token.split('p-').at(-1)) * 4
}

for (const label of ['Replace ', 'Remove ']) {
  test(`${label.trim()} in a theme row is a 44 px box on any touchscreen and 28 px with only a mouse`, () => {
    const button = actionButton(label)
    assert.match(button, /<\w+Icon className="size-4 /)
    const tokens = classTokens(button)
    assert.ok(boxSize(tokens, 'any-pointer-coarse') >= 44, 'tap box at least 44 px wherever a touchscreen exists')
    assert.equal(boxSize(tokens, ''), 28, 'mouse-only size unchanged')
  })

  test(`${label.trim()} in a theme row has no tap area wider than its own box, so it cannot overlap its neighbour`, () => {
    const button = actionButton(label)
    assert.doesNotMatch(button, /absolute/, 'no absolutely positioned tap overlay')
    const margins = classTokens(button).filter((token) => /^-?m[xytrbls]?-/.test(token.split(':').at(-1)))
    assert.deepEqual(margins, [], 'no margin pulls it under a neighbour')
  })
}

test('the theme row button group shows on any touchscreen and keeps its 4 px gap', () => {
  const start = themeRow.indexOf('aria-label={`Replace ')
  const group = themeRow.slice(themeRow.lastIndexOf('<div', start), start)
  const tokens = classTokens(group)
  assert.ok(tokens.includes('gap-1'), 'the group keeps gap-1 between Replace and Delete')
  assert.ok(tokens.includes('pointer-fine:opacity-0'), 'with a mouse it still hides until hover or focus')
  assert.ok(tokens.includes('any-pointer-coarse:opacity-100'), 'shown wherever a touchscreen exists, touchscreen laptops included')
  assert.ok(tokens.includes('any-pointer-coarse:pointer-events-auto'), 'tappable wherever a touchscreen exists')
})
