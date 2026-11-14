import test from 'node:test'
import assert from 'node:assert/strict'
import { getPHPLoaderModule } from '@php-wasm/node-8-3'
import { loadPHPRuntime, PHP } from '@php-wasm/universal'
import { LICENSE_FILL_CODE, licenseFillBody, parseLicenseFillResult } from './license-fill.js'

// Runs the fill code in real PHP 8.3 against a stub wp-load.php: the WordPress helpers it
// calls and a Freemius class whose instances record the keys they were given.
const WP_LOAD = `<?php
function wp_set_current_user( $id ) { $GLOBALS['user'] = $id; }
function wp_strip_all_tags( $text ) { return trim( strip_tags( $text ) ); }
function wp_json_encode( $value ) { return json_encode( $value ); }
class Freemius {
	public static $instances = array();
	public $calls = array();
	public function __construct( public $basename, public $registered, public $valid, public $answer ) {}
	public static function _get_all_instances() { return self::$instances; }
	public function is_plugin() { return true; }
	public function get_plugin_basename() { return $this->basename; }
	public function is_registered() { return $this->registered; }
	public function has_active_valid_license() { return $this->valid; }
	public function activate_migrated_license( $key ) {
		$GLOBALS['activated'][ $this->basename ] = $key;
		if ( 'throw' === $this->answer ) { throw new Exception( 'Boom with ' . $key ); }
		return $this->answer;
	}
}
Freemius::$instances = array(
	new Freemius( 'menu-image/menu-image.php', false, false, array( 'success' => false, 'error' => '<b>Invalid license key</b> sk_fake_one.' ) ),
	new Freemius( 'wsal-premium/wp-security-audit-log.php', false, false, array( 'success' => true, 'next_page' => '/x' ) ),
	new Freemius( 'already/already.php', true, true, array( 'success' => true ) ),
	new Freemius( 'thrower/thrower.php', false, false, 'throw' ),
	new Freemius( 'menu-image-extra/menu-image-extra.php', false, false, array( 'success' => true ) ),
	new Freemius( 'blocked/blocked.php', false, false, array( 'success' => false, 'error' => (object) array( 'type' => 'ApiBlocked', 'message' => 'Your server is blocking <b>Freemius</b>. ' . str_repeat( 'Show error details &lt;html&gt; ', 40 ) ) ) ),
);
register_shutdown_function( function () { echo "\\nACTIVATED:" . json_encode( $GLOBALS['activated'] ?? array() ); } );
`

async function run(entries) {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
  php.mkdir('/wordpress')
  php.writeFile('/wordpress/wp-load.php', WP_LOAD)
  const response = await php.run({ code: LICENSE_FILL_CODE, method: 'POST', body: licenseFillBody(entries) })
  assert.equal(response.errors, '', response.errors)
  const activatedAt = response.text.lastIndexOf('ACTIVATED:')
  return {
    results: parseLicenseFillResult(response.text.slice(0, activatedAt)),
    activated: JSON.parse(response.text.slice(activatedAt + 'ACTIVATED:'.length)),
  }
}

test('hands each key to the matching Freemius plugin only and reports the answer', async () => {
  const { results, activated } = await run([
    { folder: 'menu-image', licenseKey: 'sk_fake_one' },
    { folder: 'wsal-premium', licenseKey: 'sk_fake_two' },
    { folder: 'already', licenseKey: 'sk_fake_three' },
    { folder: 'thrower', licenseKey: 'sk_fake_four' },
    { folder: 'query-monitor', licenseKey: 'sk_fake_five' },
    { folder: 'blocked', licenseKey: 'sk_fake_six' },
  ])
  const blocked = results.blocked
  delete results.blocked
  assert.equal(blocked.status, 'rejected')
  assert.match(blocked.message, /^Your server is blocking Freemius\. Show error details/)
  assert.ok(blocked.message.length <= 200, blocked.message.length)
  assert.doesNotMatch(blocked.message, /[<>]|&lt;/)
  assert.deepEqual(results, {
    'menu-image': { status: 'rejected', message: 'Invalid license key [key].' },
    'wsal-premium': { status: 'activated', message: '' },
    already: { status: 'active', message: '' },
    thrower: { status: 'failed', message: 'Boom with [key]' },
    'query-monitor': { status: 'not-freemius', message: '' },
  })
  assert.deepEqual(activated, {
    'menu-image/menu-image.php': 'sk_fake_one',
    'wsal-premium/wp-security-audit-log.php': 'sk_fake_two',
    'thrower/thrower.php': 'sk_fake_four',
    'blocked/blocked.php': 'sk_fake_six',
  })
})
