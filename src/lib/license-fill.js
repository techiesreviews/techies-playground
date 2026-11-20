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

// Plain text for the launcher: the message of an error object, tags and entities removed,
// the key replaced, at most 200 characters (Freemius can answer with a whole web page).
function techies_playground_fill_message( $error, $key ) {
	if ( is_object( $error ) ) {
		$error = (array) $error;
	}
	if ( is_array( $error ) ) {
		$error = isset( $error['message'] ) && is_string( $error['message'] ) ? $error['message'] : wp_json_encode( $error );
	}
	$text = html_entity_decode( wp_strip_all_tags( (string) $error ), ENT_QUOTES );
	$text = trim( preg_replace( '/\\s+/', ' ', wp_strip_all_tags( $text ) ) );
	$text = str_replace( $key, '[key]', $text );
	return function_exists( 'mb_substr' ) ? mb_substr( $text, 0, 200 ) : substr( $text, 0, 200 );
}

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
		$results[ $folder ] = array(
			'status' => empty( $answer['success'] ) ? 'rejected' : 'activated',
			'message' => isset( $answer['error'] ) ? techies_playground_fill_message( $answer['error'], $key ) : '',
		);
	} catch ( Throwable $error ) {
		$results[ $folder ] = array( 'status' => 'failed', 'message' => techies_playground_fill_message( $error->getMessage(), $key ) );
	}
}

echo "\\n${LICENSE_FILL_MARKER}" . wp_json_encode( $results );
`

// Premium builds of Freemius plugins that cannot use their premium code yet: a licence the
// setup needs, even when no key was saved for it. Free builds ship the Freemius SDK too, and
// is_premium() is false there, so they never count.
export const UNLICENSED_PREMIUM_MARKER = 'TECHIES_UNLICENSED_PREMIUM:'

export const UNLICENSED_PREMIUM_CODE = `<?php
define( 'WP_ADMIN', true );
require '/wordpress/wp-load.php';
wp_set_current_user( 1 );

$folders = array();
foreach ( class_exists( 'Freemius' ) ? Freemius::_get_all_instances() : array() as $fs ) {
	if ( ! $fs->is_plugin() || ! method_exists( $fs, 'is_premium' ) || ! method_exists( $fs, 'can_use_premium_code' ) ) {
		continue;
	}
	if ( $fs->is_premium() && ! $fs->can_use_premium_code() ) {
		$folders[] = dirname( $fs->get_plugin_basename() );
	}
}

echo "\\n${UNLICENSED_PREMIUM_MARKER}" . wp_json_encode( $folders );
`

export function parseUnlicensedPremium(text) {
  const index = typeof text === 'string' ? text.lastIndexOf(UNLICENSED_PREMIUM_MARKER) : -1
  if (index < 0) throw new Error('WordPress did not report the premium plugins.')
  const parsed = JSON.parse(text.slice(index + UNLICENSED_PREMIUM_MARKER.length).split(/\r?\n/, 1)[0])
  return (Array.isArray(parsed) ? parsed : []).filter((folder) => typeof folder === 'string' && FOLDER.test(folder) && !/^\.+$/.test(folder))
}

// A failed probe never fails the launch; the checks then wait only for the saved keys.
export async function findUnlicensedPremium({ client, signal }) {
  try {
    const response = await untilAborted(client.run({ code: UNLICENSED_PREMIUM_CODE }), signal)
    return parseUnlicensedPremium(response.text)
  } catch (caught) {
    if (caught?.name === 'AbortError') throw caught
    return []
  }
}

// The launched plugins whose licences the checks wait for: each one with a saved key, then
// each premium plugin that cannot use its premium code, by its folder.
export function licensesNeeded(savedKeyIds, premiumFolders, folders) {
  const premium = new Set(premiumFolders)
  const premiumIds = [...folders].filter(([id, folder]) => premium.has(folder) && !savedKeyIds.includes(id)).map(([id]) => id)
  return [...savedKeyIds, ...premiumIds]
}

export function licenseFillLabel({ status, message }) {
  if (status === 'active') return { tone: 'ok', text: 'Already active in this site' }
  if (status === 'activated') return { tone: 'ok', text: 'Filled in and active' }
  if (status === 'rejected') return { tone: 'warn', text: message ? `Filled in. Freemius said: ${message}` : 'Filled in. Freemius refused the key.' }
  if (status === 'not-freemius') return { tone: 'muted', text: 'Not filled in: enter it in WordPress' }
  return { tone: 'warn', text: `Not filled in: ${message || 'WordPress did not answer.'}` }
}

// A PHP run that never answers must not keep a closed launch waiting.
function untilAborted(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('The launch was closed.', 'AbortError'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

// Decrypts the saved keys of the launched plugins and lets each plugin's own Freemius SDK
// activate its key inside the running site. Keys travel only in the PHP request body. A
// failure is reported per package and never fails the launch; closing it aborts.
export async function fillSavedLicenseKeys({ client, packages, folders, signal, getVaultKey, readKeys }) {
  let keys = new Map()
  const failAll = (message) => packages.map((entry) => ({ ...entry, recordId: keys.get(entry.vaultId)?.recordId || '', status: 'failed', message }))
  const vaultKey = getVaultKey()
  if (!vaultKey) return failAll('The license vault is locked.')
  try {
    keys = await readKeys(vaultKey, packages.map((entry) => entry.vaultId), signal)
    // Lock forgets the key; a lock while the keys were read must stop them here.
    if (getVaultKey() !== vaultKey) return failAll('The license vault was locked.')
    const entries = packages.flatMap((entry) => (
      folders.get(entry.id) && keys.get(entry.vaultId) ? [{ folder: folders.get(entry.id), licenseKey: keys.get(entry.vaultId).licenseKey }] : []
    ))
    if (!entries.length) return failAll('The plugin folder could not be found.')
    const response = await untilAborted(client.run({ code: LICENSE_FILL_CODE, method: 'POST', body: licenseFillBody(entries) }), signal)
    signal.throwIfAborted()
    const results = parseLicenseFillResult(response.text)
    return packages.map((entry) => ({
      ...entry,
      recordId: keys.get(entry.vaultId)?.recordId || '',
      ...(results[folders.get(entry.id)] || { status: 'failed', message: 'WordPress did not report this plugin.' }),
    }))
  } catch (caught) {
    if (caught?.name === 'AbortError') throw caught
    return failAll(caught instanceof Error ? caught.message.slice(0, 200) : 'The saved keys could not be filled in.')
  }
}

// The license record that shows a launch's fill result: the record whose key was used, or,
// when the fill failed before any key was read, the plugin's newest record (records arrive
// newest first).
export function fillResultRecordId(result, pluginId, records) {
  if (!result) return ''
  if (result.recordId) return result.recordId
  return records.find((record) => record.pluginId === pluginId)?.id || ''
}
