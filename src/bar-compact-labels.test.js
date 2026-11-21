import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source inspection of the Playground bar: the Node runner cannot render JSX, so these tests read
// the class names. The rendered check at 641 to 1280 px is recorded in docs/changes.
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const checksPanel = readFileSync(new URL('./ChecksPanel.jsx', import.meta.url), 'utf8')
const updatesControl = readFileSync(new URL('./UpdatesControl.jsx', import.meta.url), 'utf8')

// The bar from the Licenses button to Close.
const bar = app.slice(app.indexOf('ref={licenseButtonRef}'), app.indexOf('aria-label="Close Playground"'))
const checksButton = checksPanel.slice(checksPanel.indexOf('export function ChecksButton('), checksPanel.indexOf('function CheckRow('))
const updatesButton = updatesControl.slice(updatesControl.indexOf('<button'), updatesControl.indexOf('</button>'))

test('up to 767 px the bar buttons show their icons only, so Close stays on a full bar from 641 px', () => {
  assert.ok(bar.includes('Export snapshot') && checksButton.includes('Checks') && updatesButton.includes('{label}'), 'found the bar buttons')
  for (const [name, source] of [['bar in App.jsx', bar], ['ChecksButton', checksButton], ['Updates button', updatesButton]]) {
    assert.doesNotMatch(source, /max-sm:sr-only/, `${name}: no label is hidden only up to 640 px`)
    assert.doesNotMatch(source, /(^|[\s"'`])sm:hidden/, `${name}: no compact text shows only up to 640 px`)
  }
  // Each label keeps its accessible name: it is hidden visually, not removed.
  assert.match(bar, /<span className="max-md:sr-only">Licenses<\/span>/)
  assert.match(bar, /<span className="max-md:sr-only">\{snapshotExporting \? 'Exporting…' : 'Export snapshot'\}<\/span>/)
  assert.match(checksButton, /<span className="max-md:sr-only">Checks<\/span>/)
  assert.match(updatesButton, /<span className="shrink-0 whitespace-nowrap max-md:sr-only">\{label\}<\/span>/)
  // Licenses shows 2/3 instead of "· 2 of 3 active" up to 767 px.
  assert.match(bar, /<span className="max-md:sr-only">· \{licenseFillSummary\(licenseFill\)\}<\/span>/)
  assert.match(bar, /<span className="md:hidden" aria-hidden="true">/)
  // Both sides use the theme's md breakpoint (max-md is below 768 px, md is 768 px and up), so
  // no window width shows both the full summary and 2/3, or neither.
  assert.doesNotMatch(`${bar}${checksButton}${updatesButton}`, /(max|min)-\[76[78]px\]:/, 'compact rules use the md breakpoint, not a pixel value')
  // An icon alone gets even padding on both sides.
  assert.match(updatesControl, /export const BAR_BUTTON_CLASS = '[^']*max-md:px-2\.5/)
  assert.doesNotMatch(bar, /max-sm:px-2\.5/)
})

test('each pixel breakpoint in the bar hides and shows at one width, so no window width gets both or neither', () => {
  // Tailwind reads max-[Npx] as "narrower than N px" and min-[Npx] as "N px and wider", so a
  // pair only meets when both name the same N.
  const source = `${bar}${checksButton}${updatesControl}`
  const below = new Set([...source.matchAll(/max-\[(\d+)px\]:/g)].map((match) => match[1]))
  const from = new Set([...source.matchAll(/min-\[(\d+)px\]:/g)].map((match) => match[1]))
  assert.ok(below.size && from.size, 'found the breakpoints')
  assert.deepEqual([...below].sort(), [...from].sort())
})

test('Run checks and Open in are at least 44 px tall wherever a touchscreen exists', () => {
  const runButton = checksPanel.slice(checksPanel.indexOf('onClick={() => { if (!running) onRun() }}'), checksPanel.indexOf("'Run checks'}"))
  const runClass = runButton.match(/className="([^"]*)"/)[1].split(/\s+/)
  assert.ok(runClass.includes('any-pointer-coarse:min-h-11'), 'Run checks: 44 px on any touchscreen, not only when touch is the main pointer')
  assert.ok(!runClass.includes('pointer-coarse:min-h-11'), 'Run checks: no rule for a touch-first device only')
  const openStart = checksPanel.indexOf('onClick={() => onOpenCheck(check.tool)}')
  const openButton = checksPanel.slice(openStart, checksPanel.indexOf('</button>', openStart))
  const openClass = openButton.match(/className="([^"]*)"/)[1].split(/\s+/)
  assert.ok(openClass.includes('any-pointer-coarse:min-h-11'), 'Open in: 44 px on any touchscreen')
  assert.doesNotMatch(openButton, /pointer-fine:hidden/, 'Open in: no tap area that a mouse-first touchscreen laptop hides')
})

