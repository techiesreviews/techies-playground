import test from 'node:test'
import assert from 'node:assert/strict'
import { getPHPLoaderModule } from '@php-wasm/node-8-3'
import { loadPHPRuntime, PHP } from '@php-wasm/universal'
import { PLUGIN_UPDATES_CODE, parsePluginUpdates } from './plugin-updates.js'

// Runs the update code in real PHP 8.3 against a stub wp-load.php. The stub upgrader acts
// like WordPress's: it turns an active plugin off before replacing it, then installs the
// offered version, refuses, or fails without an error object.
const WP_LOAD = `<?php
define( 'ABSPATH', '/wordpress/' );
$GLOBALS['plugins'] = array(
	'wp-2fa/wp-2fa.php' => array( 'Name' => 'WP 2FA', 'Version' => '3.1' ),
	'example-pro/example.php' => array( 'Name' => 'Example Pro', 'Version' => '2.0' ),
	'silent/silent.php' => array( 'Name' => 'Silent', 'Version' => '1.0' ),
	'query-monitor/query-monitor.php' => array( 'Name' => 'Query Monitor', 'Version' => '4.1.1' ),
	'akismet/akismet.php' => array( 'Name' => 'Akismet', 'Version' => '5.5' ),
	'sleepy/sleepy.php' => array( 'Name' => 'Sleepy', 'Version' => '0.9' ),
	'needs-php/needs-php.php' => array( 'Name' => 'Needs PHP', 'Version' => '1.0' ),
	'needs-wp/needs-wp.php' => array( 'Name' => 'Needs WP', 'Version' => '1.0' ),
	'broken/broken.php' => array( 'Name' => 'Broken', 'Version' => '1.0' ),
);
$GLOBALS['active'] = array( 'wp-2fa/wp-2fa.php', 'example-pro/example.php', 'query-monitor/query-monitor.php', 'needs-php/needs-php.php', 'needs-wp/needs-wp.php', 'broken/broken.php' );
$GLOBALS['offers'] = array(
	'wp-2fa/wp-2fa.php' => (object) array( 'new_version' => '3.2', 'package' => 'install' ),
	'example-pro/example.php' => (object) array( 'new_version' => '2.1', 'package' => 'refuse' ),
	'silent/silent.php' => (object) array( 'new_version' => '1.1', 'package' => 'silent' ),
	'sleepy/sleepy.php' => (object) array( 'new_version' => '1.0', 'package' => 'install' ),
	'needs-php/needs-php.php' => (object) array( 'new_version' => '2.0', 'package' => 'install', 'requires_php' => '99.0' ),
	'needs-wp/needs-wp.php' => (object) array( 'new_version' => '2.0', 'package' => 'install', 'requires' => '99.0' ),
	'broken/broken.php' => (object) array( 'new_version' => '2.0', 'package' => 'install' ),
);
function is_php_version_compatible( $required ) { return empty( $required ) || version_compare( '8.3', $required, '>=' ); }
function is_wp_version_compatible( $required ) { return empty( $required ) || version_compare( '6.8', $required, '>=' ); }
class WP_Error { public function __construct( public $code, public $message ) {} public function get_error_message() { return $this->message; } }
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function wp_strip_all_tags( $text ) { return trim( strip_tags( $text ) ); }
function wp_json_encode( $value ) { return json_encode( $value ); }
function delete_site_transient( $name ) { $GLOBALS['deleted'][] = $name; }
// The update checks call WordPress.org, once or again after a failed try; each answer goes
// to the http_api_debug listeners, as WP_Http does after every request.
$GLOBALS['theme_offers'] = array( 'old-theme' => array( 'new_version' => '2.0', 'package' => 'install' ) );
$GLOBALS['answers'] = array( 'plugins' => array( array( 'response' => array( 'code' => 200 ) ) ), 'themes' => array( array( 'response' => array( 'code' => 200 ) ) ) );
function add_action( $hook, $callback, $priority = 10, $args = 1 ) { $GLOBALS['actions'][ $hook ][] = $callback; }
function wp_remote_retrieve_response_code( $response ) { return is_array( $response ) ? $response['response']['code'] : ''; }
function techies_stub_update_check( $kind ) {
	foreach ( $GLOBALS['answers'][ $kind ] as $answer ) {
		foreach ( $GLOBALS['actions']['http_api_debug'] ?? array() as $callback ) {
			$callback( $answer, 'response', 'Requests', array(), 'https://api.wordpress.org/' . $kind . '/update-check/1.1/' );
		}
	}
}
function wp_update_plugins() { techies_stub_update_check( 'plugins' ); }
function wp_update_themes() { techies_stub_update_check( 'themes' ); }
function get_site_transient( $name ) {
	if ( 'update_plugins' === $name ) { return (object) array( 'response' => $GLOBALS['offers'] ); }
	return (object) array( 'response' => $GLOBALS['theme_offers'] );
}
function get_plugins() { return $GLOBALS['plugins']; }
// On Multisite a plugin can be on for the whole network; is_plugin_active() counts that too.
$GLOBALS['network_active'] = array();
function is_plugin_active_for_network( $file ) { return in_array( $file, $GLOBALS['network_active'], true ); }
function is_plugin_active( $file ) { return in_array( $file, $GLOBALS['active'], true ) || is_plugin_active_for_network( $file ); }
function activate_plugin( $file, $redirect, $network, $silent ) {
	$GLOBALS['reactivated'][] = array( $file, $silent );
	if ( 'broken/broken.php' === $file ) { return new WP_Error( 'incompatible', 'This plugin does not work with your version of PHP.' ); }
	if ( $network ) { $GLOBALS['network_active'][] = $file; } else { $GLOBALS['active'][] = $file; }
	return null;
}
function wp_clean_plugins_cache( $clear ) {}
function wp_clean_themes_cache( $clear ) {}
function get_stylesheet() { return 'current-theme'; }
class Theme { public function __construct( public $data ) {} public function get( $key ) { return $this->data[ $key ]; } }
function wp_get_themes() {
	return array(
		'current-theme' => new Theme( array( 'Name' => 'Current Theme', 'Version' => '1.3' ) ),
		'spare-theme' => new Theme( array( 'Name' => 'Spare Theme', 'Version' => '1.0' ) ),
		'old-theme' => new Theme( array( 'Name' => 'Old Theme', 'Version' => '1.0' ) ),
	);
}
class Automatic_Upgrader_Skin { public $messages = array(); public function get_upgrade_messages() { return $this->messages; } }
class Plugin_Upgrader {
	public function __construct( public $skin ) {}
	public function upgrade( $file, $args ) {
		$GLOBALS['active'] = array_values( array_diff( $GLOBALS['active'], array( $file ) ) );
		$GLOBALS['network_active'] = array_values( array_diff( $GLOBALS['network_active'], array( $file ) ) );
		$package = $GLOBALS['offers'][ $file ]->package;
		if ( 'refuse' === $package ) { return new WP_Error( 'no_package', 'Update package not available.' ); }
		if ( 'silent' === $package ) { $this->skin->messages[] = '<p>Could not copy files.</p>'; return false; }
		$GLOBALS['plugins'][ $file ]['Version'] = $GLOBALS['offers'][ $file ]->new_version;
		return true;
	}
}
class Theme_Upgrader { public function __construct( public $skin ) {} public function upgrade( $slug, $args ) { $GLOBALS['themes_upgraded'][] = $slug; return true; } }
register_shutdown_function( function () { echo "\\nSTATE:" . json_encode( array( 'active' => $GLOBALS['active'], 'network_active' => $GLOBALS['network_active'], 'reactivated' => $GLOBALS['reactivated'] ?? array(), 'deleted' => $GLOBALS['deleted'] ?? array(), 'themes_upgraded' => $GLOBALS['themes_upgraded'] ?? array() ) ); } );
`

