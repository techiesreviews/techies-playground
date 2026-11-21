import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_RECIPE } from './recipe.js'
import { CHECKS, CHECKS_PLUGIN, CHECKS_PLUGIN_PATH, addCheckToSetup, checkResultsPath, checksInSetup } from './checks.js'

const recipe = (patch = {}) => ({ ...DEFAULT_RECIPE, ...patch })

test('offers Query Monitor and Code Profiler as checks', () => {
  assert.deepEqual(CHECKS.map((check) => check.id), ['query-monitor', 'code-profiler'])
  for (const check of CHECKS) assert.ok(check.name && check.summary)
})

test('a check is in the setup only when its plugin is, free from WordPress.org or uploaded', () => {
  assert.deepEqual(checksInSetup(recipe()), [])
  assert.deepEqual(checksInSetup(recipe({ repositoryPlugins: ['query-monitor'] })).map((check) => check.id), ['query-monitor'])
  assert.deepEqual(checksInSetup(recipe({ plugins: ['code-profiler-pro'] })).map((check) => check.id), ['code-profiler'])
  assert.deepEqual(checksInSetup(recipe({ plugins: ['query-monitor'], repositoryPlugins: ['code-profiler'] })).map((check) => check.id), ['query-monitor', 'code-profiler'])
  assert.deepEqual(checksInSetup(recipe({ repositoryPlugins: ['query-monitor-extend', 'code-profiler-helper'] })), [])
})

test('adding a check adds its free WordPress.org plugin once', () => {
  const added = addCheckToSetup(recipe({ repositoryPlugins: ['akismet'] }), 'query-monitor')
  assert.deepEqual(added.repositoryPlugins, ['akismet', 'query-monitor'])
  assert.deepEqual(addCheckToSetup(added, 'query-monitor').repositoryPlugins, ['akismet', 'query-monitor'])
  const pro = recipe({ plugins: ['code-profiler-pro'] })
  assert.equal(addCheckToSetup(pro, 'code-profiler'), pro)
  assert.throws(() => addCheckToSetup(recipe(), 'unknown'), /Unknown check/)
})

test('Query Monitor results open on the current page with the panel request', () => {
  const [queryMonitor, codeProfiler] = CHECKS
  assert.equal(checkResultsPath(queryMonitor, recipe(), '/wp-admin/edit.php?post_type=page#top'), '/wp-admin/edit.php?post_type=page&techies-check=query-monitor')
  assert.equal(checkResultsPath(queryMonitor, recipe(), '/?techies-check=old'), '/?techies-check=query-monitor')
  assert.equal(checkResultsPath(queryMonitor, recipe(), 'https://elsewhere.example/wp-admin/'), '/wp-admin/?techies-check=query-monitor')
  assert.equal(checkResultsPath(queryMonitor, recipe(), ''), '/wp-admin/?techies-check=query-monitor')
  // Opening the tool never repeats an action the current page ran from its address.
  assert.equal(checkResultsPath(queryMonitor, recipe(), '/wp-admin/update.php?action=upgrade-plugin&_wpnonce=abc'), '/wp-admin/?techies-check=query-monitor')
  assert.equal(checkResultsPath(codeProfiler, recipe({ repositoryPlugins: ['code-profiler'] }), '/'), '/wp-admin/admin.php?page=code-profiler&techies-check=code-profiler')
  assert.equal(checkResultsPath(codeProfiler, recipe({ plugins: ['code-profiler-pro'] }), '/'), '/wp-admin/admin.php?page=code-profiler-pro&techies-check=code-profiler')
})

