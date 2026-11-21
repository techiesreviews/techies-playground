import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Source inspection of the Checks panel: the Node runner cannot render JSX, so these tests read
// the markup and class names. The rendered panel is recorded in docs/changes.
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const checksPanel = readFileSync(new URL('./ChecksPanel.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

const classOf = (source, marker) => {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `found ${marker}`)
  return source.slice(start).match(/className="([^"]*)"/)[1].split(/\s+/)
}

test('the i shows the limits as Good, Medium and Bad, and links to the article', () => {
  const info = checksPanel.slice(checksPanel.indexOf('function ScoresInfo('), checksPanel.indexOf('function ScoresInfo(') + 4000)
  assert.match(info, /role="dialog"/)
  assert.match(info, /aria-label="What the scores mean"/)
  for (const word of ['Good', 'Medium', 'Bad']) assert.match(info, new RegExp(`[>']${word}[<']`), `${word} column`)
  assert.match(checksPanel, /const rows = LIMIT_ROWS\.filter\(/, 'the table is built from the real limits')
  assert.match(checksPanel, /<ScoresInfo open=\{info\} rows=\{rows\} \/>/)
  assert.match(info, /<span className="sr-only">never<\/span>/, 'an empty cell reads as never')
  assert.match(info, /href=\{CHECKS_ARTICLE_URL\}/)
  assert.match(info, /More information/)
  assert.match(info, /target="_blank"/, 'the article opens beside the Playground, so the site stays open')
  assert.ok(classOf(info, '<table').includes('[overflow-wrap:anywhere]'), 'at 320 px with 200% text the table wraps instead of scrolling the panel sideways')
  assert.ok(classOf(info, 'href={CHECKS_ARTICLE_URL}').includes('min-h-11'), 'More information is 44 px tall')
  assert.match(checksPanel, /aria-label="What the scores mean"[\s\S]{0,200}aria-expanded=\{info\}/, 'the i button says whether it is open')
})

test('the panel is an overview of the checks with one check open at a time, and no previous or next', () => {
  assert.match(checksPanel, /All checks/, 'the way back to the overview')
  assert.doesNotMatch(checksPanel, /Previous|Next check|aria-label="Next/, 'no previous and next arrows')
  assert.doesNotMatch(checksPanel, /Count up/, 'numbers roll, with no switch')
  assert.match(checksPanel, /checksByStatus\(report\.checks\)/, 'what needs fixing comes first')
  assert.doesNotMatch(checksPanel, /PassedGroup|report\.tiles/, 'no folded Passed group and no number tiles')
  const row = classOf(checksPanel, 'data-check={')
  assert.ok(row.includes('min-h-11') && row.includes('any-pointer-coarse:min-h-12'), 'rows are 44 px, 48 px on touchscreens')
})

test('the panel uses the words Passed, Warning and Improve', () => {
  assert.match(checksPanel, /STATUS_LABEL\[/)
  assert.doesNotMatch(checksPanel, /'Failed'|>Failed<|failed ·/, 'no Failed label')
})

test('the panel says which page it checked, and when a check is running', () => {
  assert.match(checksPanel, /Page checked · \$\{clockTime\(run\.time\)\} · took \$\{formatSeconds\(run\.took\)\}/)
  assert.match(checksPanel, /Checking this page…/)
  assert.match(checksPanel, /className="[^"]*\bfont-mono\b[^"]*">\{run\.path\}/, 'the path is in the code font')
})

test('a check that is open stays open when the page changes', () => {
  // The open check lives in the panel, not in the run: a new run only refreshes it.
  assert.match(checksPanel, /const \[openId, setOpenId\] = useState\(null\)/)
  assert.doesNotMatch(checksPanel, /useEffect\(\(\) => \{[^}]*setOpenId\(null\)[^}]*\}, \[run/, 'a new run does not close the open check')
})

test('the numbers roll only for new results, and never with reduced motion', () => {
  assert.match(checksPanel, /prefers-reduced-motion: reduce/)
  assert.match(styles, /\.checks-strip \{[^}]*transition: transform 800ms cubic-bezier\(0\.19, 1, 0\.22, 1\)/)
  for (const name of ['checks-strip', 'checks-view', 'checks-info']) {
    const reduced = styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)', styles.indexOf(`.${name}`)))
    assert.match(reduced.slice(0, 400), /transition: none/, `${name}: no motion with reduced motion`)
  }
})

test('the spinner waits a moment before it shows, so quick runs do not flash', () => {
  assert.match(styles, /\.checks-delay-in \{[^}]*animation: checks-delay-in \d+ms step-end/)
  assert.match(checksPanel, /checks-delay-in/)
  const button = checksPanel.slice(checksPanel.indexOf('export function ChecksButton('), checksPanel.indexOf('function CheckRow('))
  assert.match(button, /<Spinner className="checks-delay-in/, 'the bar spinner waits too')
})

test('at 320 px with 200% text the Checks title wraps above Run again and Close', () => {
  const head = classOf(checksPanel, 'data-checks-head')
  assert.ok(head.includes('flex-wrap'), 'the head row wraps')
  const title = classOf(checksPanel, 'data-checks-title')
  assert.ok(title.includes('flex-auto') && title.includes('min-w-0'), 'the title keeps its own width, so the row wraps before it is covered')
  const actions = classOf(checksPanel, 'data-checks-actions')
  assert.ok(actions.includes('ml-auto') && actions.includes('flex-wrap'), 'Run again and Close stay at the right and can wrap')
})

test('row names wrap and values keep their width, so 200% text at 320 px stays inside the panel', () => {
  const row = checksPanel.slice(checksPanel.indexOf('data-check={'), checksPanel.indexOf('</button>', checksPanel.indexOf('data-check={')))
  assert.match(row, /className="min-w-0 flex-1 font-medium[^"]*"/)
  assert.match(row, /className=\{?[`"]shrink-0 whitespace-nowrap tabular-nums/)
})

test('at 320 px with 200% text the i drops below the headline instead of covering it', () => {
  const row = checksPanel.slice(checksPanel.lastIndexOf('<div className=', checksPanel.indexOf('{headline}</p>')))
  assert.ok(classOf(row, '<div').includes('@max-[15rem]:flex-wrap'), 'the headline row wraps when the panel is narrow for its text')
  assert.ok(classOf(row, '<p').includes('@max-[15rem]:basis-full'), 'the headline takes the whole line')
  assert.ok(classOf(row, 'aria-label="What the scores mean"').includes('@max-[15rem]:ml-auto'), 'the i stays at the right, where its table opens')
})

test('Keep open and Discard and close have 44 px tap areas on every screen', () => {
  for (const label of ['Keep open', 'Discard and close']) {
    const end = app.indexOf(`${label}\n`)
    const button = app.slice(app.lastIndexOf('<button', end), end)
    assert.match(button, /<span className="absolute top-1\/2 left-1\/2 h-\[max\(100%,2\.75rem\)\] w-\[max\(100%,2\.75rem\)\] -translate-1\/2" aria-hidden="true" \/>/, label)
  }
})

test('the launcher column shrinks with the page, so 320 px has no 4 px sideways scroll', () => {
  // A plain grid column is as wide as its widest content. The setup tabs scroll on their own, but
  // they still made the column 304 px inside a 280 px form, 4 px past a 320 px page.
  const launcher = app.slice(app.lastIndexOf('<form className=', app.indexOf('launch() }}>')))
  assert.ok(classOf(launcher, '<form').includes('grid-cols-1'), 'the column can be narrower than the tab row')
})

test('the checks run on every page that opens, also with the panel closed', () => {
  assert.match(app, /createCheckQueue\(\)/)
  assert.doesNotMatch(app, /createRunGuard/)
  assert.match(app, /client\.onNavigation\(/)
  assert.match(app, /checkedPagePath\(/)
})
