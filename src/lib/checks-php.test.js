import test from 'node:test'
import assert from 'node:assert/strict'
import { getPHPLoaderModule } from '@php-wasm/node-8-3'
import { loadPHPRuntime, PHP } from '@php-wasm/universal'
import { CHECKS_PLUGIN, MEASURE_MARKER, MEASURE_PLUGIN, evaluateChecks, parseMeasurement } from './checks.js'

// Runs the checks must-use plugin in real PHP 8.3 with add_action stubbed, then fires the
// head and footer hooks for one request's techies-check value.
const HARNESS = `<?php
$GLOBALS['actions'] = array();
function add_action( $hook, $callback ) { $GLOBALS['actions'][ $hook ][] = $callback; }
$check = getenv( 'CHECK' );
if ( '' !== $check ) { $_GET['techies-check'] = $check; }
require '/plugin.php';
foreach ( array( 'admin_head', 'admin_print_footer_scripts', 'wp_head', 'wp_print_footer_scripts' ) as $hook ) {
	echo "[$hook]";
	foreach ( $GLOBALS['actions'][ $hook ] ?? array() as $callback ) { $callback(); }
}
`

async function render(check) {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.writeFile('/plugin.php', CHECKS_PLUGIN)
  php.writeFile('/harness.php', HARNESS)
  const response = await php.run({ scriptPath: '/harness.php', env: { CHECK: check } })
  assert.equal(response.errors, '', response.errors)
  const [, head, footer, frontHead, frontFooter] = response.text.split(/\[(?:admin_head|admin_print_footer_scripts|wp_head|wp_print_footer_scripts)\]/)
  assert.equal(frontHead, head)
  assert.equal(frontFooter, footer)
  return { head, footer }
}

