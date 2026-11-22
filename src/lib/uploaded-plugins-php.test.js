import assert from 'node:assert/strict'
import test from 'node:test'
import { getPHPLoaderModule } from '@php-wasm/node-8-3'
import { loadPHPRuntime, PHP } from '@php-wasm/universal'
import { installUploadedPlugin } from './uploaded-plugins.js'
import { checkPluginSyncCode } from './checks.js'
import { DEFAULT_RECIPE } from './recipe.js'

const WP_LOAD = `<?php
const WP_PLUGIN_DIR = '/wordpress/wp-content/plugins';
function get_users($args) { return array((object) array('ID' => 1)); }
function wp_set_current_user($id) {}
function get_plugins() { return array('query-monitor/query-monitor.php' => array(), 'code-profiler/free.php' => array(), 'code-profiler-pro/pro.php' => array(), 'other/other.php' => array()); }
function get_option($key, $default = false) { return file_exists('/' . $key) ? json_decode(file_get_contents('/' . $key), true) : $default; }
function update_option($key, $value, $autoload = null) { file_put_contents('/' . $key, json_encode($value)); }
function deactivate_plugins($file, $silent) { update_option('active', array_values(array_diff(get_option('active', array()), array($file)))); }
function is_plugin_active($file) { return in_array($file, get_option('active', array()), true); }
function activate_plugin($file) {
  if (file_exists('/fail')) { echo 'sk_fake_secret'; return; }
  update_option('active', array_merge(get_option('active', array()), array($file)));
  if (file_exists('/redirect')) exit;
}
`

async function setup() {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.mkdir('/wordpress/wp-admin/includes')
  php.mkdir('/wordpress/wp-content/mu-plugins')
  php.writeFile('/wordpress/wp-load.php', WP_LOAD)
  php.writeFile('/wordpress/wp-admin/includes/plugin.php', '<?php')
  return php
}

for (const mode of ['normal', 'redirect', 'fail']) {
  test(`real PHP: Pro replaces active free tester, activation ${mode}`, async () => {
    const php = await setup()
    try {
      php.writeFile('/active', JSON.stringify(['code-profiler/free.php', 'other/other.php']))
      if (mode !== 'normal') php.writeFile(`/${mode}`, '')
      const result = await installUploadedPlugin(php, { id: 'code-profiler-pro', filename: 'code-profiler-pro.zip', file: new Blob(['fake']) }, {
        install: async () => ({ assetPath: '/wordpress/wp-content/plugins/code-profiler-pro' }),
      })
      assert.equal(result.status, mode === 'fail' ? 'inactive' : 'active')
      assert.deepEqual(JSON.parse(php.readFileAsText('/active')), mode === 'fail' ? ['other/other.php'] : ['other/other.php', 'code-profiler-pro/pro.php'])
      assert.deepEqual(JSON.parse(php.readFileAsText('/techies_upload_activation_failed')), mode === 'fail' ? ['code-profiler-pro/pro.php'] : [])
      assert.doesNotMatch(JSON.stringify(result), /sk_fake_secret/)
      assert.match(php.readFileAsText('/wordpress/wp-content/mu-plugins/techies-uploaded-plugins.php'), /after_plugin_row/)
    } finally { php.exit() }
  })
}

for (const selected of [[], ['code-profiler-pro']]) {
  test(`real PHP: sync preserves testers outside the setup (${selected.join(',') || 'none selected'})`, async () => {
    const php = await setup()
    try {
      const active = ['query-monitor/query-monitor.php', 'code-profiler/free.php', 'code-profiler-pro/pro.php', 'other/other.php']
      php.writeFile('/active', JSON.stringify(active))
      await php.run({ code: checkPluginSyncCode({ ...DEFAULT_RECIPE, plugins: selected }) })
      assert.deepEqual(JSON.parse(php.readFileAsText('/active')), selected.length ? active.filter((file) => file !== 'code-profiler/free.php') : active)
    } finally { php.exit() }
  })
}
