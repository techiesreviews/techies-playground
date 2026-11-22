// Checks are free WordPress plugins that measure a setup. A check counts as part of a
// setup when its plugin is in the recipe, from WordPress.org or as an uploaded ZIP (free
// or paid). The launcher's Checks panel shows a summary of one page; each check opens its
// plugin's own page for the full detail. Code Profiler profiles by sending a request to the
// site itself, which works inside browser Playground.
export const CHECKS = Object.freeze([
  Object.freeze({
    id: 'query-monitor',
    name: 'Query Monitor',
    summary: 'Database queries, PHP errors and memory.',
    slug: 'query-monitor',
    packageIds: Object.freeze(['query-monitor', 'query-monitor-pro']),
  }),
  Object.freeze({
    id: 'code-profiler',
    name: 'Code Profiler',
    summary: 'Which plugin slows the site, plugin by plugin.',
    slug: 'code-profiler',
    packageIds: Object.freeze(['code-profiler', 'code-profiler-pro']),
  }),
])

function hasCheck(recipe, check) {
  return recipe.repositoryPlugins.includes(check.slug) || check.packageIds.some((id) => recipe.plugins.includes(id))
}

export function checksInSetup(recipe) {
  return CHECKS.filter((check) => hasCheck(recipe, check))
}

export function addCheckToSetup(recipe, checkId) {
  const check = CHECKS.find((candidate) => candidate.id === checkId)
  if (!check) throw new Error(`Unknown check: ${checkId}`)
  if (hasCheck(recipe, check)) return recipe
  return { ...recipe, repositoryPlugins: [...recipe.repositoryPlugins, check.slug] }
}

export function removeCheckFromSetup(recipe, checkId) {
  const check = CHECKS.find((candidate) => candidate.id === checkId)
  if (!check) throw new Error(`Unknown check: ${checkId}`)
  return {
    ...recipe,
    plugins: recipe.plugins.filter((id) => !check.packageIds.includes(id)),
    repositoryPlugins: recipe.repositoryPlugins.filter((slug) => !check.packageIds.includes(slug)),
  }
}

export function selectUploadedPlugin(recipe, id) {
  const check = CHECKS.find((candidate) => candidate.packageIds.includes(id))
  const next = check ? removeCheckFromSetup(recipe, check.id) : recipe
  return { ...next, plugins: [...new Set([...next.plugins, id])] }
}

export function resolveCheckPlugins(recipe) {
  return CHECKS.reduce((next, check) => {
    const local = check.packageIds.toReversed().find((id) => next.plugins.includes(id))
    return local ? selectUploadedPlugin(next, local) : next
  }, recipe)
}

// A resumed site's old tester must be inactive before another edition is loaded.
export function checkPluginSyncCode(recipe) {
  const selected = [...recipe.plugins, ...recipe.repositoryPlugins]
  const disabled = CHECKS.flatMap((check) => check.packageIds).filter((id) => !selected.includes(id))
  return `<?php
require_once '/wordpress/wp-load.php';
require_once '/wordpress/wp-admin/includes/plugin.php';
$disabled = json_decode('${JSON.stringify(disabled)}', true);
foreach (get_plugins() as $file => $data) {
  if (in_array(explode('/', $file)[0], $disabled, true)) deactivate_plugins($file, true);
}
`
}

export function checkResultsPath(check, recipe, currentPath) {
  if (check.id === 'code-profiler') {
    const proOnly = recipe.plugins.includes('code-profiler-pro') && !recipe.plugins.includes('code-profiler') && !recipe.repositoryPlugins.includes('code-profiler')
    return `/wp-admin/admin.php?page=${proOnly ? 'code-profiler-pro' : 'code-profiler'}&techies-check=code-profiler`
  }
  const url = safePageUrl(currentPath)
  url.searchParams.set('techies-check', check.id)
  return `${url.pathname}${url.search}`
}

const PAGE_BASE = 'https://site.invalid'

// The frame's current page as a URL to load again, or the dashboard when it belongs to
// another site or cannot be read. A page whose address carries a nonce ran an action from it
// (update.php?action=upgrade-plugin&_wpnonce=…), so loading it again would repeat that
// action: the dashboard is used instead.
function safePageUrl(currentPath) {
  let url
  try {
    url = new URL(currentPath || '/wp-admin/', PAGE_BASE)
  } catch {
    url = new URL('/wp-admin/', PAGE_BASE)
  }
  const ranAction = [...url.searchParams.keys()].some((key) => /nonce$/i.test(key))
  return url.origin !== PAGE_BASE || ranAction ? new URL('/wp-admin/', PAGE_BASE) : url
}