test('prints only the script its check asks for', async () => {
  const queryMonitor = await render('query-monitor')
  assert.equal(queryMonitor.head, '')
  assert.match(queryMonitor.footer, /#wp-admin-bar-query-monitor > a/)
  // Query Monitor reopens its last panel itself; clicking its toggle then would close it.
  assert.match(queryMonitor.footer, /localStorage\.getItem\(panelKey\)/)
  const codeProfiler = await render('code-profiler')
  assert.match(codeProfiler.head, /localStorage\.removeItem\('qm-admin-panel'\)/)
  assert.equal(codeProfiler.footer, '')
  for (const other of ['', 'unknown']) assert.deepEqual(await render(other), { head: '', footer: '' })
})

// Runs the measure must-use plugin in real PHP 8.3 against stubbed WordPress functions: a
// page that raises a warning, a deprecation and an @-silenced notice, runs queries (one of
// them twice, one slow), calls another site with a license key in the address, and loads
// two plugins.
const MEASURE_HARNESS = `<?php
define( 'ABSPATH', '/wordpress/' );
$GLOBALS['actions'] = array();
function add_action( $hook, $callback, $priority = 10, $args = 1 ) { $GLOBALS['actions'][ $hook ][] = $callback; }
function do_action( $hook, ...$args ) { foreach ( $GLOBALS['actions'][ $hook ] ?? array() as $callback ) { $callback( ...$args ); } }
function plugin_basename( $file ) { return str_replace( '/wordpress/wp-content/plugins/', '', $file ); }
function wp_parse_url( $url, $part ) { return parse_url( $url, $part ); }
function is_wp_error( $thing ) { return false; }
function wp_remote_retrieve_response_code( $response ) { return $response['code']; }
function get_plugins() { return array( 'wp-2fa/wp-2fa.php' => array( 'Name' => 'WP 2FA' ) ); }
function is_admin() { return ! getenv( 'FRONT' ); }
// WordPress returns the document title already escaped and texturized.
function wp_get_document_title() { return 'Site &#8211; Tagline &amp; more'; }
function wp_strip_all_tags( $text ) { return trim( strip_tags( $text ) ); }
function timer_float() { return 0.5; }
function wp_convert_hr_to_bytes( $value ) { return 268435456; }
function wp_json_encode( $value ) { return json_encode( $value ); }
$GLOBALS['previous'] = array();
set_error_handler( function ( $type, $message ) { $GLOBALS['previous'][] = $message; return true; } );
if ( getenv( 'MEASURE' ) ) { $_GET['techies-measure'] = '1'; }
require '/measure.php';
$GLOBALS['title'] = 'Plugins <b>page</b>';
do_action( 'muplugins_loaded' );
do_action( 'plugin_loaded', '/wordpress/wp-content/plugins/wp-2fa/wp-2fa.php' );
do_action( 'plugin_loaded', '/wordpress/wp-content/plugins/other/other.php' );
trigger_error( 'Something odd in /wordpress/wp-content/plugins/wp-2fa/x.php', E_USER_WARNING );
trigger_error( 'Old function', E_USER_DEPRECATED );
trigger_error( 'file_get_contents(https://api.vendor.com/v1/check?license_key=SECRET-KEY-123&site=a): Failed to open stream', E_USER_WARNING );
@trigger_error( 'Silenced', E_USER_NOTICE );
$wpdb = new stdClass();
$wpdb->num_queries = 3;
$wpdb->queries = array( array( "SELECT * FROM wp_options WHERE option_value = 'SECRET-KEY-123'", 0.01 ), array( "SELECT * FROM wp_options WHERE option_value = 'SECRET-KEY-123'", 0.2 ), array( 'SELECT 1', 0.001 ) );
for ( $call = 0; $call < (int) getenv( 'CALLS_BEFORE' ); $call++ ) {
	do_action( 'http_api_debug', array( 'code' => 200 ), 'response', 'WpOrg\\\\Requests\\\\Requests', array(), 'https://api.wordpress.org/plugins/info/' );
}
do_action( 'http_api_debug', array( 'code' => 403 ), 'response', 'WpOrg\\\\Requests\\\\Requests', array(), 'https://api.freemius.com/v1/check?license_key=SECRET-KEY-123' );
echo '<html>page</html>';
do_action( 'shutdown' );
echo "\\nHOOKS:" . implode( ',', array_keys( $GLOBALS['actions'] ) );
echo "\\nPREVIOUS:" . json_encode( $GLOBALS['previous'] );
`

async function measure(on, { front = false, callsBefore = 0 } = {}) {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.writeFile('/measure.php', MEASURE_PLUGIN)
  php.writeFile('/harness.php', MEASURE_HARNESS)
  const response = await php.run({ scriptPath: '/harness.php', env: { MEASURE: on ? '1' : '', FRONT: front ? '1' : '', CALLS_BEFORE: String(callsBefore) } })
  assert.equal(response.errors, '', response.errors)
  return response.text
}

test('the measure plugin reports counts and times, never a query or an address with a key in it', async () => {
  const text = await measure(true)
  const report = parseMeasurement(text)
  assert.equal(report.title, 'Plugins page')
  assert.equal(report.time, 0.5)
  assert.equal(report.memoryLimit, 268435456)
  assert.deepEqual([report.queries, report.slowQueries, report.duplicates], [3, 1, 1])
  assert.ok(Math.abs(report.queryTime - 0.211) < 1e-9)
  // The @-silenced notice is skipped; the warning and the deprecation are counted.
  assert.deepEqual(report.errorCounts, { error: 0, warning: 2, notice: 0, deprecated: 1 })
  // An address in an error message keeps its host and path; its query, which can hold a
  // license key, is cut.
  assert.deepEqual(report.errors.map((error) => [error.kind, error.message, error.file]), [
    ['warning', 'Something odd in /wordpress/wp-content/plugins/wp-2fa/x.php', '/harness.php'],
    ['deprecated', 'Old function', '/harness.php'],
    ['warning', 'file_get_contents(https://api.vendor.com/v1/check?…): Failed to open stream', '/harness.php'],
  ])
  assert.deepEqual(report.http, [{ host: 'api.freemius.com', code: 403 }])
  assert.deepEqual(report.plugins.map((plugin) => plugin.name).sort(), ['WP 2FA', 'other/other.php'])
  // The handler that was there before still sees every error, the silenced one too.
  const previous = JSON.parse(text.split('\nPREVIOUS:')[1])
  assert.deepEqual(previous.filter((message) => !message.includes('vendor.com')), ['Something odd in /wordpress/wp-content/plugins/wp-2fa/x.php', 'Old function', 'Silenced'])
  // The page and its report never carry the key (only the earlier handler sees the message unchanged).
  assert.doesNotMatch(text.split('\nHOOKS:')[0], /SECRET-KEY-123/)
})

test('the measure plugin sends a front-end page title as plain text', async () => {
  const report = parseMeasurement(await measure(true, { front: true }))
  assert.equal(report.title, 'Site – Tagline & more')
})

test('a failed call after the first 20 still counts', async () => {
  const report = parseMeasurement(await measure(true, { callsBefore: 20 }))
  assert.deepEqual([report.calls, report.failedCalls], [21, 1])
  assert.deepEqual(report.http.at(-1), { host: 'api.freemius.com', code: 403 })
  const calls = evaluateChecks(report, ['query-monitor']).checks.find((check) => check.id === 'outside-calls')
  assert.equal(calls.value, '1 failed')
  assert.match(calls.details, /^1 of 21 calls to other sites failed: api\.freemius\.com\./)
})

test('the measure plugin does nothing on a normal page', async () => {
  const text = await measure(false)
  assert.doesNotMatch(text, new RegExp(MEASURE_MARKER))
  assert.match(text, /\nHOOKS:\n/)
  assert.match(text, /\nPREVIOUS:\["Something odd/)
})
