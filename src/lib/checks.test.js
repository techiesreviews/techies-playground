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
  assert.equal(checkResultsPath(codeProfiler, recipe({ repositoryPlugins: ['code-profiler'] }), '/'), '/wp-admin/admin.php?page=code-profiler')
  assert.equal(checkResultsPath(codeProfiler, recipe({ plugins: ['code-profiler-pro'] }), '/'), '/wp-admin/admin.php?page=code-profiler-pro')
})

test('the checks must-use plugin opens the Query Monitor panel only when asked', () => {
  assert.equal(CHECKS_PLUGIN_PATH, '/wordpress/wp-content/mu-plugins/techies-checks.php')
  assert.match(CHECKS_PLUGIN, /^<\?php/)
  assert.match(CHECKS_PLUGIN, /'query-monitor' !== \$_GET\['techies-check'\]/)
  assert.match(CHECKS_PLUGIN, /#wp-admin-bar-query-monitor > a/)
  assert.match(CHECKS_PLUGIN, /admin_print_footer_scripts/)
  assert.match(CHECKS_PLUGIN, /wp_print_footer_scripts/)
})