// Query Monitor opens its panel only from its admin-bar link, and it reopens the last
// panel on every page (so the link is clicked only when no panel is remembered; clicking
// would close it). This must-use plugin clicks that link on a page the launcher's
// Checks panel opened for Query Monitor, and starts Query Monitor closed on the Code
// Profiler page so its panel does not cover the profiler.
export const CHECKS_PLUGIN_PATH = '/wordpress/wp-content/mu-plugins/techies-checks.php'

export const CHECKS_PLUGIN = `<?php
/**
 * Plugin Name: Techies Playground: open a check
 * Description: Opens the Query Monitor panel on a page the launcher's Checks panel opened (techies-check=query-monitor) and keeps it closed on the Code Profiler page (techies-check=code-profiler).
 */

function techies_playground_close_query_monitor() {
	if ( isset( $_GET['techies-check'] ) && 'code-profiler' === $_GET['techies-check'] ) {
		echo "<script>try { localStorage.removeItem('qm-admin-panel'); localStorage.removeItem('qm-front-panel'); } catch (error) {}</script>";
	}
}
add_action( 'admin_head', 'techies_playground_close_query_monitor' );
add_action( 'wp_head', 'techies_playground_close_query_monitor' );

function techies_playground_open_check() {
	if ( ! isset( $_GET['techies-check'] ) || 'query-monitor' !== $_GET['techies-check'] ) {
		return;
	}
	echo "<script>(function () { var tries = 0; var panelKey = document.body.classList.contains('wp-admin') ? 'qm-admin-panel' : 'qm-front-panel'; function open() { var stored = ''; try { stored = localStorage.getItem(panelKey) || ''; } catch (error) {} if (stored) { return; } var link = document.querySelector('#wp-admin-bar-query-monitor > a'); if (link) { link.click(); } else if (tries++ < 20) { setTimeout(open, 250); } } if (document.readyState === 'complete') { open(); } else { window.addEventListener('load', open); } }());</script>";
}
add_action( 'admin_print_footer_scripts', 'techies_playground_open_check' );
add_action( 'wp_print_footer_scripts', 'techies_playground_open_check' );
`

// Pass and fail limits for the Checks panel. Pages in browser Playground run on PHP built
// for WebAssembly, which is several times slower than a normal server, so the page time
// limits are wider than a hosting check would use. A fresh site with Query Monitor and
// Code Profiler built its admin pages in 0.2 to 0.3 s in a desktop browser.
export const CHECK_LIMITS = Object.freeze({
  slowQuerySeconds: 0.05,
  queriesWarn: 100,
  duplicatesWarn: 10,
  memoryWarnShare: 0.75,
  memoryFailShare: 0.9,
  pageTimeWarnSeconds: 1,
  pageTimeFailSeconds: 3,
  pluginLoadWarnSeconds: 0.5,
})

// The Checks panel measures a page by loading it once more with techies-measure=1. This
// must-use plugin then logs queries, PHP errors, calls to other sites and each plugin's load
// time, and appends the numbers to the page as one base64 JSON comment. When Query Monitor is
// active, the query, error, call, memory and time numbers are read from Query Monitor's own
// collectors instead (source 'query-monitor'). Code Profiler only profiles on its own screen,
// so the plugin load times are always this plugin's. It never returns a query's SQL or a
// call's full address (either can hold a license key): only counts, times, the host of each
// call, the name of the function that repeated a query, and error messages cut to 200
// characters.
export const MEASURE_PLUGIN_PATH = '/wordpress/wp-content/mu-plugins/techies-measure.php'
export const MEASURE_MARKER = 'TECHIES_MEASURE:'

