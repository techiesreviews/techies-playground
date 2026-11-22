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
  assert.match(barRowClass(), /\bmax-sm:gap-2\.5 \$\{confirmingPlaygroundClose \? '' : 'max-xs:gap-1'\}/)
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

// The className of the bar row that holds both the normal bar and the close confirmation.
function barRowClass() {
  const start = app.lastIndexOf('<div className=', app.indexOf('{confirmingPlaygroundClose ? ('))
  return app.slice(start, app.indexOf('>', start))
}

test('below 384 px the close confirmation keeps its 10 px gap, so Keep open and Discard and close stay apart', () => {
  // Only the normal bar needs the 4 px gap to fit Close; the confirmation fits at 320 px without it.
  const rowClass = barRowClass()
  assert.match(rowClass, /\bmax-sm:gap-2\.5\b/)
  const withoutNormalBarGap = rowClass.replace("${confirmingPlaygroundClose ? '' : 'max-xs:gap-1'}", '')
  assert.doesNotMatch(withoutNormalBarGap, /max-xs:gap-/, 'no tight gap applies while confirming')
})

test('the limits under one check stack below 15 rem, so 200% text at 320 px stays inside the panel', () => {
  // At 320 px with 200% text the panel is 10 rem wide: three columns side by side would spill.
  const panel = checksPanel.slice(checksPanel.indexOf('<aside'), checksPanel.indexOf('</aside>'))
  assert.match(panel.match(/<aside[\s\S]*?className="([^"]*)"/)[1], /(^|\s)@container(\s|$)/)
  const scale = checksPanel.match(/aria-label=\{`Limits for \$\{limit\.name\}`\}\s*className="([^"]*)"/)
  assert.ok(scale, 'found the limits under one check')
  assert.match(scale[1], /\bgrid-flow-col\b/)
  assert.match(scale[1], /@max-\[15rem\]:grid-flow-row/)
  assert.doesNotMatch(scale[1], /max-\[\d+px\]:/, 'no viewport pixel breakpoint: it ignores the text size')
})

