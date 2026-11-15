<?php
/**
 * Plugin Name: Techies Freemius activation probe
 * Description: Test-only. Activates a fake licence key in Menu Image through its own Freemius SDK and prints every Freemius request and the result.
 * Version: 1.0.0
 */
add_action( 'admin_init', function () {
	if ( ! isset( $_GET['techies_freemius_probe'] ) || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$sent = array();
	add_action( 'http_api_debug', function ( $response, $context, $class, $args, $url ) use ( &$sent ) {
		if ( false === strpos( $url, 'freemius.com' ) ) {
			return;
		}
		$sent[] = array(
			'method' => $args['method'],
			'url'    => preg_replace( '/auth_date=[^&]*/', 'auth_date=…', $url ),
			'sent_body' => is_array( $args['body'] ) ? implode( ',', array_keys( $args['body'] ) ) : substr( (string) $args['body'], 0, 80 ),
			'code'   => is_wp_error( $response ) ? $response->get_error_code() : wp_remote_retrieve_response_code( $response ),
			'answer' => is_wp_error( $response ) ? $response->get_error_message() : substr( wp_strip_all_tags( wp_remote_retrieve_body( $response ) ), 0, 220 ),
		);
	}, 10, 5 );
	$fs = null;
	foreach ( Freemius::_get_all_instances() as $instance ) {
		if ( $instance->is_plugin() && 0 === strpos( $instance->get_plugin_basename(), 'menu-image/' ) ) {
			$fs = $instance;
		}
	}
	$out = array( 'mu_plugin_loaded' => function_exists( 'techies_playground_freemius_api_request' ), 'proxy_routing' => function_exists( 'techies_playground_freemius_proxy_url' ), 'found' => null !== $fs );
	if ( $fs ) {
		$answer = $fs->activate_migrated_license( 'abcdefghijklmnopqrstuvwxyz123456' );
		$out['success'] = ! empty( $answer['success'] );
		$out['error'] = isset( $answer['error'] ) ? substr( trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( is_string( $answer['error'] ) ? $answer['error'] : wp_json_encode( $answer['error'] ) ) ) ), 0, 300 ) : '';
	}
	$out['sent'] = $sent;
	header( 'Content-Type: application/json' );
	echo 'TECHIES_PROBE:' . wp_json_encode( $out );
	exit;
} );
