// Freemius signs every API call with the request's Date header, but browsers refuse to
// send a Date header from fetch(), so inside Playground the call arrives without it and
// Freemius answers 401 "You must provide valid formatted date stamp". Freemius also reads
// the same value from an auth_date query parameter. This must-use plugin, written into
// every launched site, copies the Date header into auth_date for the Freemius API hosts
// only and changes nothing else. Other licence systems that sign requests differently
// (WooCommerce.com-style updaters) are not covered.
export const FREEMIUS_DATE_STAMP_PLUGIN_PATH = '/wordpress/wp-content/mu-plugins/techies-freemius-date-stamp.php'

export const FREEMIUS_DATE_STAMP_PLUGIN = `<?php
/**
 * Plugin Name: Techies Playground: Freemius date stamp
 * Description: Browsers drop the Date header Freemius signs its API calls with, so this copies it into the auth_date query parameter Freemius also reads, for api.freemius.com and sandbox-api.freemius.com only.
 */

function techies_playground_freemius_date_stamp( $response, $args, $url ) {
	if ( false !== $response ) {
		return $response;
	}
	$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
	if ( 'api.freemius.com' !== $host && 'sandbox-api.freemius.com' !== $host ) {
		return $response;
	}
	$date = '';
	$headers = isset( $args['headers'] ) && is_array( $args['headers'] ) ? $args['headers'] : array();
	foreach ( $headers as $name => $value ) {
		if ( is_string( $name ) && 'date' === strtolower( $name ) && is_string( $value ) ) {
			$date = $value;
		}
	}
	parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $query );
	if ( '' === $date || isset( $query['auth_date'] ) ) {
		return $response;
	}
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
	// The stamped URL carries auth_date, so this filter lets the repeated request through.
	return wp_remote_request( $base . $separator . 'auth_date=' . rawurlencode( $date ) . $fragment, $args );
}
add_filter( 'pre_http_request', 'techies_playground_freemius_date_stamp', 10, 3 );
`
