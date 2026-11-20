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
})

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64')
const MEASURED = {
  title: 'Dashboard', time: 0.62, memory: 44 * 1048576, memoryLimit: 256 * 1048576, queries: 36, queryTime: 0.025,
  slowQueries: 0, duplicates: 2, errorCounts: { error: 0, warning: 0, notice: 0, deprecated: 0 }, errors: [],
  http: [], plugins: [{ name: 'WP 2FA', time: 0.05 }, { name: 'Query Monitor', time: 0.02 }],
}

test('reads the numbers the measure plugin appends to the page', async () => {
  const { MEASURE_MARKER, parseMeasurement } = await import('./checks.js')
  const page = `<html>…</html>\n<!-- ${MEASURE_MARKER}${encode({ ...MEASURED, title: 'Plugins ‹ Café' })} -->`
  assert.deepEqual(parseMeasurement(page), { ...MEASURED, title: 'Plugins ‹ Café' })
  // Odd fields read as zero or empty, never as text that could break the panel.
  const odd = parseMeasurement(`<!-- ${MEASURE_MARKER}${encode({ time: 'x', errors: [null, { line: '4' }], http: 'no', plugins: [{ name: 3 }] })} -->`)
  assert.equal(odd.time, 0)
  assert.deepEqual(odd.errors, [{ kind: 'error', message: '', file: '', line: 0 }])
  assert.deepEqual(odd.http, [])
  assert.deepEqual(odd.plugins, [{ name: '3', time: 0 }])
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
  assert.equal(both.checks.find((check) => check.id === 'queries').details, '36 queries, 0.025 s together. Warning above 100.')
  assert.equal(both.checks.find((check) => check.id === 'memory').details, '17% of the 256 MB limit. Warning above 75%, failure above 90%.')
  assert.match(both.checks.at(-1).details, /^WP 2FA took 0\.05 s to load, Query Monitor 0\.02 s\./)
  assert.deepEqual(evaluateChecks(MEASURED, ['code-profiler']).checks.map((check) => check.id), ['slowest-plugin'])
  const none = evaluateChecks(MEASURED, [])
  assert.deepEqual(none.checks, [])
  assert.deepEqual(none.tiles.map((tile) => [tile.label, tile.value, tile.status]), [
    ['Page time', '0.62 s', 'pass'], ['Memory', '44 MB', 'pass'], ['Queries', '36', 'pass'], ['PHP errors', '0', 'pass'],
  ])
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
  assert.equal(failing.checks[0].value, '1 warning, 2 notices')
  assert.match(failing.checks[2].details, /^2 of 2 calls to other sites failed: api\.wordpress\.org\./)
  assert.equal(failing.tiles.find((tile) => tile.id === 'php-errors').status, 'fail')
})

test('the verdict leads with failures, then warnings, else all passed', async () => {
  const { checksVerdict } = await import('./checks.js')
  const report = (passed, warnings, failed) => ({ passed, warnings, failed, checks: Array(passed + warnings + failed) })
  assert.deepEqual(checksVerdict(report(8, 0, 0)), { status: 'pass', headline: 'All 8 checks passed', short: '8 passed' })
  assert.deepEqual(checksVerdict(report(1, 0, 0)), { status: 'pass', headline: 'The check passed', short: '1 passed' })
  assert.deepEqual(checksVerdict(report(6, 2, 0)), { status: 'warn', headline: '2 checks need a look', short: '2 warnings' })
  assert.deepEqual(checksVerdict(report(6, 1, 1)), { status: 'fail', headline: '1 check failed', short: '1 failed' })
  assert.deepEqual(checksVerdict(report(5, 0, 3)), { status: 'fail', headline: '3 checks failed', short: '3 failed' })
})

test('screen readers hear when the checks start and what they found', async () => {
  const { checksAnnouncement } = await import('./checks.js')
  assert.equal(checksAnnouncement({ state: 'idle' }), '')
  assert.equal(checksAnnouncement({ state: 'running' }), 'Running checks.')
  assert.equal(checksAnnouncement({ state: 'done', report: { passed: 7, warnings: 0, failed: 1, checks: Array(8) } }), 'Checks: 1 check failed.')
  assert.equal(checksAnnouncement({ state: 'error', message: 'This page did not return its numbers.' }), 'The checks could not run. This page did not return its numbers.')
})
