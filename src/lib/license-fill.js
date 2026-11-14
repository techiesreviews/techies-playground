// Saved license keys go into Freemius-based plugins by themselves after a launch. The
// launcher decrypts each key in this browser and hands it to the running Playground as the
// body of one PHP request; the code below never contains a key. Inside WordPress the
// plugin's own Freemius SDK activates it, so the key only leaves the browser towards
// Freemius (through the Playground host's CORS proxy when the browser blocks the call).
export const LICENSE_FILL_MARKER = 'TECHIES_LICENSE_FILL:'

const STATUSES = new Set(['active', 'activated', 'rejected', 'not-freemius', 'failed'])
const FOLDER = /^[A-Za-z0-9._-]+$/

export function pluginFolderFromAssetPath(assetPath) {
  if (typeof assetPath !== 'string') return ''
  const match = assetPath.replace(/\/+$/, '').match(/^\/wordpress\/wp-content\/plugins\/([^/]+)$/)
  if (!match || match[1].endsWith('.php') || !FOLDER.test(match[1]) || /^\.+$/.test(match[1])) return ''
  return match[1]
}

export function licenseFillBody(entries) {
  const body = {}
  for (const { folder, licenseKey } of entries) {
    if (typeof folder !== 'string' || !FOLDER.test(folder) || /^\.+$/.test(folder)) throw new Error('Each license needs a plugin folder name.')
    if (typeof licenseKey !== 'string' || !licenseKey.trim()) throw new Error('Each plugin needs a license key.')
    body[folder] = licenseKey.trim()
  }
  return JSON.stringify(body)
}

export function parseLicenseFillResult(text) {
  const index = typeof text === 'string' ? text.lastIndexOf(LICENSE_FILL_MARKER) : -1
  if (index < 0) throw new Error('WordPress did not report the license results.')
  const parsed = JSON.parse(text.slice(index + LICENSE_FILL_MARKER.length).split(/\r?\n/, 1)[0])
  const results = {}
  for (const [folder, value] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
    const status = typeof value?.status === 'string' ? value.status : ''
    results[folder] = STATUSES.has(status)
      ? { status, message: typeof value.message === 'string' ? value.message : '' }
      : { status: 'failed', message: 'WordPress returned an unknown license status.' }
  }
  return results
}

export function packagesWithSavedKeys(records) {
  return new Set(records.map((record) => record.pluginId))
}

export function licenseFillSummary(results) {
  if (!results.length) return ''
  const active = results.filter((result) => result.status === 'active' || result.status === 'activated').length
  return `${active} of ${results.length} active`
}

export const LICENSE_FILL_CODE = `<?php
define( 'WP_ADMIN', true );
require '/wordpress/wp-load.php';
wp_set_current_user( 1 );

$requested = json_decode( (string) file_get_contents( 'php://input' ), true );
$results = array();
$instances = class_exists( 'Freemius' ) ? Freemius::_get_all_instances() : array();

foreach ( is_array( $requested ) ? $requested : array() as $folder => $key ) {
	$folder = (string) $folder;
	$key = (string) $key;
	$fs = null;
	foreach ( $instances as $instance ) {
		if ( $instance->is_plugin() && 0 === strpos( $instance->get_plugin_basename(), $folder . '/' ) ) {
			$fs = $instance;
			break;
		}
	}
	if ( null === $fs ) {
		$results[ $folder ] = array( 'status' => 'not-freemius' );
		continue;
	}
	if ( $fs->is_registered() && $fs->has_active_valid_license() ) {
		$results[ $folder ] = array( 'status' => 'active' );
		continue;
	}
	try {
		$answer = $fs->activate_migrated_license( $key );
		$message = isset( $answer['error'] ) ? wp_strip_all_tags( is_string( $answer['error'] ) ? $answer['error'] : wp_json_encode( $answer['error'] ) ) : '';
		$results[ $folder ] = array(
			'status' => empty( $answer['success'] ) ? 'rejected' : 'activated',
			'message' => str_replace( $key, '[key]', $message ),
		);
	} catch ( Throwable $error ) {
		$results[ $folder ] = array( 'status' => 'failed', 'message' => str_replace( $key, '[key]', $error->getMessage() ) );
	}
}

echo "\\n${LICENSE_FILL_MARKER}" . wp_json_encode( $results );
`

export function licenseFillLabel({ status, message }) {
  if (status === 'active') return { tone: 'ok', text: 'Already active in this site' }
  if (status === 'activated') return { tone: 'ok', text: 'Filled in and active' }
  if (status === 'rejected') return { tone: 'warn', text: message ? `Filled in. Freemius said: ${message}` : 'Filled in. Freemius refused the key.' }
  if (status === 'not-freemius') return { tone: 'muted', text: 'Not filled in: enter it in WordPress' }
  return { tone: 'warn', text: `Not filled in: ${message || 'WordPress did not answer.'}` }
}
