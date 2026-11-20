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
);
$GLOBALS['active'] = array( 'wp-2fa/wp-2fa.php', 'example-pro/example.php', 'query-monitor/query-monitor.php' );
$GLOBALS['offers'] = array(
	'wp-2fa/wp-2fa.php' => (object) array( 'new_version' => '3.2', 'package' => 'install' ),
	'example-pro/example.php' => (object) array( 'new_version' => '2.1', 'package' => 'refuse' ),
	'silent/silent.php' => (object) array( 'new_version' => '1.1', 'package' => 'silent' ),
	'sleepy/sleepy.php' => (object) array( 'new_version' => '1.0', 'package' => 'install' ),
);
class WP_Error { public function __construct( public $code, public $message ) {} public function get_error_message() { return $this->message; } }
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function wp_strip_all_tags( $text ) { return trim( strip_tags( $text ) ); }
function wp_json_encode( $value ) { return json_encode( $value ); }
function delete_site_transient( $name ) { $GLOBALS['deleted'][] = $name; }
function wp_update_plugins() {}
function wp_update_themes() {}
function get_site_transient( $name ) {
	if ( 'update_plugins' === $name ) { return (object) array( 'response' => $GLOBALS['offers'] ); }
	return (object) array( 'response' => array( 'old-theme' => array( 'new_version' => '2.0', 'package' => 'install' ) ) );
}
function get_plugins() { return $GLOBALS['plugins']; }
function is_plugin_active( $file ) { return in_array( $file, $GLOBALS['active'], true ); }
function activate_plugin( $file, $redirect, $network, $silent ) { $GLOBALS['active'][] = $file; $GLOBALS['reactivated'][] = array( $file, $silent ); }
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
		$package = $GLOBALS['offers'][ $file ]->package;
		if ( 'refuse' === $package ) { return new WP_Error( 'no_package', 'Update package not available.' ); }
		if ( 'silent' === $package ) { $this->skin->messages[] = '<p>Could not copy files.</p>'; return false; }
		$GLOBALS['plugins'][ $file ]['Version'] = $GLOBALS['offers'][ $file ]->new_version;
		return true;
	}
}
class Theme_Upgrader { public function __construct( public $skin ) {} public function upgrade( $slug, $args ) { return true; } }
register_shutdown_function( function () { echo "\\nSTATE:" . json_encode( array( 'active' => $GLOBALS['active'], 'reactivated' => $GLOBALS['reactivated'] ?? array(), 'deleted' => $GLOBALS['deleted'] ?? array() ) ); } );
`

async function run() {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.mkdir('/wordpress/wp-admin/includes')
  for (const file of ['file', 'plugin', 'theme', 'update', 'class-wp-upgrader', 'class-automatic-upgrader-skin']) php.writeFile(`/wordpress/wp-admin/includes/${file}.php`, '<?php')
  php.writeFile('/wordpress/wp-load.php', WP_LOAD)
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
  assert.deepEqual(result.failed, [
    { name: 'Example Pro', message: 'Update package not available.' },
    { name: 'Silent', message: 'Could not copy files.' },
  ])
  // Already current lists only what the site uses: active plugins and the active theme.
  assert.deepEqual(result.current, [{ name: 'Query Monitor', version: '4.1.1' }, { name: 'Current Theme', version: '1.3' }])
  // A plugin that was on stays on, even when its update failed; one that was off stays off.
  assert.deepEqual(state.reactivated, [['wp-2fa/wp-2fa.php', true], ['example-pro/example.php', true]])
  assert.deepEqual([...state.active].sort(), ['example-pro/example.php', 'query-monitor/query-monitor.php', 'wp-2fa/wp-2fa.php'])
  // A fresh update check, not a cached one.
  assert.deepEqual(state.deleted, ['update_plugins', 'update_themes'])
})
