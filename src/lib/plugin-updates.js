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
	// An update this site cannot run would leave the plugin switched off, so skip it.
	$offer = $plugin_updates[ $file ];
	$requires_php = is_object( $offer ) && ! empty( $offer->requires_php ) ? (string) $offer->requires_php : '';
	$requires_wp = is_object( $offer ) && ! empty( $offer->requires ) ? (string) $offer->requires : '';
	if ( $requires_php && ! is_php_version_compatible( $requires_php ) ) {
		$result['failed'][] = array( 'name' => $data['Name'], 'message' => substr( 'Needs PHP ' . $requires_php . ' or newer.', 0, 200 ) );
		continue;
	}
	if ( $requires_wp && ! is_wp_version_compatible( $requires_wp ) ) {
		$result['failed'][] = array( 'name' => $data['Name'], 'message' => substr( 'Needs WordPress ' . $requires_wp . ' or newer.', 0, 200 ) );
		continue;
	}
	$was_active = is_plugin_active( $file );
	$skin = new Automatic_Upgrader_Skin();
	$outcome = techies_playground_upgrade( new Plugin_Upgrader( $skin ), $skin, $file );
	$switch_on_error = '';
	if ( $was_active && ! is_plugin_active( $file ) ) {
		$activated = activate_plugin( $file, '', false, true );
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

// What the bar's Updates control says: idle and running before the updates finish, then
// what changed. ready is true once there is something to open.
export function updatesLabel(updates) {
  const none = { note: '', count: '' }
  if (updates.state === 'running') return { label: 'Updating…', ...none, ready: false }
  if (updates.state === 'skipped') return { label: 'Updates', note: 'networking blocked', count: '', ready: true }
  if (updates.state === 'error') return { label: 'Updates', note: 'failed', count: '', ready: true }
  if (updates.state !== 'done') return { label: 'Updates', ...none, ready: false }
  const { updated, failed } = updates.result
  if (updated.length) return { label: 'Updated', note: updatedNote(updates.result), count: String(updated.length), ready: true }
  if (failed.length) return { label: 'Update failed', note: failed.map((entry) => entry.name).join(', '), count: String(failed.length), ready: true }
  return { label: 'Up to date', ...none, ready: true }
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
