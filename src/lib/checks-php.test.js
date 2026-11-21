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
$GLOBALS['done_actions'] = array();
function do_action( $hook, ...$args ) { $GLOBALS['done_actions'][ $hook ] = ( $GLOBALS['done_actions'][ $hook ] ?? 0 ) + 1; foreach ( $GLOBALS['actions'][ $hook ] ?? array() as $callback ) { $callback( ...$args ); } }
function did_action( $hook ) { return $GLOBALS['done_actions'][ $hook ] ?? 0; }
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
if ( getenv( 'QM' ) ) { require '/query-monitor.php'; }
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

// Query Monitor 4.1 as the measure plugin sees it: QM_Collectors with the overview, db_queries,
// php_errors and http collectors, each holding the data shapes Query Monitor fills in. The
// queries hold a license key in their SQL and in a caller's arguments; one error message holds
// it in an address.
const QUERY_MONITOR_STUB = `<?php
define( 'QM_VERSION', '4.1.1' );
class WP_Error {}
class QM_Data_Callsite { public $file; public $line; }
class QM_Backtrace {
	private $callsite;
	public function __construct( $callsite = null ) { $this->callsite = $callsite; }
	public function get_callsite() { return $this->callsite; }
	public function get_stack() { return array( "get_option('license_key')", 'Acme->boot()' ); }
}
class QM_Fake_Collector {
	private $data;
	public function __construct( $data ) { $this->data = $data; }
	public function get_data() { return $this->data; }
}
class QM_Collectors {
	public static $processed = 0;
	public static function init() { return new self(); }
	public function process() { self::$processed++; }
	public static function get( $id ) { return isset( $GLOBALS['qm'][ $id ] ) ? new QM_Fake_Collector( $GLOBALS['qm'][ $id ] ) : null; }
}
function techies_qm_callsite( $file, $line ) { $callsite = new QM_Data_Callsite(); $callsite->file = $file; $callsite->line = $line; return $callsite; }
$secret_sql = "SELECT option_value FROM wp_options WHERE option_name = 'license_key' AND option_value = 'SECRET-KEY-123'";
$GLOBALS['qm'] = array(
	'overview'   => (object) array( 'time_taken' => 1.25, 'memory' => 50331648, 'memory_limit' => 268435456 ),
	'db_queries' => (object) array(
		'rows'      => array(
			array( 'sql' => $secret_sql, 'ltime' => 0.01, 'stack' => array( "get_option('SECRET-KEY-123')", 'Acme->boot()' ) ),
			array( 'sql' => $secret_sql, 'ltime' => 0.06, 'stack' => array( "get_option('SECRET-KEY-123')", 'Acme->boot()' ) ),
			array( 'sql' => $secret_sql, 'ltime' => 0.01, 'trace' => new QM_Backtrace() ),
			array( 'sql' => 'SELECT 1', 'ltime' => 0.002, 'stack' => array( 'WP_Query->get_posts()' ) ),
			array( 'sql' => 'SELECT 1', 'ltime' => 0.002, 'stack' => array() ),
		),
		'expensive' => array( 1 ),
		'total_qs'  => 5,
	),
	'php_errors' => (object) array(
		'errors' => array(
			'a' => (object) array( 'errno' => E_WARNING, 'level' => 'warning', 'suppressed' => false, 'message' => 'Undefined array key "layout" near https://api.vendor.com/v1?license_key=SECRET-KEY-123', 'trace' => new QM_Backtrace( techies_qm_callsite( '/wordpress/wp-content/plugins/acme/render.php', 212 ) ), 'count' => 3 ),
			'b' => (object) array( 'errno' => 2048, 'level' => 'strict', 'suppressed' => false, 'message' => 'Old style', 'trace' => null, 'count' => 1 ),
			'c' => (object) array( 'errno' => E_NOTICE, 'level' => 'notice', 'suppressed' => true, 'message' => 'Silenced', 'trace' => null, 'count' => 1 ),
		),
	),
	'http'       => (object) array(
		'http' => array(
			(object) array( 'host' => 'api.wordpress.org', 'type' => 'HTTP 200', 'local' => false ),
			(object) array( 'host' => 'api.vendor.com', 'type' => 'HTTP 403', 'local' => false ),
			(object) array( 'host' => 'api.other.com', 'type' => 'error', 'result' => new WP_Error(), 'local' => false ),
			(object) array( 'host' => 'example.org', 'type' => 'non-blocking', 'local' => false ),
			(object) array( 'host' => 'playground.local', 'type' => 'error', 'result' => new WP_Error(), 'local' => true ),
		),
	),
);
for ( $call = 0; $call < (int) getenv( 'CALLS_BEFORE' ); $call++ ) {
	array_unshift( $GLOBALS['qm']['http']->http, (object) array( 'host' => 'api.wordpress.org', 'type' => 'HTTP 200', 'local' => false ) );
}
// Query Monitor stops collecting on pages it does not support (the Site Editor, a Customizer
// preview): it fires qm/cease and each collector discards its data, but the collectors stay.
// (The variable is not named QM_…: PHP's wasm runtime then empties QM.)
if ( getenv( 'CEASED' ) ) {
	foreach ( array_keys( $GLOBALS['qm'] ) as $id ) {
		$GLOBALS['qm'][ $id ] = (object) array();
	}
	do_action( 'qm/cease' );
}
`

