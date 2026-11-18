import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source inspection of PluginRow in App.jsx: the Node runner cannot render JSX, so these tests read the
// Replace and Delete buttons' classes. The real-browser geometry check is recorded in docs/changes.
const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const pluginRow = source.slice(source.indexOf('function PluginRow('), source.indexOf('function ThemeRow('))

function actionButton(labelStart) {
  const start = pluginRow.indexOf(`aria-label={\`${labelStart}`)
  assert.ok(start > 0, `PluginRow has a button labelled "${labelStart}…"`)
  const open = pluginRow.lastIndexOf('<button', start)
  const close = pluginRow.indexOf('</button>', start)
  return pluginRow.slice(open, close)
}

function classTokens(button) {
  return button.match(/className="([^"]*)"/)[1].split(/\s+/)
}

// Box edge in px for a pointer variant: a 16 px icon (size-4) plus the padding on both sides (Tailwind: 1 unit = 4 px).
function boxSize(tokens, variant) {
  const padding = (prefix) => tokens.find((token) => token.startsWith(`${prefix}p-`) && /^\d+(\.\d+)?$/.test(token.slice(prefix.length + 2)))
  const token = (variant && padding(`${variant}:`)) || padding('')
  return 16 + 2 * Number(token.split('p-').at(-1)) * 4
}

for (const label of ['Replace ', 'Remove ']) {
  test(`${label.trim()} in a plugin row is a 44 px box on any touchscreen and 28 px with only a mouse`, () => {
    const button = actionButton(label)
    assert.match(button, /<\w+Icon className="size-4 /)
    const tokens = classTokens(button)
    assert.ok(boxSize(tokens, 'any-pointer-coarse') >= 44, 'tap box at least 44 px wherever a touchscreen exists')
    assert.equal(boxSize(tokens, ''), 28, 'mouse-only size unchanged')
  })

  test(`${label.trim()} in a plugin row has no tap area wider than its own box, so it cannot overlap its neighbour`, () => {
    const button = actionButton(label)
    assert.doesNotMatch(button, /absolute/, 'no absolutely positioned tap overlay')
    const margins = classTokens(button).filter((token) => /^-?m[xytrbls]?-/.test(token.split(':').at(-1)))
    assert.deepEqual(margins, [], 'no margin pulls it under a neighbour')
  })
}