export const MEASURE_PLUGIN = `<?php
/**
 * Plugin Name: Techies Playground: measure a page
 * Description: When the launcher's Checks panel loads a page with techies-measure=1, records its queries, PHP errors, calls to other sites and plugin load times, and appends them to the page.
 */

function techies_measure_kind( $type ) {
	if ( $type & ( E_WARNING | E_USER_WARNING | E_CORE_WARNING | E_COMPILE_WARNING ) ) {
		return 'warning';
	}
	if ( $type & ( E_NOTICE | E_USER_NOTICE ) ) {
		return 'notice';
	}
	if ( $type & ( E_DEPRECATED | E_USER_DEPRECATED ) ) {
		return 'deprecated';
	}
	return 'error';
}

function techies_measure_entry( $kind, $message, $file, $line ) {
	return array(
		'kind'    => $kind,
		// An address in a message keeps its host and path; its query can hold a license key.
		'message' => substr( preg_replace( '#(https?://[^\\s?\\'"]+)\\?[^\\s\\'")]*#', '$1?…', (string) $message ), 0, 200 ),
		'file'    => str_replace( ABSPATH, '', (string) $file ),
		'line'    => (int) $line,
	);
}

function techies_measure_record( $type, $message, $file, $line ) {
	$kind = techies_measure_kind( $type );
	$GLOBALS['techies_measure']['counts'][ $kind ]++;
	if ( count( $GLOBALS['techies_measure']['errors'] ) < 10 ) {
		$GLOBALS['techies_measure']['errors'][] = techies_measure_entry( $kind, $message, $file, $line );
	}
}

// Records what error_reporting() lets through (an @-silenced error is skipped), then hands
// the error on to the handler that was there before, so PHP and other tools still see it.
function techies_measure_error( $type, $message, $file = '', $line = 0 ) {
	if ( error_reporting() & $type ) {
		techies_measure_record( $type, $message, $file, $line );
	}
	$previous = $GLOBALS['techies_measure_previous_handler'];
	return $previous ? call_user_func( $previous, $type, $message, $file, $line ) : false;
}

function techies_measure_plugin_loaded( $file ) {
	$now = microtime( true );
	$GLOBALS['techies_measure']['plugins'][ plugin_basename( $file ) ] = $now - $GLOBALS['techies_measure']['mark'];
	$GLOBALS['techies_measure']['mark'] = $now;
}

// Counts every call. The list keeps the first 20 calls and up to 20 more failed ones, so a
// failure late in the page still names its host.
function techies_measure_http( $response, $context, $class, $args, $url ) {
	$code   = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
	$failed = 0 === $code || $code >= 400;
	$GLOBALS['techies_measure']['calls']++;
	if ( $failed ) {
		$GLOBALS['techies_measure']['failed_calls']++;
	}
	$listed = count( $GLOBALS['techies_measure']['http'] );
	if ( $listed < 20 || ( $failed && $listed < 40 ) ) {
		$GLOBALS['techies_measure']['http'][] = array(
			'host' => (string) wp_parse_url( $url, PHP_URL_HOST ),
			'code' => $code,
		);
	}
}

// The function that ran a query, without its arguments (they can hold an option's value).
function techies_measure_caller( $stack ) {
	$frame = is_array( $stack ) && $stack ? (string) reset( $stack ) : '';
	return preg_replace( '/\\(.*$/s', '()', $frame );
}

// With Query Monitor active, the page's numbers come from its own collectors, so the panel
// shows what Query Monitor shows for the same page. Fatal errors, which Query Monitor does not
// record, still come from this plugin. Returns null without Query Monitor, and on pages where
// it stopped collecting (qm/cease: the Site Editor, a Customizer preview, …), where its
// collectors stay but hold no data.
function techies_measure_query_monitor() {
	if ( ! class_exists( 'QM_Collectors' ) || did_action( 'qm/cease' ) ) {
		return null;
	}
	try {
		QM_Collectors::init()->process();
		$collected = array();
		foreach ( array( 'overview', 'db_queries', 'php_errors', 'http' ) as $id ) {
			$collector = QM_Collectors::get( $id );
			if ( ! $collector ) {
				return null;
			}
			$collected[ $id ] = $collector->get_data();
		}
	} catch ( Throwable $error ) {
		return null;
	}
	$overview = $collected['overview'];
	$db       = $collected['db_queries'];
	if ( ! isset( $overview->time_taken, $db->total_qs ) ) {
		return null;
	}

	$query_time = 0;
	$groups     = array();
	foreach ( isset( $db->rows ) ? (array) $db->rows : array() as $row ) {
		$query_time += (float) $row['ltime'];
		$key = md5( (string) $row['sql'] );
		if ( ! isset( $groups[ $key ] ) ) {
			$stack = isset( $row['trace'] ) ? $row['trace']->get_stack() : ( isset( $row['stack'] ) ? $row['stack'] : array() );
			$groups[ $key ] = array( 'count' => 0, 'caller' => techies_measure_caller( $stack ) );
		}
		$groups[ $key ]['count']++;
	}
	$duplicates = 0;
	$repeated   = array();
	foreach ( $groups as $group ) {
		if ( $group['count'] > 1 ) {
			$duplicates += $group['count'] - 1;
			$repeated[]  = $group;
		}
	}
	usort( $repeated, function ( $a, $b ) { return $b['count'] <=> $a['count']; } );

	$counts = array( 'error' => $GLOBALS['techies_measure']['counts']['error'], 'warning' => 0, 'notice' => 0, 'deprecated' => 0 );
	$errors = array_values( array_filter( $GLOBALS['techies_measure']['errors'], function ( $entry ) { return 'error' === $entry['kind']; } ) );
	// Query Monitor 4.x keeps each error once, keyed by a hash, as a QM_Data_PHP_Error object with
	// level, count, suppressed and trace (collectors/php_errors.php, process_error). Version 3
	// grouped them by type as arrays with calls, a shape 4.x no longer writes.
	foreach ( isset( $collected['php_errors']->errors ) ? (array) $collected['php_errors']->errors : array() as $error ) {
		if ( ! is_object( $error ) || ! empty( $error->suppressed ) ) {
			continue;
		}
		$kind = 'strict' === $error->level ? 'deprecated' : (string) $error->level;
		if ( ! isset( $counts[ $kind ] ) ) {
			continue;
		}
		$counts[ $kind ] += max( 1, (int) $error->count );
		if ( count( $errors ) < 10 ) {
			$callsite = isset( $error->trace ) && $error->trace ? $error->trace->get_callsite() : null;
			$errors[] = techies_measure_entry( $kind, $error->message, $callsite ? $callsite->file : '', $callsite ? $callsite->line : 0 );
		}
	}

	$calls  = 0;
	$failed = 0;
	$http   = array();
	// Query Monitor 4.x keeps each call as a QM_Data_HTTP_Request object with type ('error',
	// 'non-blocking' or 'HTTP <code>'), host and local (collectors/http.php, process()).
	foreach ( isset( $collected['http']->http ) ? (array) $collected['http']->http : array() as $request ) {
		if ( ! empty( $request->local ) ) {
			continue;
		}
		// 0 is no answer; -1 is a call that waits for no answer, so it cannot fail.
		$code = 'error' === $request->type ? 0 : ( preg_match( '/^HTTP (\\d+)/', (string) $request->type, $match ) ? (int) $match[1] : -1 );
		$calls++;
		$is_failure = 0 === $code || $code >= 400;
		if ( $is_failure ) {
			$failed++;
		}
		// As the Playground's own list: the first 20 calls and up to 20 more failed ones.
		if ( count( $http ) < 20 || ( $is_failure && count( $http ) < 40 ) ) {
			$http[] = array( 'host' => (string) $request->host, 'code' => $code );
		}
	}

	return array(
		'source'      => 'query-monitor',
		'qmVersion'   => defined( 'QM_VERSION' ) ? QM_VERSION : '',
		'time'        => (float) $overview->time_taken,
		'memory'      => (int) $overview->memory,
		'memoryLimit' => (int) $overview->memory_limit,
		'queries'     => (int) $db->total_qs,
		'queryTime'   => $query_time,
		'slowQueries' => isset( $db->expensive ) ? count( (array) $db->expensive ) : 0,
		'duplicates'  => $duplicates,
		'repeated'    => array_slice( $repeated, 0, 3 ),
		'errorCounts' => $counts,
		'errors'      => $errors,
		'calls'       => $calls,
		'failedCalls' => $failed,
		'http'        => $http,
	);
}

function techies_measure_report() {
	global $wpdb;
	$fatal = error_get_last();
	if ( $fatal && ( $fatal['type'] & ( E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR | E_RECOVERABLE_ERROR ) ) ) {
		techies_measure_record( $fatal['type'], $fatal['message'], $fatal['file'], $fatal['line'] );
	}
	$slow = 0;
	$query_time = 0;
	$seen = array();
	foreach ( (array) $wpdb->queries as $query ) {
		$seconds = isset( $query[1] ) ? (float) $query[1] : 0;
		$query_time += $seconds;
		if ( $seconds > ${CHECK_LIMITS.slowQuerySeconds} ) {
			$slow++;
		}
		$key = md5( isset( $query[0] ) ? (string) $query[0] : '' );
		$seen[ $key ] = isset( $seen[ $key ] ) ? $seen[ $key ] + 1 : 1;
	}
	$duplicates = 0;
	foreach ( $seen as $count ) {
		$duplicates += $count > 1 ? $count - 1 : 0;
	}
	if ( ! function_exists( 'get_plugins' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}
	$installed = get_plugins();
	$plugins = array();
	foreach ( $GLOBALS['techies_measure']['plugins'] as $file => $seconds ) {
		$plugins[] = array( 'name' => isset( $installed[ $file ]['Name'] ) ? $installed[ $file ]['Name'] : $file, 'time' => $seconds );
	}
	usort( $plugins, function ( $a, $b ) { return $b['time'] <=> $a['time']; } );
	$title = is_admin() ? ( isset( $GLOBALS['title'] ) ? $GLOBALS['title'] : '' ) : wp_get_document_title();
	$report = array(
		'source'      => 'playground',
		'title'       => html_entity_decode( wp_strip_all_tags( (string) $title ), ENT_QUOTES, 'UTF-8' ),
		'time'        => timer_float(),
		'memory'      => memory_get_peak_usage(),
		'memoryLimit' => wp_convert_hr_to_bytes( ini_get( 'memory_limit' ) ),
		'queries'     => (int) $wpdb->num_queries,
		'queryTime'   => $query_time,
		'slowQueries' => $slow,
		'duplicates'  => $duplicates,
		'errorCounts' => $GLOBALS['techies_measure']['counts'],
		'errors'      => $GLOBALS['techies_measure']['errors'],
		'calls'       => $GLOBALS['techies_measure']['calls'],
		'failedCalls' => $GLOBALS['techies_measure']['failed_calls'],
		'http'        => $GLOBALS['techies_measure']['http'],
		'plugins'     => array_slice( $plugins, 0, 5 ),
	);
	$query_monitor = techies_measure_query_monitor();
	if ( $query_monitor ) {
		$report = array_merge( $report, $query_monitor );
	}
	echo "\\n<!-- ${MEASURE_MARKER}" . base64_encode( wp_json_encode( $report ) ) . ' -->';
}

if ( isset( $_GET['techies-measure'] ) ) {
	if ( ! defined( 'SAVEQUERIES' ) ) {
		define( 'SAVEQUERIES', true );
	}
	error_reporting( E_ALL );
	ini_set( 'display_errors', '0' );
	$GLOBALS['techies_measure'] = array(
		'errors'  => array(),
		'counts'  => array( 'error' => 0, 'warning' => 0, 'notice' => 0, 'deprecated' => 0 ),
		'plugins' => array(),
		'http'         => array(),
		'calls'        => 0,
		'failed_calls' => 0,
		'mark'         => microtime( true ),
	);
	$GLOBALS['techies_measure_previous_handler'] = set_error_handler( 'techies_measure_error' );
	add_action( 'muplugins_loaded', function () {
		$GLOBALS['techies_measure']['mark'] = microtime( true );
	}, PHP_INT_MAX );
	add_action( 'plugin_loaded', 'techies_measure_plugin_loaded' );
	add_action( 'http_api_debug', 'techies_measure_http', 10, 5 );
	add_action( 'shutdown', 'techies_measure_report', PHP_INT_MAX );
}
`

