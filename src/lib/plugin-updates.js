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

// When WordPress.org does not answer its update check, WordPress keeps no update list, and a
// missing offer would read as up to date. So the check counts only once it got an answer
// (WordPress tries https, then http), and otherwise it is named as failed.
$update_checks = array(
	'plugins' => array( 'answered' => false, 'error' => 'no request was made' ),
	'themes' => array( 'answered' => false, 'error' => 'no request was made' ),
);
add_action( 'http_api_debug', function ( $response, $context, $class, $args, $url ) use ( &$update_checks ) {
	if ( ! preg_match( '#^https?://api\\.wordpress\\.org/(plugins|themes)/update-check/#', (string) $url, $match ) ) {
		return;
	}
	$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
	if ( 200 === $code ) {
		$update_checks[ $match[1] ]['answered'] = true;
	} else {
		$update_checks[ $match[1] ]['error'] = is_wp_error( $response ) ? wp_strip_all_tags( $response->get_error_message() ) : 'HTTP ' . $code;
	}
}, 10, 5 );

// An update this site's PHP or WordPress cannot run would break the plugin or theme, so it is
// skipped with this reason. A plugin offer is an object, a theme offer an array.
function techies_playground_incompatible( $offer ) {
	$offer = (array) $offer;
	$requires_php = ! empty( $offer['requires_php'] ) ? (string) $offer['requires_php'] : '';
	$requires_wp = ! empty( $offer['requires'] ) ? (string) $offer['requires'] : '';
	if ( $requires_php && ! is_php_version_compatible( $requires_php ) ) {
		return substr( 'Needs PHP ' . $requires_php . ' or newer.', 0, 200 );
	}
	if ( $requires_wp && ! is_wp_version_compatible( $requires_wp ) ) {
		return substr( 'Needs WordPress ' . $requires_wp . ' or newer.', 0, 200 );
	}
	return '';
}

function techies_playground_check_failed( $check, $name, $others ) {
	return array( 'name' => $name, 'message' => substr( 'WordPress.org did not answer (' . $check['error'] . '), so ' . $others . ' may have updates.', 0, 200 ) );
}

delete_site_transient( 'update_plugins' );
wp_update_plugins();
$plugin_state = get_site_transient( 'update_plugins' );
$plugin_updates = is_object( $plugin_state ) && ! empty( $plugin_state->response ) ? (array) $plugin_state->response : array();
$plugins_checked = $update_checks['plugins']['answered'];
if ( ! $plugins_checked ) {
	$result['failed'][] = techies_playground_check_failed( $update_checks['plugins'], 'Plugin update check', 'other plugins' );
}
$updated_files = array();

