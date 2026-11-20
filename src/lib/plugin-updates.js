// Updates every plugin and theme that WordPress offers an update for, right after a test
// site starts, and reports each change as old → new version. WordPress's upgrader turns an
// active plugin off before it replaces the files (outside cron), so the update code turns it
// back on afterwards. Updates need outbound networking: WordPress.org and each premium
// plugin's own update server answer the update check.
export const UPDATES_MARKER = 'PLAYGROUND_UPDATES:'

export const PLUGIN_UPDATES_CODE = `<?php
define( 'WP_ADMIN', true );
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once ABSPATH . 'wp-admin/includes/theme.php';
require_once ABSPATH . 'wp-admin/includes/update.php';
require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
require_once ABSPATH . 'wp-admin/includes/class-automatic-upgrader-skin.php';

$result = array( 'updated' => array(), 'failed' => array(), 'current' => array() );

function techies_playground_upgrade( $upgrader, $skin, $item ) {
	$outcome = $upgrader->upgrade( $item, array( 'clear_update_cache' => false ) );
	if ( is_wp_error( $outcome ) ) {
		return $outcome->get_error_message();
	}
	if ( false === $outcome || null === $outcome ) {
		$messages = $skin->get_upgrade_messages();
		return $messages ? wp_strip_all_tags( end( $messages ) ) : 'Update failed.';
	}
	return true;
}

delete_site_transient( 'update_plugins' );
wp_update_plugins();
$plugin_state = get_site_transient( 'update_plugins' );
$plugin_updates = is_object( $plugin_state ) && ! empty( $plugin_state->response ) ? (array) $plugin_state->response : array();
$updated_files = array();

foreach ( get_plugins() as $file => $data ) {
	if ( ! isset( $plugin_updates[ $file ] ) ) {
		if ( is_plugin_active( $file ) ) {
			$result['current'][] = array( 'name' => $data['Name'], 'version' => $data['Version'] );
		}
		continue;
	}
	$was_active = is_plugin_active( $file );
	$skin = new Automatic_Upgrader_Skin();
	$outcome = techies_playground_upgrade( new Plugin_Upgrader( $skin ), $skin, $file );
	if ( true === $outcome ) {
		$result['updated'][] = array( 'name' => $data['Name'], 'from' => $data['Version'], 'to' => '' );
		$updated_files[ count( $result['updated'] ) - 1 ] = $file;
	} else {
		$result['failed'][] = array( 'name' => $data['Name'], 'message' => substr( $outcome, 0, 200 ) );
	}
	if ( $was_active && ! is_plugin_active( $file ) ) {
		activate_plugin( $file, '', false, true );
	}
}

wp_clean_plugins_cache( true );
$plugins_after = get_plugins();
foreach ( $updated_files as $index => $file ) {
	$offered = $plugin_updates[ $file ];
	$offered_version = is_object( $offered ) && isset( $offered->new_version ) ? (string) $offered->new_version : '';
	$result['updated'][ $index ]['to'] = ! empty( $plugins_after[ $file ]['Version'] ) ? $plugins_after[ $file ]['Version'] : $offered_version;
}

delete_site_transient( 'update_themes' );
wp_update_themes();
$theme_state = get_site_transient( 'update_themes' );
$theme_updates = is_object( $theme_state ) && ! empty( $theme_state->response ) ? (array) $theme_state->response : array();

foreach ( wp_get_themes() as $slug => $theme ) {
	if ( ! isset( $theme_updates[ $slug ] ) ) {
		if ( get_stylesheet() === $slug ) {
			$result['current'][] = array( 'name' => $theme->get( 'Name' ), 'version' => $theme->get( 'Version' ) );
		}
		continue;
	}
	$skin = new Automatic_Upgrader_Skin();
	$outcome = techies_playground_upgrade( new Theme_Upgrader( $skin ), $skin, $slug );
	if ( true === $outcome ) {
		$result['updated'][] = array( 'name' => $theme->get( 'Name' ), 'from' => $theme->get( 'Version' ), 'to' => (string) ( $theme_updates[ $slug ]['new_version'] ?? '' ) );
	} else {
		$result['failed'][] = array( 'name' => $theme->get( 'Name' ), 'message' => substr( $outcome, 0, 200 ) );
	}
}
wp_clean_themes_cache( true );

echo '${UPDATES_MARKER}' . wp_json_encode( $result );
`

const text = (value) => (typeof value === 'string' ? value : '')

export function parsePluginUpdates(responseText) {
  const index = responseText.lastIndexOf(UPDATES_MARKER)
  if (index < 0) throw new Error('WordPress did not return an update result.')
  const raw = JSON.parse(responseText.slice(index + UPDATES_MARKER.length).trim())
  const list = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [])
  return {
    updated: list(raw.updated).map((entry) => ({ name: text(entry.name), from: text(entry.from), to: text(entry.to) })),
    failed: list(raw.failed).map((entry) => ({ name: text(entry.name), message: text(entry.message) || 'Update failed.' })),
    current: list(raw.current).map((entry) => ({ name: text(entry.name), version: text(entry.version) })),
  }
}

export async function runPluginUpdates(client) {
  const response = await client.run({ code: PLUGIN_UPDATES_CODE })
  return parsePluginUpdates(response.text)
}

// The note on the bar's Updated control: the first change and how many more.
export function updatedNote(result) {
  const [first, ...rest] = result.updated
  if (!first) return ''
  return `${first.name} ${first.from} → ${first.to}${rest.length ? ` +${rest.length}` : ''}`
}
