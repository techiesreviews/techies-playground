import { installPlugin } from '@wp-playground/blueprints'
import { CHECKS } from './checks.js'
import { pluginFolderFromAssetPath } from './license-fill.js'

const NOTICE_PATH = '/wordpress/wp-content/mu-plugins/techies-uploaded-plugins.php'
const NOTICE_PLUGIN = `<?php
/** Plugin Name: Techies Playground: uploaded plugin activation status */
add_action('after_plugin_row', function ($file) {
  if (!is_plugin_active($file) && in_array($file, get_option('techies_upload_activation_failed', array()), true)) {
    echo '<tr class="plugin-update-tr"><td colspan="4" class="plugin-update colspanchange"><div class="notice inline notice-error"><p>Installed, but activation failed. Try activating this plugin in WordPress.</p></div></td></tr>';
  }
});
`

const ACTIVATE_CODE = `<?php
ob_start();
require_once '/wordpress/wp-load.php';
require_once '/wordpress/wp-admin/includes/plugin.php';
wp_set_current_user(get_users(array('role' => 'Administrator'))[0]->ID);
$path = rtrim(getenv('PLUGIN_PATH'), '/');
foreach (get_plugins() as $file => $data) {
  $absolute = WP_PLUGIN_DIR . '/' . $file;
  if ($absolute === $path || str_starts_with($absolute, $path . '/')) {
    activate_plugin($file);
    break;
  }
}
ob_end_clean();
`

const STATUS_CODE = `<?php
ob_start();
require_once '/wordpress/wp-load.php';
require_once '/wordpress/wp-admin/includes/plugin.php';
$path = rtrim(getenv('PLUGIN_PATH'), '/');
$active = false;
$failed = get_option('techies_upload_activation_failed', array());
foreach (get_plugins() as $file => $data) {
  $absolute = WP_PLUGIN_DIR . '/' . $file;
  if ($absolute !== $path && !str_starts_with($absolute, $path . '/')) continue;
  if (is_plugin_active($file)) $active = true;
  $failed = array_values(array_diff($failed, array($file)));
  if (!is_plugin_active($file)) $failed[] = $file;
}
update_option('techies_upload_activation_failed', $failed, false);
ob_end_clean();
echo 'TECHIES_PLUGIN_STATUS:' . ($active ? 'active' : 'inactive');
`

export async function installUploadedPlugin(client, plugin, { install = installPlugin, isCurrent = () => true } = {}) {
  if (!isCurrent()) return { status: 'cancelled' }
  const check = CHECKS.find((candidate) => candidate.packageIds.includes(plugin.id))
  if (check) {
    await client.run({ code: `<?php
require_once '/wordpress/wp-load.php';
require_once '/wordpress/wp-admin/includes/plugin.php';
$editions = json_decode('${JSON.stringify(check.packageIds)}', true);
foreach (get_plugins() as $file => $data) {
  if (in_array(explode('/', $file)[0], $editions, true)) deactivate_plugins($file, true);
}
` })
    if (!isCurrent()) return { status: 'cancelled' }
  }
  const installed = await install(client, {
    pluginData: new File([plugin.file], plugin.filename, { type: 'application/zip' }),
    options: { activate: false },
    ifAlreadyInstalled: 'overwrite',
  })
  if (!isCurrent()) return { status: 'cancelled' }
  if (!installed?.assetPath) throw new Error('The uploaded plugin could not be installed.')
  await client.writeFile(NOTICE_PATH, NOTICE_PLUGIN)
  if (!isCurrent()) return { status: 'cancelled' }
  const env = { PLUGIN_PATH: installed.assetPath }
  try {
    await client.run({ code: ACTIVATE_CODE, env })
  } catch {
    // Plugins may redirect or abort activation. Read the saved state in a separate request.
  }
  if (!isCurrent()) return { status: 'cancelled' }
  let status = 'unknown'
  try {
    const response = await client.run({ code: STATUS_CODE, env })
    const value = response.text?.split('TECHIES_PLUGIN_STATUS:').at(-1)?.trim()
    if (response.text?.includes('TECHIES_PLUGIN_STATUS:') && (value === 'active' || value === 'inactive')) status = value
  } catch {
    // A broken plugin may prevent WordPress from answering the status request.
  }
  if (!isCurrent()) return { status: 'cancelled' }
  return {
    status,
    folder: pluginFolderFromAssetPath(installed.assetPath),
    message: status === 'active' ? 'Active in WordPress' : status === 'inactive'
      ? 'Installed, but activation failed. Try activating this plugin in WordPress.'
      : 'Installed, but activation could not be verified. Check this plugin in WordPress.',
  }
}