foreach ( get_plugins() as $file => $data ) {
	if ( ! isset( $plugin_updates[ $file ] ) ) {
		if ( $plugins_checked && is_plugin_active( $file ) ) {
			$result['current'][] = array( 'name' => $data['Name'], 'version' => $data['Version'] );
		}
		continue;
	}
	// An update this site cannot run would leave the plugin switched off, so skip it.
	$incompatible = techies_playground_incompatible( $plugin_updates[ $file ] );
	if ( $incompatible ) {
		$result['failed'][] = array( 'name' => $data['Name'], 'message' => $incompatible );
		continue;
	}
	// On Multisite a plugin on for the whole network goes back on for the whole network.
	$was_active = is_plugin_active( $file );
	$was_network_active = is_plugin_active_for_network( $file );
	$skin = new Automatic_Upgrader_Skin();
	$outcome = techies_playground_upgrade( new Plugin_Upgrader( $skin ), $skin, $file );
	$switch_on_error = '';
	if ( $was_active && ! is_plugin_active( $file ) ) {
		$activated = activate_plugin( $file, '', $was_network_active, true );
		if ( is_wp_error( $activated ) ) {
			$switch_on_error = wp_strip_all_tags( $activated->get_error_message() );
		}
	}
	if ( true === $outcome && '' === $switch_on_error ) {
		$result['updated'][] = array( 'name' => $data['Name'], 'from' => $data['Version'], 'to' => '' );
		$updated_files[ count( $result['updated'] ) - 1 ] = $file;
	} elseif ( true === $outcome ) {
		$result['failed'][] = array( 'name' => $data['Name'], 'message' => substr( 'Updated, but WordPress could not switch it back on: ' . $switch_on_error, 0, 200 ) );
	} else {
		$result['failed'][] = array( 'name' => $data['Name'], 'message' => substr( $outcome, 0, 200 ) );
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
$themes_checked = $update_checks['themes']['answered'];
if ( ! $themes_checked ) {
	$result['failed'][] = techies_playground_check_failed( $update_checks['themes'], 'Theme update check', 'themes' );
}

foreach ( wp_get_themes() as $slug => $theme ) {
	if ( ! isset( $theme_updates[ $slug ] ) ) {
		if ( $themes_checked && get_stylesheet() === $slug ) {
			$result['current'][] = array( 'name' => $theme->get( 'Name' ), 'version' => $theme->get( 'Version' ) );
		}
		continue;
	}
	$incompatible = techies_playground_incompatible( $theme_updates[ $slug ] );
	if ( $incompatible ) {
		$result['failed'][] = array( 'name' => $theme->get( 'Name' ), 'message' => $incompatible );
		continue;
	}
	$theme_offer = (array) $theme_updates[ $slug ];
	$skin = new Automatic_Upgrader_Skin();
	$outcome = techies_playground_upgrade( new Theme_Upgrader( $skin ), $skin, $slug );
	if ( true === $outcome ) {
		$result['updated'][] = array( 'name' => $theme->get( 'Name' ), 'from' => $theme->get( 'Version' ), 'to' => (string) ( $theme_offer['new_version'] ?? '' ) );
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

// How many more entries follow the first one on the bar, so a long list never widens it.
const more = (list) => (list.length > 1 ? ` +${list.length - 1}` : '')

// What the bar's Updates control says: idle and running before the updates finish, then
// what changed. The note is the first change (or failure) and how many more: note is the
// name, which the bar may shorten, and noteEnd the versions and count, which it always
// shows. failed counts failures next to updates; when nothing updated, the label itself
// says so. ready is true once there is something to open.
export function updatesLabel(updates) {
  const none = { note: '', noteEnd: '', count: '', failed: '' }
  if (updates.state === 'running') return { label: 'Updating…', ...none, ready: false }
  if (updates.state === 'skipped') return { label: 'Updates', ...none, note: 'networking blocked', ready: true }
  if (updates.state === 'error') return { label: 'Updates', ...none, note: 'failed', ready: true }
  if (updates.state !== 'done') return { label: 'Updates', ...none, ready: false }
  const { updated, failed } = updates.result
  if (updated.length) {
    const [first] = updated
    return { label: 'Updated', note: first.name, noteEnd: ` ${first.from} → ${first.to}${more(updated)}`, count: String(updated.length), failed: failed.length ? String(failed.length) : '', ready: true }
  }
  if (failed.length) return { label: 'Update failed', ...none, note: failed[0].name, noteEnd: more(failed), count: String(failed.length), ready: true }
  return { label: 'Up to date', ...none, ready: true }
}

// The heading of the Updates note. When the step ran but every update failed, nothing was
// updated, so it says so instead of "Updated at start".
export function updatesNoteHeading(updates) {
  if (updates.state !== 'done') return 'Updates at start'
  const { updated, failed } = updates.result
  return !updated.length && failed.length ? 'Updates failed at start' : 'Updated at start'
}

// What a screen reader hears from the bar while the updates run and when they finish.
export function updatesAnnouncement(updates) {
  if (updates.state === 'running') return 'Updating plugins and themes.'
  if (updates.state === 'skipped') return 'Plugins were not updated: this setup blocks networking.'
  if (updates.state === 'error') return `Plugins were not updated. ${updates.message}`
  if (updates.state !== 'done') return ''
  const { updated, failed } = updates.result
  if (!updated.length && !failed.length) return 'Every plugin and theme was up to date.'
  return [
    updated.length ? `Updated at start: ${updated.map((entry) => `${entry.name} ${entry.from} to ${entry.to}`).join(', ')}.` : '',
    failed.length ? `Not updated: ${failed.map((entry) => entry.name).join(', ')}.` : '',
  ].filter(Boolean).join(' ')
}