async function run(setup = '') {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.mkdir('/wordpress/wp-admin/includes')
  for (const file of ['file', 'plugin', 'theme', 'update', 'class-wp-upgrader', 'class-automatic-upgrader-skin']) php.writeFile(`/wordpress/wp-admin/includes/${file}.php`, '<?php')
  php.writeFile('/wordpress/wp-load.php', WP_LOAD + setup)
  const response = await php.run({ code: PLUGIN_UPDATES_CODE })
  assert.equal(response.errors, '', response.errors)
  const [before, state] = response.text.split('\nSTATE:')
  return { result: parsePluginUpdates(before), state: JSON.parse(state) }
}

test('updates each offered plugin, reports old and new version, and turns active plugins back on', async () => {
  const { result, state } = await run()
  assert.deepEqual(result.updated, [
    { name: 'WP 2FA', from: '3.1', to: '3.2' },
    { name: 'Sleepy', from: '0.9', to: '1.0' },
    { name: 'Old Theme', from: '1.0', to: '2.0' },
  ])
  // An update this site's PHP or WordPress cannot run is skipped, and a plugin WordPress
  // will not switch back on after its update is named as a failure too.
  assert.deepEqual(result.failed, [
    { name: 'Example Pro', message: 'Update package not available.' },
    { name: 'Silent', message: 'Could not copy files.' },
    { name: 'Needs PHP', message: 'Needs PHP 99.0 or newer.' },
    { name: 'Needs WP', message: 'Needs WordPress 99.0 or newer.' },
    { name: 'Broken', message: 'Updated, but WordPress could not switch it back on: This plugin does not work with your version of PHP.' },
  ])
  // Already current lists only what the site uses: active plugins and the active theme.
  assert.deepEqual(result.current, [{ name: 'Query Monitor', version: '4.1.1' }, { name: 'Current Theme', version: '1.3' }])
  // A plugin that was on stays on, even when its update failed; one that was off stays off.
  assert.deepEqual(state.reactivated, [['wp-2fa/wp-2fa.php', true], ['example-pro/example.php', true], ['broken/broken.php', true]])
  assert.deepEqual([...state.active].sort(), ['example-pro/example.php', 'needs-php/needs-php.php', 'needs-wp/needs-wp.php', 'query-monitor/query-monitor.php', 'wp-2fa/wp-2fa.php'])
  // A fresh update check, not a cached one.
  assert.deepEqual(state.deleted, ['update_plugins', 'update_themes'])
})

