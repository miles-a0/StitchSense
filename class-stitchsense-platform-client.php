<?php
/**
 * Server-side client for the dedicated StitchSense platform API.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('StitchSense_Platform_Client')) {
    final class StitchSense_Platform_Client {
        const TOKEN_TRANSIENT_PREFIX = 'stitchsense_platform_token_';

        public static function settings_status() {
            $base = self::api_base_url();
            return [
                'enabled' => self::enabled(),
                'api_base_url' => $base,
                'has_secret' => self::bridge_secret() !== '',
                'ready' => self::enabled() && $base !== '' && self::bridge_secret() !== '',
            ];
        }

        public static function enabled() {
            if (defined('STITCHSENSE_PLATFORM_API_ENABLED')) {
                return (bool) STITCHSENSE_PLATFORM_API_ENABLED;
            }
            return get_option('stitchsense_platform_api_enabled', '') === '1';
        }

        public static function api_base_url() {
            $base = defined('STITCHSENSE_PLATFORM_API_BASE_URL')
                ? STITCHSENSE_PLATFORM_API_BASE_URL
                : get_option('stitchsense_platform_api_base_url', '');
            return rtrim(esc_url_raw((string) $base), '/');
        }

        private static function bridge_secret() {
            if (defined('STITCHSENSE_PLATFORM_BRIDGE_SECRET') && STITCHSENSE_PLATFORM_BRIDGE_SECRET) {
                return (string) STITCHSENSE_PLATFORM_BRIDGE_SECRET;
            }
            return (string) get_option('stitchsense_platform_bridge_secret', '');
        }

        public static function token_for_current_user() {
            $user = wp_get_current_user();
            if (!$user || empty($user->ID)) {
                return new WP_Error('stitchsense_platform_not_authenticated', 'You must be logged in.', ['status' => 401]);
            }
            return self::token_for_user($user);
        }

        public static function token_for_user(WP_User $user) {
            if (!self::enabled()) {
                return new WP_Error('stitchsense_platform_disabled', 'The StitchSense platform API is disabled.', ['status' => 503]);
            }

            $base = self::api_base_url();
            $secret = self::bridge_secret();
            if ($base === '' || $secret === '') {
                return new WP_Error('stitchsense_platform_not_configured', 'The StitchSense platform API is not configured.', ['status' => 503]);
            }

            $cache_key = self::TOKEN_TRANSIENT_PREFIX . (int) $user->ID;
            $cached = get_transient($cache_key);
            if (is_array($cached) && !empty($cached['accessToken'])) {
                return $cached['accessToken'];
            }

            $response = wp_remote_post($base . '/auth/wordpress', [
                'timeout' => 20,
                'headers' => [
                    'content-type' => 'application/json',
                    'accept' => 'application/json',
                    'x-stitchsense-wordpress-secret' => $secret,
                ],
                'body' => wp_json_encode([
                    'wpUserId' => (int) $user->ID,
                    'email' => $user->user_email,
                    'displayName' => $user->display_name ?: $user->user_login,
                    'siteUrl' => home_url('/'),
                    'roles' => array_values((array) $user->roles),
                ]),
            ]);

            if (is_wp_error($response)) {
                return $response;
            }

            $code = (int) wp_remote_retrieve_response_code($response);
            $payload = json_decode((string) wp_remote_retrieve_body($response), true);
            if ($code < 200 || $code >= 300 || empty($payload['accessToken'])) {
                return new WP_Error('stitchsense_platform_auth_failed', 'Could not authenticate with the StitchSense platform API.', ['status' => $code ?: 502]);
            }

            set_transient($cache_key, [
                'accessToken' => $payload['accessToken'],
                'user' => $payload['user'] ?? null,
            ], 12 * MINUTE_IN_SECONDS);

            return $payload['accessToken'];
        }

        public static function request($method, $path, $body = null) {
            $token = self::token_for_current_user();
            if (is_wp_error($token)) return $token;

            return self::request_with_token($token, $method, $path, $body);
        }

        public static function request_for_user(WP_User $user, $method, $path, $body = null) {
            $token = self::token_for_user($user);
            if (is_wp_error($token)) return $token;

            return self::request_with_token($token, $method, $path, $body);
        }

        private static function request_with_token($token, $method, $path, $body = null) {
            if (!is_string($token) || $token === '') {
                return new WP_Error('stitchsense_platform_missing_token', 'Could not authenticate with the StitchSense platform API.', ['status' => 401]);
            }

            $base = self::api_base_url();
            $args = [
                'method' => strtoupper((string) $method),
                'timeout' => 30,
                'headers' => [
                    'accept' => 'application/json',
                    'authorization' => 'Bearer ' . $token,
                    'x-stitchsense-client-surface' => 'wordpress',
                ],
            ];

            if ($body !== null) {
                $args['headers']['content-type'] = 'application/json';
                $args['body'] = wp_json_encode($body);
            }

            $response = wp_remote_request($base . '/' . ltrim((string) $path, '/'), $args);
            if (is_wp_error($response)) return $response;

            $code = (int) wp_remote_retrieve_response_code($response);
            $payload = json_decode((string) wp_remote_retrieve_body($response), true);
            if ($code < 200 || $code >= 300) {
                $detail = '';
                if (is_array($payload)) {
                    $detail = (string) ($payload['error'] ?? $payload['message'] ?? $payload['code'] ?? '');
                }
                $message = 'The StitchSense platform API request failed.';
                if ($detail !== '') {
                    $message = $detail;
                } elseif ($code > 0) {
                    $message = 'The StitchSense platform API request failed (HTTP ' . $code . ').';
                }
                return new WP_Error('stitchsense_platform_request_failed', $message, ['status' => $code ?: 502, 'payload' => $payload]);
            }

            return is_array($payload) ? $payload : [];
        }

        public static function upload_file($path, $file_path, $args = []) {
            $token = self::token_for_current_user();
            if (is_wp_error($token)) return $token;

            if (!function_exists('curl_init') || !class_exists('CURLFile')) {
                return new WP_Error(
                    'stitchsense_platform_upload_unavailable',
                    'PHP cURL file upload support is unavailable on this server.',
                    ['status' => 501]
                );
            }

            $base = self::api_base_url();
            $filename = !empty($args['filename']) ? sanitize_file_name((string) $args['filename']) : basename($file_path);
            $mime_type = !empty($args['mimeType']) ? (string) $args['mimeType'] : 'application/octet-stream';

            $fields = [
                'file' => new CURLFile($file_path, $mime_type, $filename),
            ];

            $curl = curl_init($base . '/' . ltrim((string) $path, '/'));
            if ($curl === false) {
                return new WP_Error('stitchsense_platform_upload_init_failed', 'Could not initialise platform upload request.', ['status' => 500]);
            }

            curl_setopt_array($curl, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 60,
                CURLOPT_HTTPHEADER => [
                    'Accept: application/json',
                    'Authorization: Bearer ' . $token,
                ],
                CURLOPT_POSTFIELDS => $fields,
            ]);

            $raw = curl_exec($curl);
            $error = curl_error($curl);
            $code = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);

            if ($raw === false) {
                return new WP_Error(
                    'stitchsense_platform_upload_failed',
                    'The StitchSense platform file upload failed' . ($error ? ': ' . $error : '.'),
                    ['status' => $code ?: 502]
                );
            }

            $payload = json_decode((string) $raw, true);
            if ($code < 200 || $code >= 300) {
                return new WP_Error(
                    'stitchsense_platform_upload_failed',
                    'The StitchSense platform file upload failed.',
                    ['status' => $code ?: 502, 'payload' => $payload]
                );
            }

            return is_array($payload) ? $payload : [];
        }
    }
}