async function measure(on, { front = false, callsBefore = 0, queryMonitor = false, queryMonitorCeased = false } = {}) {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.writeFile('/measure.php', MEASURE_PLUGIN)
  php.writeFile('/query-monitor.php', QUERY_MONITOR_STUB)
  php.writeFile('/harness.php', MEASURE_HARNESS)
  const response = await php.run({ scriptPath: '/harness.php', env: { MEASURE: on ? '1' : '', FRONT: front ? '1' : '', CALLS_BEFORE: String(callsBefore), QM: queryMonitor ? '1' : '', CEASED: queryMonitorCeased ? '1' : '' } })
  assert.equal(response.errors, '', response.errors)
  return response.text
}

test('with Query Monitor active, the numbers are the ones Query Monitor collected on the page', async () => {
  const text = await measure(true, { queryMonitor: true })
  const report = parseMeasurement(text)
  assert.deepEqual([report.source, report.qmVersion], ['query-monitor', '4.1.1'])
  assert.deepEqual([report.time, report.memory, report.memoryLimit], [1.25, 50331648, 268435456])
  assert.deepEqual([report.queries, report.slowQueries, report.duplicates], [5, 1, 3])
  assert.ok(Math.abs(report.queryTime - 0.084) < 1e-9)
  // The queries repeated most, named by the function that ran them, without its arguments.
  assert.deepEqual(report.repeated, [{ count: 3, caller: 'get_option()' }, { count: 2, caller: 'WP_Query->get_posts()' }])
  // Query Monitor counts a repeated error once with a count; strict counts as deprecated; an
  // @-silenced error is skipped. Errors this plugin saw itself are not counted twice.
  assert.deepEqual(report.errorCounts, { error: 0, warning: 3, notice: 0, deprecated: 1 })
  assert.deepEqual(report.errors.map((error) => [error.kind, error.message, error.file, error.line]), [
    ['warning', 'Undefined array key "layout" near https://api.vendor.com/v1?…', 'wp-content/plugins/acme/render.php', 212],
    ['deprecated', 'Old style', '', 0],
  ])
  // Calls to the site itself are not calls to other sites; a call that waits for no answer
  // cannot fail.
  assert.deepEqual([report.calls, report.failedCalls], [4, 2])
  assert.deepEqual(report.http, [
    { host: 'api.wordpress.org', code: 200 }, { host: 'api.vendor.com', code: 403 }, { host: 'api.other.com', code: 0 }, { host: 'example.org', code: -1 },
  ])
  // The plugin load times are still the Playground's own.
  assert.deepEqual(report.plugins.map((plugin) => plugin.name).sort(), ['WP 2FA', 'other/other.php'])
  const page = text.split('\nHOOKS:')[0]
  assert.doesNotMatch(page, /SECRET-KEY-123/)
  assert.doesNotMatch(atob(page.match(/TECHIES_MEASURE:([A-Za-z0-9+/=]+)/)[1]), /wp_options|SELECT/, 'no SQL leaves the page')
})

test('with Query Monitor active, failed calls after the first 40 still name their site', async () => {
  const report = parseMeasurement(await measure(true, { queryMonitor: true, callsBefore: 40 }))
  assert.deepEqual([report.calls, report.failedCalls], [44, 2])
  assert.equal(report.http.length, 22, 'the first 20 calls and the later failed ones')
  assert.deepEqual(report.http.slice(20), [{ host: 'api.vendor.com', code: 403 }, { host: 'api.other.com', code: 0 }])
})

test('on a page where Query Monitor stopped collecting, the numbers are the Playground\'s own', async () => {
  const report = parseMeasurement(await measure(true, { queryMonitor: true, queryMonitorCeased: true }))
  assert.equal(report.source, 'playground')
  assert.deepEqual(report.errorCounts, { error: 0, warning: 2, notice: 0, deprecated: 1 })
  assert.deepEqual([report.queries, report.time], [3, 0.5])
})

test('the measure plugin reports counts and times, never a query or an address with a key in it', async () => {
  const text = await measure(true)
  const report = parseMeasurement(text)
  // Without Query Monitor the numbers are the Playground's own.
  assert.equal(report.source, 'playground')
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
  assert.match(calls.details, /^1 of 21 calls to other sites failed\./)
  assert.deepEqual(calls.found.entries, [{ status: 'warn', message: 'api.freemius.com', where: 'Answered HTTP 403' }])
})

test('the measure plugin does nothing on a normal page', async () => {
  const text = await measure(false)
  assert.doesNotMatch(text, new RegExp(MEASURE_MARKER))
  assert.match(text, /\nHOOKS:\n/)
  assert.match(text, /\nPREVIOUS:\["Something odd/)
})
