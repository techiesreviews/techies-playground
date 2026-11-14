import test from 'node:test'
import assert from 'node:assert/strict'
import { getPHPLoaderModule } from '@php-wasm/node-8-3'
import { loadPHPRuntime, PHP } from '@php-wasm/universal'
import { CHECKS_PLUGIN } from './checks.js'

// Runs the checks must-use plugin in real PHP 8.3 with add_action stubbed, then fires the
// head and footer hooks for one request's techies-check value.
const HARNESS = `<?php
$GLOBALS['actions'] = array();
function add_action( $hook, $callback ) { $GLOBALS['actions'][ $hook ][] = $callback; }
$check = getenv( 'CHECK' );
if ( '' !== $check ) { $_GET['techies-check'] = $check; }
require '/plugin.php';
foreach ( array( 'admin_head', 'admin_print_footer_scripts' ) as $hook ) {
	echo "[$hook]";
	foreach ( $GLOBALS['actions'][ $hook ] ?? array() as $callback ) { $callback(); }
}
`

async function render(check) {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.writeFile('/plugin.php', CHECKS_PLUGIN)
  php.writeFile('/harness.php', HARNESS)
  const response = await php.run({ scriptPath: '/harness.php', env: { CHECK: check } })
  assert.equal(response.errors, '', response.errors)
  const [, head, footer] = response.text.split(/\[admin_head\]|\[admin_print_footer_scripts\]/)
  return { head, footer }
}

test('prints only the script its check asks for', async () => {
  const queryMonitor = await render('query-monitor')
  assert.equal(queryMonitor.head, '')
  assert.match(queryMonitor.footer, /#wp-admin-bar-query-monitor > a/)
  const codeProfiler = await render('code-profiler')
  assert.match(codeProfiler.head, /localStorage\.removeItem\('qm-admin-panel'\)/)
  assert.equal(codeProfiler.footer, '')
  for (const other of ['', 'unknown']) assert.deepEqual(await render(other), { head: '', footer: '' })
})