test('the checks must-use plugin opens the Query Monitor panel, or closes it for Code Profiler, only when asked', () => {
  assert.equal(CHECKS_PLUGIN_PATH, '/wordpress/wp-content/mu-plugins/techies-checks.php')
  assert.match(CHECKS_PLUGIN, /^<\?php/)
  assert.match(CHECKS_PLUGIN, /'query-monitor' !== \$_GET\['techies-check'\]/)
  assert.match(CHECKS_PLUGIN, /#wp-admin-bar-query-monitor > a/)
  assert.match(CHECKS_PLUGIN, /admin_print_footer_scripts/)
  assert.match(CHECKS_PLUGIN, /wp_print_footer_scripts/)
  assert.match(CHECKS_PLUGIN, /'code-profiler' === \$_GET\['techies-check'\]/)
  assert.match(CHECKS_PLUGIN, /localStorage\.removeItem\('qm-admin-panel'\)/)
  assert.match(CHECKS_PLUGIN, /add_action\( 'admin_head'/)
})

test('the page to measure is the current page with the measure request, never another site', async () => {
  const { measurePath } = await import('./checks.js')
  assert.equal(measurePath('/wp-admin/plugins.php?plugin_status=all#top'), '/wp-admin/plugins.php?plugin_status=all&techies-measure=1')
  assert.equal(measurePath('/?techies-check=query-monitor'), '/?techies-measure=1')
  assert.equal(measurePath(''), '/wp-admin/?techies-measure=1')
  assert.equal(measurePath('https://example.com/steal'), '/wp-admin/?techies-measure=1')
  // A plain edit screen has an action but no nonce, so it is measured as it is.
  assert.equal(measurePath('/wp-admin/post.php?post=1&action=edit'), '/wp-admin/post.php?post=1&action=edit&techies-measure=1')
})

test('Run again never repeats an action the current page ran from its address', async () => {
  const { measurePath } = await import('./checks.js')
  assert.equal(measurePath('/wp-admin/update.php?action=upgrade-plugin&plugin=x%2Fx.php&_wpnonce=abc'), '/wp-admin/?techies-measure=1')
  assert.equal(measurePath('/wp-admin/admin.php?page=tool&_ajax_nonce=abc'), '/wp-admin/?techies-measure=1')
})

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64')
const MEASURED = {
  title: 'Dashboard', time: 0.62, memory: 44 * 1048576, memoryLimit: 256 * 1048576, queries: 36, queryTime: 0.025,
  slowQueries: 0, duplicates: 2, errorCounts: { error: 0, warning: 0, notice: 0, deprecated: 0 }, errors: [],
  calls: 0, failedCalls: 0, http: [], plugins: [{ name: 'WP 2FA', time: 0.05 }, { name: 'Query Monitor', time: 0.02 }],
  source: 'playground', qmVersion: '', repeated: [],
}

test('reads the numbers the measure plugin appends to the page', async () => {
  const { MEASURE_MARKER, parseMeasurement } = await import('./checks.js')
  const page = `<html>…</html>\n<!-- ${MEASURE_MARKER}${encode({ ...MEASURED, title: 'Plugins ‹ Café' })} -->`
  assert.deepEqual(parseMeasurement(page), { ...MEASURED, title: 'Plugins ‹ Café' })
  // Odd fields read as zero or empty, never as text that could break the panel.
  const odd = parseMeasurement(`<!-- ${MEASURE_MARKER}${encode({ time: 'x', errors: [null, { line: '4' }], http: 'no', plugins: [{ name: 3 }], source: '<b>', qmVersion: 4, repeated: [{ count: '2', caller: 7 }, 'x'] })} -->`)
  assert.equal(odd.time, 0)
  assert.deepEqual(odd.errors, [{ kind: 'error', message: '', file: '', line: 0 }])
  assert.deepEqual(odd.http, [])
  assert.deepEqual(odd.plugins, [{ name: '3', time: 0 }])
  assert.equal(odd.source, 'playground')
  assert.equal(odd.qmVersion, '')
  assert.deepEqual(odd.repeated, [{ count: 0, caller: '7' }])
  const fromQueryMonitor = parseMeasurement(`<!-- ${MEASURE_MARKER}${encode({ ...MEASURED, source: 'query-monitor', qmVersion: '4.1.1', repeated: [{ count: 3, caller: 'get_option()' }] })} -->`)
  assert.deepEqual([fromQueryMonitor.source, fromQueryMonitor.qmVersion, fromQueryMonitor.repeated], ['query-monitor', '4.1.1', [{ count: 3, caller: 'get_option()' }]])
  assert.throws(() => parseMeasurement('<html>login</html>'), /did not return its numbers/)
})

test('measures with one request to the current page', async () => {
  const { MEASURE_MARKER, measurePage } = await import('./checks.js')
  const calls = []
  const client = { request: async (request) => { calls.push(request); return { text: `<!-- ${MEASURE_MARKER}${encode(MEASURED)} -->` } } }
  assert.equal((await measurePage(client, '/wp-admin/')).queries, 36)
  assert.deepEqual(calls, [{ url: '/wp-admin/?techies-measure=1', method: 'GET' }])
})

test('checks start by themselves only when every needed license is active', async () => {
  const { checksGate } = await import('./checks.js')
  const fill = [{ id: 'wp-2fa', status: 'active' }, { id: 'example-pro', status: 'activated' }, { id: 'other', status: 'rejected' }]
  assert.deepEqual(checksGate([], []), { ready: true, active: 0, total: 0 })
  assert.deepEqual(checksGate(['wp-2fa', 'example-pro'], fill), { ready: true, active: 2, total: 2 })
  assert.deepEqual(checksGate(['wp-2fa', 'other'], fill), { ready: false, active: 1, total: 2 })
  assert.deepEqual(checksGate(['wp-2fa', 'missing'], fill), { ready: false, active: 1, total: 2 })
  // A licence WordPress reports as active counts too, even when no key was filled in.
  assert.deepEqual(checksGate(['wp-2fa', 'missing'], fill, ['missing']), { ready: true, active: 2, total: 2 })
})

test('a clean page passes every check, and only the checks in the setup show', async () => {
  const { evaluateChecks } = await import('./checks.js')
  const both = evaluateChecks(MEASURED, ['query-monitor', 'code-profiler'])
  assert.deepEqual(both.checks.map((check) => [check.id, check.status, check.value]), [
    ['php-errors', 'pass', '0'], ['slow-queries', 'pass', '0'], ['outside-calls', 'pass', '0 failed'],
    ['duplicate-queries', 'pass', '2'], ['queries', 'pass', '36'], ['memory', 'pass', '44 MB'],
    ['page-time', 'pass', '0.62 s'], ['slowest-plugin', 'pass', '0.05 s'],
  ])
  assert.deepEqual([both.passed, both.warnings, both.failed], [8, 0, 0])
  // The limits are in the scale under each check, so the text only says what was found.
  assert.equal(both.checks.find((check) => check.id === 'queries').details, '36 queries, 0.025 s together.')
  assert.equal(both.checks.find((check) => check.id === 'memory').details, '17% of the site’s 256 MB limit.')
  assert.equal(both.checks.at(-1).details, 'WP 2FA took the longest to load.')
  assert.deepEqual(both.checks.at(-1).found, {
    type: 'table', title: 'Load time per plugin',
    rows: [{ name: 'WP 2FA', value: '0.05 s', status: 'pass' }, { name: 'Query Monitor', value: '0.02 s', status: 'pass' }],
  })
  assert.deepEqual(evaluateChecks(MEASURED, ['code-profiler']).checks.map((check) => check.id), ['slowest-plugin'])
  const none = evaluateChecks(MEASURED, [])
  assert.deepEqual(none.checks, [])
  assert.equal('tiles' in none, false, 'the overview lists the checks; the number tiles are gone')
})

test('each check says where its number came from', async () => {
  const { evaluateChecks } = await import('./checks.js')
  const from = (measurement) => Object.fromEntries(evaluateChecks(measurement, ['query-monitor', 'code-profiler']).checks.map((check) => [check.id, check.source]))
  const fromQueryMonitor = from({ ...MEASURED, source: 'query-monitor', qmVersion: '4.1.1' })
  for (const id of ['php-errors', 'slow-queries', 'outside-calls', 'duplicate-queries', 'queries', 'memory', 'page-time']) {
    assert.equal(fromQueryMonitor[id], 'From Query Monitor 4.1.1 on this page.', id)
  }
  // Code Profiler only profiles on its own screen, so the per-page plugin times are the Playground's own.
  assert.equal(fromQueryMonitor['slowest-plugin'], 'Timed by the Playground as each plugin loaded. Code Profiler shows the full profile.')
  const fallback = from({ ...MEASURED, source: 'playground' })
  assert.equal(fallback['page-time'], 'Measured by the Playground: Query Monitor did not report on this page.')
})

test('what each check found: PHP errors, the queries repeated most and the calls that failed', async () => {
  const { evaluateChecks } = await import('./checks.js')
  const report = evaluateChecks({
    ...MEASURED,
    errorCounts: { error: 0, warning: 1, notice: 1, deprecated: 0 },
    errors: [
      { kind: 'warning', message: 'Undefined array key "layout"', file: 'wp-content/plugins/acme/render.php', line: 212 },
      { kind: 'notice', message: 'Called too early', file: '', line: 0 },
    ],
    duplicates: 14,
    repeated: [{ count: 6, caller: 'get_option()' }, { count: 5, caller: '' }],
    calls: 3, failedCalls: 2,
    http: [{ host: 'api.wordpress.org', code: 200 }, { host: 'api.vendor.com', code: 403 }, { host: 'api.other.com', code: 0 }],
  }, ['query-monitor'])
  const found = (id) => report.checks.find((check) => check.id === id).found
  assert.deepEqual(found('php-errors'), {
    type: 'list', title: 'Found on this page', total: 2,
    entries: [
      { status: 'fail', kind: 'PHP warning', message: 'Undefined array key "layout"', where: 'wp-content/plugins/acme/render.php, line 212' },
      { status: 'warn', kind: 'PHP notice', message: 'Called too early', where: '' },
    ],
  })
  assert.deepEqual(found('duplicate-queries'), {
    // No count beside the title: the number of groups listed (at most 3) would read like a total.
    type: 'list', title: 'Repeated most', total: undefined,
    entries: [
      { status: 'warn', count: '6×', message: 'get_option()', where: 'Function that ran it' },
      { status: 'warn', count: '5×', message: 'Unknown function', where: 'Function that ran it' },
    ],
  })
  assert.deepEqual(found('outside-calls'), {
    type: 'list', title: 'Failed calls', total: 2,
    entries: [
      { status: 'warn', message: 'api.vendor.com', where: 'Answered HTTP 403' },
      { status: 'warn', message: 'api.other.com', where: 'No answer' },
    ],
  })
  assert.equal(report.checks.find((check) => check.id === 'outside-calls').details, '2 of 3 calls to other sites failed. Blocked networking makes every call fail.')
  // A clean page has nothing to list.
  const clean = evaluateChecks(MEASURED, ['query-monitor'])
  for (const id of ['php-errors', 'duplicate-queries', 'outside-calls', 'slow-queries']) assert.equal(clean.checks.find((check) => check.id === id).found, undefined, id)
})

test('the "i" lists good, medium and bad for every check, from the same limits that judge them', async () => {
  const { CHECKS_ARTICLE_URL, LIMIT_ROWS } = await import('./checks.js')
  assert.deepEqual(LIMIT_ROWS.map((row) => [row.id, row.name, row.good, row.medium, row.bad]), [
    ['page-time', 'Page time', 'up to 1 s', 'over 1 s', 'over 3 s'],
    ['memory', 'Memory', 'up to 75%', 'over 75%', 'over 90%'],
    ['queries', 'Database queries', 'up to 100', 'over 100', ''],
    ['duplicate-queries', 'Duplicate queries', 'up to 10', 'over 10', ''],
    ['slow-queries', 'Slow queries', 'none', '1 or more', ''],
    ['php-errors', 'PHP errors', 'none', 'notices, deprecations', 'errors, warnings'],
    ['outside-calls', 'Calls to other sites', 'none failed', 'any failed', ''],
    ['slowest-plugin', 'Slowest plugin', 'up to 0.5 s', 'over 0.5 s', ''],
  ])
  assert.equal(LIMIT_ROWS.find((row) => row.id === 'memory').note, 'share of the site’s limit')
  assert.equal(LIMIT_ROWS.find((row) => row.id === 'slow-queries').note, 'longer than 0.05 s')
  assert.deepEqual([...new Set(LIMIT_ROWS.map((row) => row.tool))], ['query-monitor', 'code-profiler'])
  assert.equal(CHECKS_ARTICLE_URL, 'https://techies.review/articles/techies-playground-check-score/')
})

test('the checks that need fixing come first, in their usual order otherwise', async () => {
  const { STATUS_LABEL, checksByStatus } = await import('./checks.js')
  assert.deepEqual(STATUS_LABEL, { pass: 'Passed', warn: 'Warning', fail: 'Improve' })
  const checks = [{ id: 'a', status: 'pass' }, { id: 'b', status: 'warn' }, { id: 'c', status: 'fail' }, { id: 'd', status: 'warn' }, { id: 'e', status: 'pass' }]
  assert.deepEqual(checksByStatus(checks).map((check) => check.id), ['c', 'b', 'd', 'a', 'e'])
  assert.deepEqual(checks.map((check) => check.id), ['a', 'b', 'c', 'd', 'e'], 'the list it was given stays as it was')
})

test('errors and warnings fail, notices warn, and each limit turns a check amber or red', async () => {
  const { CHECK_LIMITS, evaluateChecks } = await import('./checks.js')
  const status = (changes, id) => evaluateChecks({ ...MEASURED, ...changes }, ['query-monitor', 'code-profiler']).checks.find((check) => check.id === id).status
  const counts = (changes) => ({ errorCounts: { error: 0, warning: 0, notice: 0, deprecated: 0, ...changes } })
  assert.equal(status(counts({ warning: 1 }), 'php-errors'), 'fail')
  assert.equal(status(counts({ error: 1 }), 'php-errors'), 'fail')
  assert.equal(status(counts({ deprecated: 2 }), 'php-errors'), 'warn')
  assert.equal(status({ slowQueries: 1 }, 'slow-queries'), 'warn')
  assert.equal(status({ http: [{ host: 'api.wordpress.org', code: 200 }] }, 'outside-calls'), 'pass')
  assert.equal(status({ http: [{ host: 'api.wordpress.org', code: 0 }] }, 'outside-calls'), 'warn')
  assert.equal(status({ duplicates: CHECK_LIMITS.duplicatesWarn + 1 }, 'duplicate-queries'), 'warn')
  assert.equal(status({ queries: CHECK_LIMITS.queriesWarn + 1 }, 'queries'), 'warn')
  assert.equal(status({ memory: 200 * 1048576 }, 'memory'), 'warn')
  assert.equal(status({ memory: 240 * 1048576 }, 'memory'), 'fail')
  assert.equal(status({ time: CHECK_LIMITS.pageTimeWarnSeconds + 0.1 }, 'page-time'), 'warn')
  assert.equal(status({ time: CHECK_LIMITS.pageTimeFailSeconds + 0.1 }, 'page-time'), 'fail')
  // A fresh site builds its pages in 0.2 to 0.3 s in the browser, so 1.5 s already deserves a look.
  assert.equal(status({ time: 1.5 }, 'page-time'), 'warn')
  assert.equal(status({ time: 3.5 }, 'page-time'), 'fail')
  assert.equal(status({ plugins: [{ name: 'Heavy', time: 0.6 }] }, 'slowest-plugin'), 'warn')
  const failing = evaluateChecks({ ...MEASURED, ...counts({ warning: 1, notice: 2 }), http: [{ host: 'api.wordpress.org', code: 0 }, { host: 'api.wordpress.org', code: 0 }] }, ['query-monitor'])
  assert.deepEqual([failing.passed, failing.warnings, failing.failed], [5, 1, 1])
  // The number is the total, so a long breakdown never pushes the panel sideways; the details name each kind.
  assert.equal(failing.checks[0].value, '3')
  assert.equal(failing.checks[0].details, '1 warning, 2 notices on this page.')
  assert.match(failing.checks[2].details, /^2 of 2 calls to other sites failed\./)
  // Without Query Monitor its limits judge nothing, so nothing fails.
  const profilerOnly = evaluateChecks({ ...MEASURED, ...counts({ warning: 1 }), time: 4 }, ['code-profiler'])
  assert.equal(profilerOnly.failed, 0)
})

test('the verdict leads with what to improve, then warnings, else all passed', async () => {
  const { checksVerdict } = await import('./checks.js')
  const report = (passed, warnings, failed) => ({ passed, warnings, failed, checks: Array(passed + warnings + failed) })
  assert.deepEqual(checksVerdict(report(8, 0, 0)), { status: 'pass', headline: 'All 8 checks passed', short: '8 passed' })
  assert.deepEqual(checksVerdict(report(1, 0, 0)), { status: 'pass', headline: 'The check passed', short: '1 passed' })
  assert.deepEqual(checksVerdict(report(6, 2, 0)), { status: 'warn', headline: '2 warnings', short: '2 warnings' })
  assert.deepEqual(checksVerdict(report(7, 1, 0)), { status: 'warn', headline: '1 warning', short: '1 warning' })
  assert.deepEqual(checksVerdict(report(6, 1, 1)), { status: 'fail', headline: '1 check to improve', short: '1 to improve' })
  assert.deepEqual(checksVerdict(report(5, 0, 3)), { status: 'fail', headline: '3 checks to improve', short: '3 to improve' })
})

test('screen readers hear when the checks start and what they found on which page', async () => {
  const { checksAnnouncement } = await import('./checks.js')
  assert.equal(checksAnnouncement({ state: 'idle' }), '')
  assert.equal(checksAnnouncement({ state: 'running' }), 'Running checks.')
  assert.equal(checksAnnouncement({ state: 'done', title: 'Plugins', report: { passed: 7, warnings: 0, failed: 1, checks: Array(8) } }), 'Checks on Plugins: 1 check to improve.')
  assert.equal(checksAnnouncement({ state: 'done', title: '', report: { passed: 8, warnings: 0, failed: 0, checks: Array(8) } }), 'Checks: All 8 checks passed.')
  assert.equal(checksAnnouncement({ state: 'error', message: 'This page did not return its numbers.' }), 'The checks could not run. This page did not return its numbers.')
})

test('a page change is not announced twice: no start, and the result only when it is news', async () => {
  const { checksAnnouncement } = await import('./checks.js')
  // The frame announces the new page itself; a run that starts by itself says nothing.
  assert.equal(checksAnnouncement({ state: 'running', auto: true }), '')
  const report = { passed: 8, warnings: 0, failed: 0, checks: Array(8) }
  assert.equal(checksAnnouncement({ state: 'done', title: 'Dashboard', report, quiet: true }), '')
  assert.equal(checksAnnouncement({ state: 'done', title: 'Dashboard', report, quiet: false }), 'Checks on Dashboard: All 8 checks passed.')
})

test('a result is quiet only when it starts by itself, the panel is closed and the verdict is the same', async () => {
  const { checksQuiet } = await import('./checks.js')
  const pass = { passed: 8, warnings: 0, failed: 0, checks: Array(8) }
  const fail = { passed: 7, warnings: 0, failed: 1, checks: Array(8) }
  assert.equal(checksQuiet({ auto: true, panelOpen: false, previous: pass, report: pass }), true)
  assert.equal(checksQuiet({ auto: true, panelOpen: false, previous: pass, report: fail }), false)
  assert.equal(checksQuiet({ auto: true, panelOpen: true, previous: pass, report: pass }), false)
  assert.equal(checksQuiet({ auto: false, panelOpen: false, previous: pass, report: pass }), false)
  assert.equal(checksQuiet({ auto: true, panelOpen: false, previous: undefined, report: pass }), false)
})

test('a page opened during a run is checked next, and only the latest page waits', async () => {
  const { createCheckQueue } = await import('./checks.js')
  const queue = createCheckQueue()
  const site = {}
  assert.equal(queue.request(site, '/a'), 'start')
  assert.equal(queue.request(site, '/a'), 'skip', 'the page being checked is not checked twice')
  assert.equal(queue.request(site, '/b'), 'queued')
  assert.equal(queue.request(site, '/c'), 'queued')
  assert.equal(queue.waiting(site), true, 'the run on /a is out of date: its result is dropped')
  assert.equal(queue.finish(site), '/c', 'only the latest page runs next')
  assert.equal(queue.request(site, '/c'), 'start')
  assert.equal(queue.waiting(site), false)
  assert.equal(queue.finish(site), null)
})

test('going back to the page being checked cancels the page that waited', async () => {
  const { createCheckQueue } = await import('./checks.js')
  const queue = createCheckQueue()
  const site = {}
  queue.request(site, '/a')
  queue.request(site, '/b')
  assert.equal(queue.request(site, '/a'), 'skip')
  assert.equal(queue.waiting(site), false)
  assert.equal(queue.finish(site), null)
})

test('a page is checked again by itself only after another page, but Run again always runs', async () => {
  const { createCheckQueue } = await import('./checks.js')
  const queue = createCheckQueue()
  const site = {}
  queue.request(site, '/a')
  queue.finish(site)
  assert.equal(queue.request(site, '/a'), 'skip', 'the same page again, as when a tool opens on it')
  assert.equal(queue.request(site, '/a', { force: true }), 'start', 'Run again')
  queue.finish(site)
  assert.equal(queue.request(site, '/b'), 'start')
  queue.finish(site)
  assert.equal(queue.request(site, '/a'), 'start')
})

test('a run on a new site starts at once, and the old site finishing changes nothing', async () => {
  const { createCheckQueue } = await import('./checks.js')
  const queue = createCheckQueue()
  const oldSite = {}
  const newSite = {}
  assert.equal(queue.request(oldSite, '/a'), 'start')
  queue.request(oldSite, '/b')
  assert.equal(queue.request(newSite, '/a'), 'start')
  assert.equal(queue.finish(oldSite), null, 'the old site has nothing left to run')
  assert.equal(queue.request(newSite, '/a'), 'skip', 'the new site is still running')
  assert.equal(queue.finish(newSite), null)
  assert.equal(queue.request(newSite, '/b'), 'start')
})

test('the page that was checked is the one measured, without the Playground’s own parameters', async () => {
  const { checkedPagePath } = await import('./checks.js')
  assert.equal(checkedPagePath('/wp-admin/plugins.php?techies-check=query-monitor'), '/wp-admin/plugins.php')
  assert.equal(checkedPagePath('/?p=1&techies-measure=1'), '/?p=1')
  assert.equal(checkedPagePath(''), '/wp-admin/')
  // A page that ran an action is not loaded again: the dashboard is measured instead.
  assert.equal(checkedPagePath('/wp-admin/update.php?action=upgrade-plugin&_wpnonce=abc'), '/wp-admin/')
  assert.equal(checkedPagePath('https://elsewhere.example/'), '/wp-admin/')
})

test('each page that settles is checked once, and only while the site is current and allowed', async (t) => {
  const { watchCheckPages } = await import('./checks.js')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let navigate
  const client = { onNavigation: (callback) => { navigate = callback } }
  const runs = []
  let current = true
  let allowed = true
  watchCheckPages(client, { isCurrent: () => current, canRun: () => allowed, run: (path) => runs.push(path) })

  // A redirect within 400 ms is one visit.
  navigate('/wp-admin/')
  t.mock.timers.tick(200)
  navigate('/wp-admin/index.php')
  t.mock.timers.tick(399)
  assert.deepEqual(runs, [])
  t.mock.timers.tick(1)
  assert.deepEqual(runs, ['/wp-admin/index.php'])

  // Open in Code Profiler neither runs nor cancels the page that is settling.
  navigate('/wp-admin/plugins.php')
  t.mock.timers.tick(100)
  navigate('/wp-admin/admin.php?page=code-profiler&techies-check=code-profiler')
  t.mock.timers.tick(400)
  assert.deepEqual(runs, ['/wp-admin/index.php', '/wp-admin/plugins.php'])

  // While the licenses are missing nothing runs by itself.
  allowed = false
  navigate('/wp-admin/options-general.php')
  t.mock.timers.tick(400)
  assert.equal(runs.length, 2)

  // A site that was closed or relaunched has no say any more.
  allowed = true
  current = false
  navigate('/wp-admin/tools.php')
  t.mock.timers.tick(400)
  assert.equal(runs.length, 2)
})

test('opening a check in its tool is not a new page to check', async () => {
  const { isCheckToolPage } = await import('./checks.js')
  const codeProfiler = CHECKS.find((check) => check.id === 'code-profiler')
  const queryMonitor = CHECKS.find((check) => check.id === 'query-monitor')
  const recipe = addCheckToSetup(DEFAULT_RECIPE, 'code-profiler')
  // Code Profiler's own screen would otherwise be checked, and the panel would say "Checks on Code Profiler".
  assert.equal(isCheckToolPage(checkResultsPath(codeProfiler, recipe, '/wp-admin/plugins.php')), true)
  assert.equal(isCheckToolPage(checkResultsPath(queryMonitor, recipe, '/wp-admin/plugins.php')), true)
  assert.equal(isCheckToolPage('/wp-admin/admin.php?page=code-profiler'), false)
  assert.equal(isCheckToolPage('/wp-admin/plugins.php'), false)
  assert.equal(isCheckToolPage(''), false)
})