// The page to measure: the frame's current page (see safePageUrl) with techies-measure=1
// (and without the techies-check request that opens a tool there).
export function measurePath(currentPath) {
  const url = safePageUrl(currentPath)
  url.searchParams.delete('techies-check')
  url.searchParams.set('techies-measure', '1')
  return `${url.pathname}${url.search}`
}

const number = (value) => (Number.isFinite(value) ? value : 0)

export function parseMeasurement(responseText) {
  const match = new RegExp(`${MEASURE_MARKER}([A-Za-z0-9+/=]+)`).exec(responseText)
  if (!match) throw new Error('This page did not return its numbers. It may have sent the browser somewhere else.')
  const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0))))
  const counts = raw.errorCounts || {}
  const list = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [])
  return {
    source: raw.source === 'query-monitor' ? 'query-monitor' : 'playground',
    qmVersion: typeof raw.qmVersion === 'string' ? raw.qmVersion : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    time: number(raw.time),
    memory: number(raw.memory),
    memoryLimit: number(raw.memoryLimit),
    queries: number(raw.queries),
    queryTime: number(raw.queryTime),
    slowQueries: number(raw.slowQueries),
    duplicates: number(raw.duplicates),
    repeated: list(raw.repeated).map((entry) => ({ count: number(entry.count), caller: String(entry.caller || '') })),
    errorCounts: { error: number(counts.error), warning: number(counts.warning), notice: number(counts.notice), deprecated: number(counts.deprecated) },
    errors: list(raw.errors).map((entry) => ({ kind: String(entry.kind || 'error'), message: String(entry.message || ''), file: String(entry.file || ''), line: number(entry.line) })),
    calls: number(raw.calls),
    failedCalls: number(raw.failedCalls),
    http: list(raw.http).map((entry) => ({ host: String(entry.host || ''), code: number(entry.code) })),
    plugins: list(raw.plugins).map((entry) => ({ name: String(entry.name || ''), time: number(entry.time) })),
  }
}