test('an update check WordPress.org did not answer is named as failed, and nothing is called current', async () => {
  // WordPress keeps no update list when its check fails, so only an offer from a plugin's own
  // update server (here WP 2FA) is left. The theme check gets an error page.
  const { result } = await run(`
$GLOBALS['answers'] = array( 'plugins' => array( new WP_Error( 'http_request_failed', 'cURL error 28: Operation timed out' ) ), 'themes' => array( array( 'response' => array( 'code' => 503 ) ) ) );
$GLOBALS['offers'] = array( 'wp-2fa/wp-2fa.php' => $GLOBALS['offers']['wp-2fa/wp-2fa.php'] );
$GLOBALS['theme_offers'] = array();
`)
  assert.deepEqual(result.updated, [{ name: 'WP 2FA', from: '3.1', to: '3.2' }])
  assert.deepEqual(result.failed, [
    { name: 'Plugin update check', message: 'WordPress.org did not answer (cURL error 28: Operation timed out), so other plugins may have updates.' },
    { name: 'Theme update check', message: 'WordPress.org did not answer (HTTP 503), so themes may have updates.' },
  ])
  assert.deepEqual(result.current, [])
})

test('a check that fails over https and then answers over http still counts as answered', async () => {
  const { result } = await run(`
$GLOBALS['answers']['plugins'] = array( new WP_Error( 'http_request_failed', 'SSL connect error' ), array( 'response' => array( 'code' => 200 ) ) );
`)
  assert.ok(!result.failed.some((entry) => entry.name === 'Plugin update check'), JSON.stringify(result.failed))
  assert.deepEqual(result.current, [{ name: 'Query Monitor', version: '4.1.1' }, { name: 'Current Theme', version: '1.3' }])
})

test('a theme update this site cannot run is skipped and named, like a plugin update', async () => {
  // WordPress's update list gives a theme offer as an array with requires and requires_php.
  const { result, state } = await run(`
$GLOBALS['theme_offers'] = array(
	'old-theme' => array( 'new_version' => '2.0', 'package' => 'install', 'requires_php' => '99.0' ),
	'spare-theme' => array( 'new_version' => '2.0', 'package' => 'install', 'requires' => '99.0' ),
);
`)
  assert.ok(!result.updated.some((entry) => entry.name.endsWith('Theme')), JSON.stringify(result.updated))
  assert.deepEqual(result.failed.filter((entry) => entry.name.endsWith('Theme')), [
    { name: 'Spare Theme', message: 'Needs WordPress 99.0 or newer.' },
    { name: 'Old Theme', message: 'Needs PHP 99.0 or newer.' },
  ])
  assert.deepEqual(state.themes_upgraded, [])
})

test('a plugin on for the whole network of a Multisite test site is on for the whole network again after its update', async () => {
  const { result, state } = await run(`
$GLOBALS['active'] = array_values( array_diff( $GLOBALS['active'], array( 'wp-2fa/wp-2fa.php' ) ) );
$GLOBALS['network_active'] = array( 'wp-2fa/wp-2fa.php' );
`)
  assert.ok(result.updated.some((entry) => entry.name === 'WP 2FA'), JSON.stringify(result))
  assert.deepEqual(state.network_active, ['wp-2fa/wp-2fa.php'])
  assert.ok(!state.active.includes('wp-2fa/wp-2fa.php'), 'not switched on for one site only')
})
