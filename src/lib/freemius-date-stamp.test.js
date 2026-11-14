import test from 'node:test'
import assert from 'node:assert/strict'
import { getPHPLoaderModule } from '@php-wasm/node-8-3'
import { loadPHPRuntime, PHP } from '@php-wasm/universal'
import { FREEMIUS_DATE_STAMP_PLUGIN, FREEMIUS_DATE_STAMP_PLUGIN_PATH } from './freemius-date-stamp.js'

// Runs the must-use plugin in real PHP 8.3 with the few WordPress functions it calls
// stubbed: add_filter, wp_parse_url, and wp_remote_request, which applies
// pre_http_request the way WordPress does and records the requests that would be sent.
const HARNESS = `<?php
$GLOBALS['filters'] = array();
$GLOBALS['sent'] = array();
function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
	$GLOBALS['filters'][ $hook ][] = $callback;
	return true;
}
function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}
function wp_remote_request( $url, $args = array() ) {
	$response = $GLOBALS['preempt'];
	foreach ( $GLOBALS['filters']['pre_http_request'] ?? array() as $callback ) {
		$response = $callback( $response, $args, $url );
	}
	if ( false !== $response ) {
		return $response;
	}
	$GLOBALS['sent'][] = array( 'url' => $url, 'args' => $args );
	return array( 'response' => array( 'code' => 200 ) );
}
$input = json_decode( base64_decode( getenv( 'CASE' ) ), true );
$GLOBALS['preempt'] = $input['preempt'];
require '/plugin.php';
$result = wp_remote_request( $input['url'], $input['args'] );
$GLOBALS['preempt'] = false;
echo json_encode( array( 'result' => $result, 'sent' => $GLOBALS['sent'] ) );
`

let phpPromise
async function php() {
  phpPromise ??= (async () => {
    const instance = new PHP(await loadPHPRuntime(await getPHPLoaderModule()))
    instance.writeFile('/plugin.php', FREEMIUS_DATE_STAMP_PLUGIN)
    instance.writeFile('/harness.php', HARNESS)
    return instance
  })()
  return phpPromise
}

async function send(url, args, { preempt = false } = {}) {
  const runtime = await php()
  const response = await runtime.run({
    scriptPath: '/harness.php',
    env: { CASE: Buffer.from(JSON.stringify({ url, args, preempt })).toString('base64') },
  })
  assert.equal(response.errors, '', response.errors)
  return JSON.parse(response.text)
}

const DATE = 'Sat, 14 Nov 2026 12:00:00 +0000'
const STAMP = 'auth_date=Sat%2C%2014%20Nov%202026%2012%3A00%3A00%20%2B0000'
const signed = (extra = {}) => ({
  method: 'PUT',
  body: '{"license_key":"fake"}',
  headers: { Date: DATE, Authorization: 'FS 1:pk_fake:c2lnbmF0dXJl', 'Content-Type': 'application/json' },
  ...extra,
})

test('the plugin is a must-use plugin file', () => {
  assert.equal(FREEMIUS_DATE_STAMP_PLUGIN_PATH, '/wordpress/wp-content/mu-plugins/techies-freemius-date-stamp.php')
  assert.match(FREEMIUS_DATE_STAMP_PLUGIN, /^<\?php\n/)
})

test('copies the Date header into auth_date for api.freemius.com, changing nothing else', async () => {
  const args = signed()
  const { sent } = await send('https://api.freemius.com/v1/plugins/123/installs/456.json?fields=id,is_active', args)
  assert.deepEqual(sent, [{ url: `https://api.freemius.com/v1/plugins/123/installs/456.json?fields=id,is_active&${STAMP}`, args }])
})

test('stamps sandbox-api.freemius.com, the http fallback, any letter case and a lowercase header name', async () => {
  for (const [url, expected] of [
    ['https://sandbox-api.freemius.com/v1/ping.json', `https://sandbox-api.freemius.com/v1/ping.json?${STAMP}`],
    ['http://api.freemius.com/v1/ping.json', `http://api.freemius.com/v1/ping.json?${STAMP}`],
    ['https://API.Freemius.com/v1/ping.json?', `https://API.Freemius.com/v1/ping.json?${STAMP}`],
    ['https://api.freemius.com/v1/ping.json#top', `https://api.freemius.com/v1/ping.json?${STAMP}#top`],
  ]) {
    const { sent } = await send(url, signed({ method: 'GET', body: null }))
    assert.equal(sent.length, 1, url)
    assert.equal(sent[0].url, expected, url)
  }
  const { sent } = await send('https://api.freemius.com/v1/ping.json', { headers: { date: DATE } })
  assert.equal(sent[0].url, `https://api.freemius.com/v1/ping.json?${STAMP}`)
})

test('leaves requests to every other host untouched', async () => {
  for (const url of [
    'https://freemius.com/v1/ping.json',
    'https://wp.freemius.com/v1/ping.json',
    'https://api.freemius.com.evil.test/v1/ping.json',
    'https://evil-api.freemius.com/v1/ping.json',
    'https://evil.test/api.freemius.com/v1/ping.json',
    'https://evil.test/?u=https://api.freemius.com/',
    'https://api.wordpress.org/plugins/info/1.2/',
    'https://woocommerce.com/wp-json/helper/1.0/activate',
  ]) {
    const args = signed()
    const { sent } = await send(url, args)
    assert.deepEqual(sent, [{ url, args }], url)
  }
})

test('leaves Freemius requests without a Date header, or already stamped, untouched', async () => {
  for (const [url, args] of [
    ['https://api.freemius.com/v1/ping.json', { method: 'GET', headers: { Authorization: 'FS 1:pk_fake:sig' } }],
    ['https://api.freemius.com/v1/ping.json', { method: 'GET', headers: { Date: '' } }],
    ['https://api.freemius.com/v1/ping.json', { method: 'GET' }],
    [`https://api.freemius.com/v1/ping.json?${STAMP}`, signed()],
    ['https://api.freemius.com/v1/ping.json?auth_date=other', signed()],
  ]) {
    const { sent } = await send(url, args)
    assert.deepEqual(sent, [{ url, args }], url)
  }
})

test('passes an answer another filter already gave straight through', async () => {
  const preempt = { response: { code: 418 } }
  const { result, sent } = await send('https://api.freemius.com/v1/ping.json', signed(), { preempt })
  assert.deepEqual(result, preempt)
  assert.deepEqual(sent, [])
})