export async function measurePage(client, currentPath) {
  const response = await client.request({ url: measurePath(currentPath), method: 'GET' })
  return parseMeasurement(response.text)
}

// Checks start by themselves only once every license the setup needs (each launched plugin
// with a saved key, and each premium Freemius plugin without one; every uploaded plugin when
// the licence probe failed) is active, either filled in now or already active in the site.
export function checksGate(neededIds, licenseFill, activeIds = []) {
  const active = neededIds.filter((id) => {
    if (activeIds.includes(id)) return true
    const result = licenseFill.find((entry) => entry.id === id)
    return result?.status === 'active' || result?.status === 'activated'
  }).length
  return { ready: active === neededIds.length, active, total: neededIds.length }
}

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

// The words for each status. Good, Medium and Bad appear only in the "i" table of limits.
export const STATUS_LABEL = Object.freeze({ pass: 'Passed', warn: 'Warning', fail: 'Improve' })

// The article that explains the scores, linked from the bottom of the "i".
export const CHECKS_ARTICLE_URL = 'https://techies.review/articles/techies-playground-check-score/'

const percent = (share) => `${Math.round(share * 100)}%`

// Good (Passed), medium (Warning) and bad (Improve) for each check, in the order the "i" lists
// them, written from CHECK_LIMITS so the table and the checks never disagree. An empty bad
// means the check only ever warns.
export const LIMIT_ROWS = Object.freeze([
  { id: 'page-time', tool: 'query-monitor', name: 'Page time', good: `up to ${CHECK_LIMITS.pageTimeWarnSeconds} s`, medium: `over ${CHECK_LIMITS.pageTimeWarnSeconds} s`, bad: `over ${CHECK_LIMITS.pageTimeFailSeconds} s` },
  { id: 'memory', tool: 'query-monitor', name: 'Memory', note: 'share of the site’s limit', good: `up to ${percent(CHECK_LIMITS.memoryWarnShare)}`, medium: `over ${percent(CHECK_LIMITS.memoryWarnShare)}`, bad: `over ${percent(CHECK_LIMITS.memoryFailShare)}` },
  { id: 'queries', tool: 'query-monitor', name: 'Database queries', good: `up to ${CHECK_LIMITS.queriesWarn}`, medium: `over ${CHECK_LIMITS.queriesWarn}`, bad: '' },
  { id: 'duplicate-queries', tool: 'query-monitor', name: 'Duplicate queries', good: `up to ${CHECK_LIMITS.duplicatesWarn}`, medium: `over ${CHECK_LIMITS.duplicatesWarn}`, bad: '' },
  { id: 'slow-queries', tool: 'query-monitor', name: 'Slow queries', note: `longer than ${CHECK_LIMITS.slowQuerySeconds} s`, good: 'none', medium: '1 or more', bad: '' },
  { id: 'php-errors', tool: 'query-monitor', name: 'PHP errors', good: 'none', medium: 'notices, deprecations', bad: 'errors, warnings' },
  { id: 'outside-calls', tool: 'query-monitor', name: 'Calls to other sites', good: 'none failed', medium: 'any failed', bad: '' },
  { id: 'slowest-plugin', tool: 'code-profiler', name: 'Slowest plugin', good: `up to ${CHECK_LIMITS.pluginLoadWarnSeconds} s`, medium: `over ${CHECK_LIMITS.pluginLoadWarnSeconds} s`, bad: '' },
].map((row) => Object.freeze(row)))