test('below 20 rem (320 px with 200% text) the Playground bar wraps so Close stays on screen without overlapping tap areas', () => {
  const shellStart = app.indexOf('aria-label="WordPress Playground"')
  const shellGrid = app.slice(shellStart, app.indexOf('>', app.indexOf('<div', shellStart)) + 1)
  assert.match(shellGrid, /(?:^|[\s"])@container\b/, 'the shell measures its width in rem so 200% text wraps the bar')
  assert.match(shellGrid, /\bgrid-rows-\[minmax\(2rem,auto\)_1fr\]/, 'a wrapped bar grows instead of clipping')

  const rowClass = barRowClass()
  assert.match(rowClass, /@max-\[20rem\]:flex-wrap\b/)
  assert.match(rowClass, /@max-\[20rem\]:py-1\b/)
  assert.match(rowClass, /\$\{confirmingPlaygroundClose \? '' : '@max-\[20rem\]:gap-x-1 @max-\[20rem\]:gap-y-2'\}/)

  const closeButton = app.slice(app.indexOf('aria-label="Close Playground"'), app.indexOf('</button>', app.indexOf('aria-label="Close Playground"')))
  assert.match(closeButton.match(/className="([^"]*)"/)[1], /@max-\[20rem\]:ml-auto\b/)

  const tapAreas = [...`${bar}${closeButton}${updatesControl}`.matchAll(/max-sm:w-\[calc\(100%\+0\.625rem\)\]([^"]*)"/g)]
  assert.equal(tapAreas.length, 4)
  for (const [, rest] of tapAreas) {
    assert.match(rest, /@max-\[20rem\]:h-\[calc\(100%\+0\.5rem\)\]/)
    assert.match(rest, /@max-\[20rem\]:w-\[calc\(100%\+0\.25rem\)\]/)
  }
})

test('below 20 rem the close confirmation wraps Keep open and Discard and close without overflowing or overlapping tap areas', () => {
  const confirmBlock = app.slice(app.indexOf('{confirmingPlaygroundClose ? ('), app.indexOf(') : (', app.indexOf('{confirmingPlaygroundClose ? (')))
  assert.match(confirmBlock, /<p className="[^"]*@max-\[20rem\]:basis-full[^"]*@max-\[20rem\]:whitespace-normal[^"]*">Discard this temporary site\?<\/p>/)
  for (const label of ['Keep open', 'Discard and close']) {
    const end = confirmBlock.indexOf(`${label}\n`)
    const button = confirmBlock.slice(confirmBlock.lastIndexOf('<button', end), end)
    assert.match(button.match(/className="([^"]*)"/)[1], /\bmax-w-full\b/, `${label} cannot overflow a narrow bar`)
    assert.match(button, /@max-\[20rem\]:h-\[max\(100%,44px\)\] @max-\[20rem\]:w-\[max\(100%,44px\)\]/, `${label} keeps a 44 px tap area without bloating past 56 px at 200% text`)
  }
})

test('at 320 px with 200% text the launcher has no 20 rem body minimum or unwrapping rows that scroll sideways', () => {
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
  const bodyRule = styles.slice(styles.indexOf('body {'), styles.indexOf('}', styles.indexOf('body {')) + 1)
  assert.doesNotMatch(bodyRule, /min-width:\s*20rem/, 'body min-width: 20rem forces a 640 px page at 200% text')

  const headerStart = app.indexOf('<header className=')
  const header = app.slice(headerStart, app.indexOf('{showChangelog && (', headerStart))
  assert.match(header, /<div className="relative mx-auto flex max-w-7xl flex-wrap items-center/)
  assert.match(header, /<div className="flex min-w-0 flex-wrap items-center gap-3">/)

  const envHeader = app.slice(app.lastIndexOf('<div className=', app.indexOf('id="environment-heading"')), app.indexOf('</div>', app.indexOf('id="environment-heading"')))
  assert.match(envHeader, /\bflex-wrap\b/)

  const featuredStart = app.indexOf('aria-labelledby="featured-plugins-heading"')
  const featured = app.slice(featuredStart, app.indexOf('</section>', featuredStart))
  assert.match(featured, /(?:^|[\s"])@container\b/)
  assert.match(featured, /grid-cols-1 gap-3 @\[15rem\]:grid-cols-2 lg:grid-cols-4/)

  const checksSectionStart = app.indexOf('aria-labelledby="checks-heading"')
  const checksSection = app.slice(checksSectionStart, app.indexOf('</section>', checksSectionStart))
  assert.match(checksSection, /<span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full/)
  assert.match(checksSection, /<span className="flex min-w-0 max-w-full flex-wrap items-center gap-2">/)

  const nameSaveStart = app.indexOf('aria-labelledby="recipe-heading"')
  const nameSave = app.slice(nameSaveStart, app.indexOf('</section>', nameSaveStart))
  assert.match(nameSave, /<div className="grid grid-cols-1 gap-2">/)
  assert.match(nameSave, /id="recipe-name"[\s\S]*?className="[^"]*\bmin-w-0\b[^"]*\bw-full\b/)

  const selectFn = app.slice(app.indexOf('function Select('), app.indexOf('function TextField('))
  assert.match(selectFn, /grid min-w-0 grid-cols-1/)
  assert.match(selectFn, /grid-cols-\[minmax\(0,1fr\)_--spacing\(8\)\]/)
  assert.match(selectFn, /<select[\s\S]*?\bmin-w-0 w-full\b/)

  const textFieldFn = app.slice(app.indexOf('function TextField('), app.indexOf('function Checkbox('))
  assert.match(textFieldFn, /grid min-w-0 grid-cols-1/)
  assert.match(textFieldFn, /<input[\s\S]*?\bmin-w-0 w-full\b/)

  assert.match(app, /<h1 className="[^"]*\[overflow-wrap:anywhere\][^"]*">Test premium WordPress tools with ease<\/h1>/)
  const checkboxFn = app.slice(app.indexOf('function Checkbox('), app.indexOf('function Radio('))
  assert.match(checkboxFn, /<span className="min-w-0 \[overflow-wrap:anywhere\]">/)
  const radioFn = app.slice(app.indexOf('function Radio('), app.indexOf('function GitHubStarButton('))
  assert.match(radioFn, /<span className="min-w-0 \[overflow-wrap:anywhere\]">/)
})
