// A must-use plugin, written into every launched site, that lets Freemius-based plugins
// (WP Activity Log and others) reach the Freemius API from Playground. It touches only
// requests to api.freemius.com and sandbox-api.freemius.com, and does two things:
//
// - Freemius signs every API call with the request's Date header, but browsers refuse to
//   send a Date header from fetch(), so the call arrives without it and Freemius answers
//   401 "You must provide valid formatted date stamp". Freemius also reads the same value
//   from an auth_date query parameter, so the plugin copies the header there.
// - The Freemius SDK accepts an answer only when it can read the X-API-Server header, and
//   Freemius does not expose that header to browsers; its CORS rules also refuse the
//   Content-MD5 header the SDK sends with a PUT body. So the call has to go through the
//   Playground host's CORS proxy, with the Authorization header that carries its
//   signature. The plugin opts Authorization in with X-Cors-Proxy-Allowed-Request-Headers;
//   because Freemius does not allow that header, the browser's direct attempt fails and
//   Playground retries through the proxy, which forwards Authorization only on that opt-in.
//
// Other licence systems that sign requests differently (WooCommerce.com-style updaters)
// are not covered.
export const FREEMIUS_PLUGIN_PATH = '/wordpress/wp-content/mu-plugins/techies-freemius.php'

export const FREEMIUS_PLUGIN = `<?php
/**
 * Plugin Name: Techies Playground: Freemius API
 * Description: Lets Freemius-based plugins activate licences in Playground: for api.freemius.com and sandbox-api.freemius.com only, copies the Date header into the auth_date query parameter and sends the request through the Playground CORS proxy with its Authorization header.
 */

function techies_playground_freemius_api_request( $response, $args, $url ) {
	if ( false !== $response ) {
		return $response;
	}
	$host = rtrim( strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) ), '.' );
	if ( 'api.freemius.com' !== $host && 'sandbox-api.freemius.com' !== $host ) {
		return $response;
	}
	if ( isset( $args['headers'] ) && ! is_array( $args['headers'] ) ) {
		return $response;
	}
	$headers = isset( $args['headers'] ) ? $args['headers'] : array();
	$date = '';
	$opt_in_name = 'X-Cors-Proxy-Allowed-Request-Headers';
	$opt_in = '';
	foreach ( $headers as $name => $value ) {
		$lower = strtolower( (string) $name );
		if ( 'date' === $lower && is_string( $value ) ) {
			$date = $value;
		} elseif ( 'x-cors-proxy-allowed-request-headers' === $lower && is_string( $value ) ) {
			$opt_in_name = $name;
			$opt_in = trim( $value );
		}
	}

	$changed = false;
	if ( ! in_array( 'authorization', array_map( 'trim', explode( ',', strtolower( $opt_in ) ) ), true ) ) {
		$headers[ $opt_in_name ] = '' === $opt_in ? 'authorization' : $opt_in . ',authorization';
		$args['headers'] = $headers;
		$changed = true;
	}

	parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $query );
	if ( '' !== $date && ! isset( $query['auth_date'] ) ) {
		$hash = strpos( $url, '#' );
		$fragment = false === $hash ? '' : substr( $url, $hash );
		$base = false === $hash ? $url : substr( $url, 0, $hash );
		if ( false === strpos( $base, '?' ) ) {
			$separator = '?';
		} elseif ( '?' === substr( $base, -1 ) || '&' === substr( $base, -1 ) ) {
			$separator = '';
		} else {
			$separator = '&';
		}
		$url = $base . $separator . 'auth_date=' . rawurlencode( $date ) . $fragment;
		$changed = true;
	}

	// The repeated request is already opted in and stamped, so this filter lets it through.
	return $changed ? wp_remote_request( $url, $args ) : $response;
}
add_filter( 'pre_http_request', 'techies_playground_freemius_api_request', 10, 3 );
`
