<?php
/**
 * Plugin Name: Techies Freemius probe
 * Description: Test-only. Sends Freemius-shaped signed GET and PUT requests with a fake key and prints what came back.
 * Version: 1.0.0
 */

add_action( 'init', function () {
	if ( ! isset( $_GET['techies_freemius_probe'] ) || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$sent = array();
	add_action( 'http_api_debug', function ( $response, $context, $class, $args, $url ) use ( &$sent ) {
		$sent[] = array(
			'method' => $args['method'],
			'url'    => $url,
			'code'   => is_wp_error( $response ) ? $response->get_error_code() : wp_remote_retrieve_response_code( $response ),
			'body'   => is_wp_error( $response ) ? $response->get_error_message() : substr( wp_remote_retrieve_body( $response ), 0, 300 ),
			'header_names' => is_wp_error( $response ) ? array() : array_keys( wp_remote_retrieve_headers( $response )->getAll() ),
		);
	}, 10, 5 );

	$out = array(
		'mu_plugin_loaded' => function_exists( 'techies_playground_freemius_api_request' ),
		'active_plugins'   => get_option( 'active_plugins' ),
	);
	if ( ! class_exists( 'Freemius_Api_WordPress' ) && file_exists( WP_PLUGIN_DIR . '/foogallery/freemius/start.php' ) ) {
		$out['sdk_from'] = 'loaded by the probe';
		require_once WP_PLUGIN_DIR . '/foogallery/freemius/start.php';
		require_once WP_PLUGIN_DIR . '/foogallery/freemius/includes/sdk/FreemiusWordPress.php';
	}
	if ( ! defined( 'WP_FS__API_TIMEOUT' ) ) {
		define( 'WP_FS__API_TIMEOUT', 30 );
	}
	$out['sdk_loaded'] = class_exists( 'Freemius_Api_WordPress' );
	if ( $out['sdk_loaded'] ) {
		// Fake install keys: the call must get past the date check and fail on the key.
		$api = new Freemius_Api_WordPress( 'install', 1234567, 'pk_00000000000000000000000000000', 'sk_00000000000000000000000000000' );
		$out['sdk_get'] = $api->Api( '/', 'GET' );
		$out['sdk_put'] = $api->Api( '/', 'PUT', array( 'is_active' => true ) );
		// The same signed calls without the SDK's x-api-server check.
		foreach ( array( 'GET', 'PUT' ) as $method ) {
			$path = '/v1/installs/1234567.json';
			$args = array( 'method' => $method, 'timeout' => 30, 'headers' => array() );
			if ( 'PUT' === $method ) {
				$args['body'] = wp_json_encode( array( 'is_active' => true ) );
				$args['headers']['Content-type'] = 'application/json';
			}
			$args = $api->SignRequest( $path, $args );
			$response = wp_remote_request( 'https://api.freemius.com' . $path, $args );
			$out[ 'raw_' . strtolower( $method ) ] = is_wp_error( $response ) ? $response->get_error_message() : wp_remote_retrieve_body( $response );
		}
	}
	$out['sent'] = $sent;
	header( 'Content-Type: application/json' );
	echo 'TECHIES_PROBE:' . wp_json_encode( $out );
	exit;
} );