const STATUS_ORDER = { fail: 0, warn: 1, pass: 2 }

// What needs fixing first: Improve, then Warning, then Passed, each in its usual order.
export function checksByStatus(checks) {
  return [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
}

// The panel's headline and the bar's short form: what to improve first, then warnings.
export function checksVerdict(report) {
  if (report.failed) return { status: 'fail', headline: `${plural(report.failed, 'check')} to improve`, short: `${report.failed} to improve` }
  if (report.warnings) return { status: 'warn', headline: plural(report.warnings, 'warning'), short: plural(report.warnings, 'warning') }
  const total = report.checks.length
  return { status: 'pass', headline: total === 1 ? 'The check passed' : `All ${total} checks passed`, short: `${total} passed` }
}

// What a screen reader hears from the bar when the checks start and finish. The frame already
// announces a page that opens, so a run that starts by itself (auto) says nothing, and its
// result is heard only when it is news (see checksQuiet).
export function checksAnnouncement(run) {
  if (run.state === 'running') return run.auto ? '' : 'Running checks.'
  if (run.state === 'done') return run.quiet ? '' : `Checks${run.title ? ` on ${run.title}` : ''}: ${checksVerdict(run.report).headline}.`
  if (run.state === 'error') return `The checks could not run. ${run.message}`
  return ''
}

// A result that started by itself is news when the panel is open or the verdict changed.
export function checksQuiet({ auto, panelOpen, previous, report }) {
  return Boolean(auto && !panelOpen && previous && checksVerdict(previous).headline === checksVerdict(report).headline)
}

// Which page each site checks now and which waits. The checks run on every page that opens:
// a page opened during a run waits, and only the latest one, so the panel ends on the page
// that is open. A page is checked again by itself only after another page; Run again forces it.
// A new site (a relaunch) starts at once, and the old site finishing changes nothing.
export function createCheckQueue() {
  let site = null
  let running = null
  let waiting = null
  let last = null
  return {
    request(client, path, { force = false } = {}) {
      if (client !== site) {
        site = client
        running = path
        waiting = null
        last = null
        return 'start'
      }
      if (running !== null) {
        if (path === running) {
          waiting = null
          return 'skip'
        }
        if (path === waiting) return 'skip'
        waiting = path
        return 'queued'
      }
      if (path === last && !force) return 'skip'
      running = path
      return 'start'
    },
    // True while a newer page waits, so the result of this run is out of date.
    waiting(client) {
      return client === site && waiting !== null
    },
    // Ends this site's run and gives the page to check next, if one waits.
    finish(client) {
      if (client !== site) return null
      last = running
      running = null
      const next = waiting
      waiting = null
      return next
    },
  }
}

// Open in reloads the frame with techies-check (checkResultsPath). That is the tool's screen,
// not a page to check: Code Profiler's would otherwise replace the page that was checked.
export function isCheckToolPage(path) {
  try {
    return new URL(path || '/', PAGE_BASE).searchParams.has('techies-check')
  } catch {
    return false
  }
}

// Measures every page that opens in WordPress. A short wait lets redirects settle, so one visit
// is one run. The client has no way to unsubscribe, so isCurrent drops a replaced site's pages;
// canRun holds runs back until the licenses allow the checks.
export function watchCheckPages(client, { isCurrent, canRun, run, settle = 400 }) {
  let timer
  client.onNavigation((path) => {
    if (isCheckToolPage(path)) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (isCurrent() && canRun()) run(path)
    }, settle)
  })
}