test('below 384 px the bar is tighter, so Close stays on screen on a full bar from 320 px', () => {
  // xs is a theme breakpoint in rem like sm and md, so larger text tightens the bar sooner.
  // 384 px, not 360: at 360 px a full bar with two-digit counts put Close 3.3 px off screen.
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
  assert.match(styles, /@theme \{[^}]*--breakpoint-xs: 24rem;/)
  const barRow = app.slice(app.lastIndexOf('<div className="', app.indexOf('{confirmingPlaygroundClose ? (')))
  assert.match(barRow.match(/className="([^"]*)"/)[1], /\bmax-sm:gap-2\.5 max-xs:gap-1\b/)
  const closeButton = app.slice(app.indexOf('aria-label="Close Playground"'), app.indexOf('</button>', app.indexOf('aria-label="Close Playground"')))
  // Below 384 px every bar button is at least 40 px wide, so with the 4 px gap each tap area is
  // at least 44 px. The room comes from tighter padding and inner gaps on buttons with a count.
  const buttonClasses = [
    bar.match(/ref=\{licenseButtonRef\}[\s\S]*?className="([^"]*)"/)[1],
    bar.match(/onClick=\{exportSiteSnapshot\}\s*className="([^"]*)"/)[1],
    updatesControl.match(/export const BAR_BUTTON_CLASS = '([^']*)'/)[1],
  ]
  for (const className of buttonClasses) assert.match(className, /\bmax-xs:min-w-10 max-xs:justify-center max-xs:gap-1 max-xs:px-1\.5\b/, className)
  // Close holds only its 16 px icon: 0.75 rem padding a side makes it 40 px.
  assert.match(closeButton.match(/className="([^"]*)"/)[1], /\bmax-xs:px-3\b/)
  // Each tap area is as wide as its button plus the gap, so neighbours' tap areas meet and never
  // overlap.
  const tapAreas = [...`${bar}${closeButton}${updatesControl}`.matchAll(/max-sm:w-\[calc\(100%\+0\.625rem\)\]([^"]*)"/g)]
  assert.equal(tapAreas.length, 4, 'Licenses, Export snapshot, Close and BarTapTarget')
  for (const [, rest] of tapAreas) assert.match(rest, /^ max-xs:w-\[calc\(100%\+0\.25rem\)\]/)
})

test('the Checks numbers switch to two columns by the panel width in rem, so larger text never spills', () => {
  const panel = checksPanel.slice(checksPanel.indexOf('<aside'), checksPanel.indexOf('</aside>'))
  // The panel is the container: 25 rem wide at most, so four tiles only when it has its full
  // width, whatever the text size.
  assert.match(panel.match(/<aside[\s\S]*?className="([^"]*)"/)[1], /(^|\s)@container(\s|$)/)
  const grid = panel.match(/<div className="(mt-3 grid [^"]*)">/)
  assert.ok(grid, 'found the tiles grid')
  assert.match(grid[1], /\bgrid-cols-4\b/)
  assert.match(grid[1], /@max-\[25rem\]:grid-cols-2/)
  assert.doesNotMatch(grid[1], /max-\[\d+px\]:/, 'no viewport pixel breakpoint: it ignores the text size')
})