// The page the checks measure, as the panel shows it: see safePageUrl.
export function checkedPagePath(currentPath) {
  const url = safePageUrl(currentPath)
  url.searchParams.delete('techies-check')
  url.searchParams.delete('techies-measure')
  return `${url.pathname}${url.search}`
}

export const formatSeconds = (seconds) => `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`
const formatMegabytes = (bytes) => `${Math.round(bytes / 1048576)} MB`
const ERROR_KINDS = [['error', 'error'], ['warning', 'warning'], ['notice', 'notice'], ['deprecated', 'deprecation notice']]
const ERROR_WORDS = Object.fromEntries(ERROR_KINDS)

// A "found" list only when there is something in it.
const foundList = (title, total, entries) => (entries.length ? { type: 'list', title, total, entries } : undefined)

// Turns one page's numbers into the panel's checks: Query Monitor's when it is in the setup,
// Code Profiler's when it is. Each check passes, warns or fails against CHECK_LIMITS, says
// where its number came from and lists what it found.
export function evaluateChecks(measurement, checkIds) {
  const limits = CHECK_LIMITS
  const m = measurement
  const checks = []
  const errorTotal = Object.values(m.errorCounts).reduce((sum, count) => sum + count, 0)
  const errorStatus = m.errorCounts.error + m.errorCounts.warning ? 'fail' : errorTotal ? 'warn' : 'pass'
  const errorParts = ERROR_KINDS.filter(([kind]) => m.errorCounts[kind]).map(([kind, word]) => plural(m.errorCounts[kind], word))
  const memoryShare = m.memoryLimit > 0 ? m.memory / m.memoryLimit : 0
  const memoryStatus = memoryShare > limits.memoryFailShare ? 'fail' : memoryShare > limits.memoryWarnShare ? 'warn' : 'pass'
  const timeStatus = m.time > limits.pageTimeFailSeconds ? 'fail' : m.time > limits.pageTimeWarnSeconds ? 'warn' : 'pass'

  if (checkIds.includes('query-monitor')) {
    const source = m.source === 'query-monitor'
      ? `From Query Monitor${m.qmVersion ? ` ${m.qmVersion}` : ''} on this page.`
      : 'Measured by the Playground: Query Monitor did not report on this page.'
    const listedFailures = m.http.filter((call) => call.code === 0 || call.code >= 400)
    // The counts cover every call; the list is capped at what the page sent back.
    const callCount = Math.max(m.calls || 0, m.http.length)
    const failedCount = Math.max(m.failedCalls || 0, listedFailures.length)
    const repeated = m.repeated || []
    checks.push(
      {
        id: 'php-errors', tool: 'query-monitor', name: 'PHP errors', status: errorStatus, source,
        value: String(errorTotal),
        details: errorTotal ? `${errorParts.join(', ')} on this page.` : 'No errors, warnings or notices on this page.',
        found: foundList('Found on this page', errorTotal, m.errors.map((entry) => ({
          status: entry.kind === 'error' || entry.kind === 'warning' ? 'fail' : 'warn',
          kind: `PHP ${ERROR_WORDS[entry.kind] || 'error'}`,
          message: entry.message,
          where: entry.file ? `${entry.file}, line ${entry.line}` : '',
        }))),
      },
      {
        id: 'slow-queries', tool: 'query-monitor', name: 'Slow queries', status: m.slowQueries ? 'warn' : 'pass', value: String(m.slowQueries), source,
        details: m.slowQueries ? `${plural(m.slowQueries, 'database query', 'database queries')} took longer than ${limits.slowQuerySeconds} s.` : `No database query took longer than ${limits.slowQuerySeconds} s.`,
      },
      {
        id: 'outside-calls', tool: 'query-monitor', name: 'Calls to other sites', status: failedCount ? 'warn' : 'pass', value: `${failedCount} failed`, source,
        details: !callCount
          ? 'This page made no call to another site.'
          : failedCount
            ? `${failedCount} of ${plural(callCount, 'call')} to other sites failed. Blocked networking makes every call fail.`
            : `${plural(callCount, 'call')} to other sites, all answered.`,
        found: foundList('Failed calls', failedCount, listedFailures.map((call) => ({
          status: 'warn', message: call.host, where: call.code > 0 ? `Answered HTTP ${call.code}` : 'No answer',
        }))),
      },
      {
        id: 'duplicate-queries', tool: 'query-monitor', name: 'Duplicate queries', status: m.duplicates > limits.duplicatesWarn ? 'warn' : 'pass', value: String(m.duplicates), source,
        details: m.duplicates ? `${plural(m.duplicates, 'database query', 'database queries')} repeated an earlier one.` : 'No database query ran more than once.',
        found: foundList('Repeated most', undefined, repeated.map((entry) => ({
          status: 'warn', count: `${entry.count}×`, message: entry.caller || 'Unknown function', where: 'Function that ran it',
        }))),
      },
      {
        id: 'queries', tool: 'query-monitor', name: 'Database queries', status: m.queries > limits.queriesWarn ? 'warn' : 'pass', value: String(m.queries), source,
        details: `${plural(m.queries, 'query', 'queries')}, ${m.queryTime.toFixed(3)} s together.`,
      },
      {
        id: 'memory', tool: 'query-monitor', name: 'Memory', status: memoryStatus, value: formatMegabytes(m.memory), source,
        details: m.memoryLimit > 0 ? `${Math.round(memoryShare * 100)}% of the site’s ${formatMegabytes(m.memoryLimit)} limit.` : 'This site sets no memory limit.',
      },
      {
        id: 'page-time', tool: 'query-monitor', name: 'Page time', status: timeStatus, value: formatSeconds(m.time), source,
        details: 'Time WordPress took to build this page in the browser.',
      },
    )
  }

  if (checkIds.includes('code-profiler')) {
    const [slowest] = m.plugins
    const pluginStatus = (plugin) => (plugin.time > limits.pluginLoadWarnSeconds ? 'warn' : 'pass')
    checks.push({
      id: 'slowest-plugin', tool: 'code-profiler', name: 'Slowest plugin',
      status: slowest ? pluginStatus(slowest) : 'pass',
      value: slowest ? formatSeconds(slowest.time) : '–',
      source: 'Timed by the Playground as each plugin loaded. Code Profiler shows the full profile.',
      details: slowest ? `${slowest.name} took the longest to load.` : 'No plugin loaded on this page.',
      found: slowest
        ? { type: 'table', title: 'Load time per plugin', rows: m.plugins.map((plugin) => ({ name: plugin.name, value: formatSeconds(plugin.time), status: pluginStatus(plugin) })) }
        : undefined,
    })
  }

  const count = (status) => checks.filter((check) => check.status === status).length
  return { checks, passed: count('pass'), warnings: count('warn'), failed: count('fail') }
}
