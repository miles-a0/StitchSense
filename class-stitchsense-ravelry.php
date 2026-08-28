<?php
/**
 * Ravelry integration scaffolding for StitchSense.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('StitchSense_Ravelry')) {
    final class StitchSense_Ravelry {
        private static $instance = null;

        public static function instance() {
            if (self::$instance === null) {
                self::$instance = new self();
            }
            return self::$instance;
        }

        private function __construct() {}

        public static function option_keys() {
            return [
                'client_id' => 'stitchsense_ravelry_client_id',
                'client_secret' => 'stitchsense_ravelry_client_secret',
                'basic_username' => 'stitchsense_ravelry_basic_username',
                'basic_password' => 'stitchsense_ravelry_basic_password',
                'authorize_url' => 'stitchsense_ravelry_authorize_url',
                'token_url' => 'stitchsense_ravelry_token_url',
                'api_base_url' => 'stitchsense_ravelry_api_base_url',
                'callback_url' => 'stitchsense_ravelry_callback_url',
                'profile_path' => 'stitchsense_ravelry_profile_path',
                'search_path' => 'stitchsense_ravelry_search_path',
                'detail_path' => 'stitchsense_ravelry_detail_path',
                'saved_path' => 'stitchsense_ravelry_saved_path',
                'download_paths' => 'stitchsense_ravelry_download_paths',
            ];
        }

        public static function callback_url() {
            $keys = self::option_keys();
            $override = esc_url_raw(get_option($keys['callback_url'], ''));
            return $override ?: rest_url('stitchsense/v1/ravelry/callback');
        }

	        public static function settings() {
	            $keys = self::option_keys();
	            return [
	                'client_id' => (string) get_option($keys['client_id'], ''),
	                'client_secret' => (string) get_option($keys['client_secret'], ''),
	                'basic_username' => (string) get_option($keys['basic_username'], ''),
	                'basic_password' => (string) get_option($keys['basic_password'], ''),
	                'authorize_url' => esc_url_raw(get_option($keys['authorize_url'], 'https://www.ravelry.com/oauth2/auth')),
	                'token_url' => esc_url_raw(get_option($keys['token_url'], 'https://www.ravelry.com/oauth2/token')),
	                'api_base_url' => esc_url_raw(get_option($keys['api_base_url'], 'https://api.ravelry.com')),
	                'callback_url' => self::callback_url(),
	                'profile_path' => sanitize_text_field(get_option($keys['profile_path'], '/current_user.json')),
	                'search_path' => sanitize_text_field(get_option($keys['search_path'], '/patterns/search.json')),
	                'detail_path' => sanitize_text_field(get_option($keys['detail_path'], '/patterns/{id}.json')),
	                'saved_path' => sanitize_text_field(get_option($keys['saved_path'], '/people/{username}/library/search.json')),
	                'download_paths' => sanitize_textarea_field(get_option($keys['download_paths'], "/patterns/{id}/download.json\n/patterns/{id}/downloads.json\n/patterns/{id}/sources.json")),
	            ];
	        }

	        private function connection_for_user($uid) {
	            $connection = get_user_meta($uid, 'stitchsense_ravelry_connection', true);
	            return is_array($connection) && !empty($connection['connected']) ? $connection : null;
	        }

	        private function auth_token_type($connection) {
	            $token_type = sanitize_text_field($connection['token_type'] ?? 'Bearer');
	            return strtolower($token_type) === 'bearer' || $token_type === '' ? 'Bearer' : $token_type;
	        }

	        private function token_expires_soon($connection) {
	            $expires = !empty($connection['token_expires']) ? strtotime((string) $connection['token_expires']) : 0;
	            return $expires > 0 && $expires <= (time() + 90);
	        }

	        private function is_invalid_oauth_response($status, $body, $raw = '') {
	            if (!in_array((int) $status, [401, 403], true)) return false;
	            $detail = '';
	            if (is_array($body)) {
	                $detail = strtolower((string) ($body['error_description'] ?? $body['error'] ?? $body['message'] ?? ''));
	            }
	            if (!$detail) $detail = strtolower(wp_strip_all_tags((string) $raw));
	            return strpos($detail, 'token') !== false || strpos($detail, 'oauth') !== false || strpos($detail, 'forbidden') !== false || strpos($detail, 'unauthorized') !== false;
	        }

	        private function refresh_oauth_token($uid, ?array $connection = null) {
	            $settings = self::settings();
	            if (!$connection) $connection = $this->connection_for_user($uid);
	            if (!$connection || empty($connection['refresh_token'])) {
	                return new WP_Error('ravelry_reconnect_required', 'Ravelry needs to be reconnected before importing saved patterns.', ['status' => 401]);
	            }
	            if (empty($settings['client_id']) || empty($settings['client_secret']) || empty($settings['token_url'])) {
	                return new WP_Error('ravelry_token_refresh_not_configured', 'Ravelry token refresh is not configured.', ['status' => 503]);
	            }

	            $token_body = [
	                'grant_type' => 'refresh_token',
	                'refresh_token' => $connection['refresh_token'],
	            ];
	            $response = $this->token_request($settings, $token_body, true);
	            if (!is_wp_error($response)) {
	                $first_status = intval(wp_remote_retrieve_response_code($response));
	                $first_body = $this->parse_token_response($response);
	                if ($first_status < 200 || $first_status >= 300 || !is_array($first_body) || empty($first_body['access_token'])) {
	                    $response = $this->token_request($settings, $token_body, false);
	                }
	            }
	            if (is_wp_error($response)) return $response;

	            $status = intval(wp_remote_retrieve_response_code($response));
	            $raw_body = wp_remote_retrieve_body($response);
	            $body = $this->parse_token_response($response);
	            if ($status < 200 || $status >= 300 || !is_array($body) || empty($body['access_token'])) {
	                $detail = is_array($body) ? sanitize_text_field($body['error_description'] ?? $body['error'] ?? $body['message'] ?? '') : '';
	                if (!$detail) $detail = substr(trim(wp_strip_all_tags((string) $raw_body)), 0, 220);
	                return new WP_Error('ravelry_token_refresh_failed', 'Ravelry token refresh failed' . ($status ? ' (HTTP ' . $status . ')' : '') . ($detail ? ': ' . $detail : '. Please reconnect Ravelry.'), ['status' => $status ?: 502]);
	            }

	            $token_type = sanitize_text_field($body['token_type'] ?? ($connection['token_type'] ?? 'Bearer'));
	            $connection['connected'] = true;
	            $connection['access_token'] = sanitize_text_field($body['access_token']);
	            $connection['refresh_token'] = sanitize_text_field($body['refresh_token'] ?? $connection['refresh_token']);
	            $connection['token_type'] = $token_type ?: 'Bearer';
	            $connection['token_expires'] = !empty($body['expires_in']) ? gmdate('c', time() + intval($body['expires_in'])) : '';
	            $connection['token_refreshed_at'] = gmdate('c');
	            update_user_meta($uid, 'stitchsense_ravelry_connection', $connection);
	            return $connection;
	        }

        private function api_url($path, array $params = []) {
            $settings = self::settings();
            $path = trim((string) $path);
            if (!$path) return '';
            if (preg_match('#^https?://#i', $path)) {
                $url = $path;
            } else {
                $url = rtrim($settings['api_base_url'], '/') . '/' . ltrim($path, '/');
            }
            return $params ? add_query_arg($params, $url) : $url;
        }

	        private function api_get($uid, $path, array $params = []) {
	            $connection = $this->connection_for_user($uid);
	            if (!$connection || empty($connection['access_token'])) {
	                return new WP_Error('ravelry_not_connected', 'Ravelry is not connected.', ['status' => 401]);
	            }
	            if ($this->token_expires_soon($connection)) {
	                $refreshed = $this->refresh_oauth_token($uid, $connection);
	                if (!is_wp_error($refreshed)) $connection = $refreshed;
	            }
	            $url = $this->api_url($path, $params);
	            if (!$url) {
	                return new WP_Error('ravelry_not_configured', 'Ravelry API path is not configured.', ['status' => 503]);
	            }
	            $request = function($active_connection) use ($url) {
		            $token_type = $this->auth_token_type($active_connection);
	                return wp_remote_get($url, [
	                    'timeout' => 30,
	                    'headers' => [
	                        'Accept' => 'application/json',
	                        'Authorization' => $token_type . ' ' . $active_connection['access_token'],
	                    ],
	                ]);
	            };
	            $response = $request($connection);
	            if (is_wp_error($response)) return $response;
	            $status = intval(wp_remote_retrieve_response_code($response));
	            $raw = wp_remote_retrieve_body($response);
	            $body = json_decode($raw, true);
	            if ($this->is_invalid_oauth_response($status, $body, $raw)) {
	                $refreshed = $this->refresh_oauth_token($uid, $connection);
	                if (is_wp_error($refreshed)) {
	                    return new WP_Error('ravelry_reconnect_required', 'Ravelry authorization expired. Please reconnect Ravelry, then try importing your saved patterns again.', ['status' => 401]);
	                }
	                $connection = $refreshed;
	                $response = $request($connection);
	                if (is_wp_error($response)) return $response;
	                $status = intval(wp_remote_retrieve_response_code($response));
	                $raw = wp_remote_retrieve_body($response);
	                $body = json_decode($raw, true);
	            }
	            if ($status < 200 || $status >= 300 || !is_array($body)) {
	                $detail = is_array($body) ? sanitize_text_field($body['error_description'] ?? $body['error'] ?? $body['message'] ?? '') : '';
	                if (!$detail) $detail = substr(trim(wp_strip_all_tags((string) $raw)), 0, 220);
                return new WP_Error('ravelry_api_error', 'Ravelry API request failed' . ($status ? ' (HTTP ' . $status . ')' : '') . ($detail ? ': ' . $detail : '.'), ['status' => $status ?: 502]);
            }
            return $body;
        }

        private function api_get_basic($path, array $params = []) {
            $settings = self::settings();
            $url = $this->api_url($path, $params);
            if (!$url) {
                return new WP_Error('ravelry_not_configured', 'Ravelry API path is not configured.', ['status' => 503]);
            }
            $basic_user = $settings['basic_username'] ?: $settings['client_id'];
            $basic_pass = $settings['basic_password'] ?: $settings['client_secret'];
            if (!$basic_user || !$basic_pass) {
                return new WP_Error('ravelry_basic_missing', 'Ravelry Basic Auth credentials are not configured.', ['status' => 503]);
            }
            $response = wp_remote_get($url, [
                'timeout' => 30,
                'headers' => [
                    'Accept' => 'application/json',
                    'Authorization' => 'Basic ' . base64_encode($basic_user . ':' . $basic_pass),
                ],
            ]);
            if (is_wp_error($response)) return $response;
            $status = intval(wp_remote_retrieve_response_code($response));
            $raw = wp_remote_retrieve_body($response);
            $body = json_decode($raw, true);
            if ($status < 200 || $status >= 300 || !is_array($body)) {
                $detail = is_array($body) ? sanitize_text_field($body['error_description'] ?? $body['error'] ?? $body['message'] ?? '') : '';
                if (!$detail) $detail = substr(trim(wp_strip_all_tags((string) $raw)), 0, 220);
                return new WP_Error('ravelry_api_error', 'Ravelry API request failed' . ($status ? ' (HTTP ' . $status . ')' : '') . ($detail ? ': ' . $detail : '.'), ['status' => $status ?: 502]);
            }
            return $body;
        }

        private function api_get_public($uid, $path, array $params = []) {
            $basic = $this->api_get_basic($path, $params);
            if (!is_wp_error($basic)) return $basic;
            $oauth = $this->api_get($uid, $path, $params);
            return is_wp_error($oauth) ? $basic : $oauth;
        }

        private function api_probe($uid, $label, $path, array $params = [], $auth_mode = 'oauth') {
            $settings = self::settings();
            $connection = $this->connection_for_user($uid);
            $url = $this->api_url($path, $params);
            $headers = ['Accept' => 'application/json'];
            $auth_ready = false;
            $auth_note = '';

            if ($auth_mode === 'basic') {
                $basic_user = $settings['basic_username'] ?: $settings['client_id'];
                $basic_pass = $settings['basic_password'] ?: $settings['client_secret'];
                if (!empty($basic_user) && !empty($basic_pass)) {
                    $headers['Authorization'] = 'Basic ' . base64_encode($basic_user . ':' . $basic_pass);
                    $auth_ready = true;
                } else {
                    $auth_note = 'Ravelry Basic Auth credentials missing.';
                }
            } else {
                if ($connection && !empty($connection['access_token'])) {
	                    $token_type = $this->auth_token_type($connection);
                    $headers['Authorization'] = $token_type . ' ' . $connection['access_token'];
                    $auth_ready = true;
                } else {
                    $auth_note = 'OAuth access token missing.';
                }
            }

            $safe = [
                'label' => sanitize_text_field($label),
                'path' => sanitize_text_field($path),
                'auth_mode' => sanitize_text_field($auth_mode),
                'auth_ready' => $auth_ready,
                'configured' => (bool) $url,
                'host' => $url ? parse_url($url, PHP_URL_HOST) : '',
                'url_path' => $url ? parse_url($url, PHP_URL_PATH) : '',
                'status' => 0,
                'ok' => false,
                'error' => $auth_note,
                'keys' => [],
                'excerpt' => '',
            ];
            if (!$url || !$auth_ready) return $safe;

            $response = wp_remote_get($url, [
                'timeout' => 30,
                'redirection' => 3,
                'headers' => $headers,
            ]);
            if (is_wp_error($response)) {
                $safe['error'] = $response->get_error_message();
                return $safe;
            }

            $status = intval(wp_remote_retrieve_response_code($response));
            $raw = (string) wp_remote_retrieve_body($response);
            $body = json_decode($raw, true);
            $safe['status'] = $status;
            $safe['ok'] = $status >= 200 && $status < 300 && is_array($body);
            $safe['keys'] = is_array($body) ? array_slice(array_map('sanitize_text_field', array_keys($body)), 0, 12) : [];
            if (!$safe['ok']) {
                if (is_array($body)) {
                    $safe['error'] = sanitize_text_field($body['error_description'] ?? $body['error'] ?? $body['message'] ?? ('HTTP ' . $status));
                } else {
                    $safe['error'] = 'HTTP ' . ($status ?: 'unknown');
                }
                $safe['excerpt'] = substr(trim(wp_strip_all_tags($raw)), 0, 240);
            }
            return $safe;
        }

        private function replace_path_tokens($path, array $tokens) {
            foreach ($tokens as $key => $value) {
                $path = str_replace('{' . $key . '}', rawurlencode((string) $value), $path);
            }
            return $path;
        }

        private function extract_pattern_item($body) {
            if (!is_array($body)) return [];
            foreach (['pattern', 'patterns', 'result', 'item'] as $key) {
                if (!empty($body[$key])) {
                    if (is_array($body[$key]) && array_keys($body[$key]) === range(0, count($body[$key]) - 1)) {
                        return is_array($body[$key][0] ?? null) ? $body[$key][0] : [];
                    }
                    return is_array($body[$key]) ? $body[$key] : [];
                }
            }
            return $body;
        }

        private function is_list_array($value) {
            return is_array($value) && array_keys($value) === range(0, count($value) - 1);
        }

        private function looks_like_pattern_record($item) {
            if (!is_array($item)) return false;
            if (!empty($item['pattern']) && is_array($item['pattern'])) return true;
            foreach (['id', 'pattern_id', 'name', 'title', 'permalink', 'first_photo', 'designer'] as $key) {
                if (array_key_exists($key, $item)) return true;
            }
            return false;
        }

        private function extract_pattern_items($body, $depth = 0) {
            if (!is_array($body) || $depth > 4) return [];
            $direct_keys = [
                'patterns',
                'pattern_results',
                'pattern_search_results',
                'results',
                'items',
                'library',
                'library_entries',
                'library_patterns',
                'favorites',
                'projects',
                'queued_projects',
                'volumes',
            ];

            foreach ($direct_keys as $key) {
                if (!empty($body[$key]) && is_array($body[$key])) {
                    $candidate = $body[$key];
                    if ($this->is_list_array($candidate)) {
                        $items = [];
                        foreach ($candidate as $row) {
                            if ($this->looks_like_pattern_record($row)) {
                                $items[] = $row;
                            } elseif (is_array($row)) {
                                $items = array_merge($items, $this->extract_pattern_items($row, $depth + 1));
                            }
                        }
                        if ($items) return $items;
                    } else {
                        $items = $this->extract_pattern_items($candidate, $depth + 1);
                        if ($items) return $items;
                    }
                }
            }

            if ($this->is_list_array($body)) {
                $items = [];
                foreach ($body as $row) {
                    if ($this->looks_like_pattern_record($row)) {
                        $items[] = $row;
                    } elseif (is_array($row)) {
                        $items = array_merge($items, $this->extract_pattern_items($row, $depth + 1));
                    }
                }
                return $items;
            }

            foreach ($body as $key => $value) {
                if ($key === 'paginator' || $key === 'pagination') continue;
                if (!is_array($value)) continue;
                $items = $this->extract_pattern_items($value, $depth + 1);
                if ($items) return $items;
            }

            return $this->looks_like_pattern_record($body) ? [$body] : [];
        }

	        private function first_pdf_url_in_value($value, $depth = 0) {
            if ($depth > 7 || $value === null || $value === false) return '';
            if (is_string($value)) {
                $url = trim($value);
                if (!preg_match('#^https?://#i', $url)) return '';
                $path = strtolower(parse_url($url, PHP_URL_PATH) ?: '');
                return (substr($path, -4) === '.pdf' || preg_match('#/(download|downloads|dls|pattern_files|pdf|free_patterns)(/|$)#i', $url)) ? esc_url_raw($url) : '';
            }
            if (!is_array($value)) return '';

	            $priority_keys = [
	                'pdf_url',
	                'download_url',
	                'download_location',
                'download_uri',
                'free_pattern_url',
                'pattern_download_url',
                'file_url',
                'url',
                'href',
            ];
	            foreach ($priority_keys as $key) {
	                if (!empty($value[$key])) {
	                    $url = $this->download_url_from_priority_value($key, $value[$key], $depth + 1);
	                    if ($url) return $url;
	                }
	            }
            foreach ($value as $key => $child) {
                if (in_array($key, $priority_keys, true)) continue;
                $url = $this->first_pdf_url_in_value($child, $depth + 1);
                if ($url) return $url;
            }
	            return '';
	        }

	        private function download_url_from_priority_value($key, $value, $depth = 0) {
	            if (is_string($value)) {
	                $url = trim($value);
	                if (!preg_match('#^https?://#i', $url)) return '';
	                if (in_array($key, ['pdf_url', 'download_url', 'download_location', 'download_uri', 'pattern_download_url', 'file_url'], true)) {
	                    return esc_url_raw($url);
	                }
	            }
	            return $this->first_pdf_url_in_value($value, $depth);
	        }

	        private function ravelry_download_paths() {
	            $settings = self::settings();
	            $raw = str_replace(["\r\n", "\r"], "\n", (string) ($settings['download_paths'] ?? ''));
	            $paths = array_filter(array_map('trim', explode("\n", $raw)));
	            $paths = array_merge($paths, [
	                '/patterns/{id}/download.json',
	                '/patterns/{id}/downloads.json',
	                '/patterns/{id}/sources.json',
	                '/patterns/{id}/files.json',
	                '/patterns/{id}/pattern_files.json',
	                '/patterns/{id}/download',
	            ]);
	            return array_values(array_unique($paths));
	        }

        private function discover_pattern_pdf_url($uid, $id, array $detail_body = []) {
            $url = $this->first_pdf_url_in_value($detail_body);
            if ($url) return ['url' => $url, 'source' => 'detail'];
            if (!$id) return ['url' => '', 'source' => ''];

	            foreach ($this->ravelry_download_paths() as $path_template) {
	                $path = $this->replace_path_tokens($path_template, ['id' => $id]);
	                $body = $this->api_get_public($uid, $path);
	                if (is_wp_error($body)) {
	                    $oauth_body = $this->api_get($uid, $path);
	                    $status = is_wp_error($oauth_body) ? (int) ($oauth_body->get_error_data()['status'] ?? 0) : 0;
	                    if ($status === 200) {
	                        $endpoint_url = $this->api_url($path);
	                        if ($endpoint_url) return ['url' => $endpoint_url, 'source' => $path_template];
	                    }
	                    continue;
	                }
	                $url = $this->first_pdf_url_in_value($body);
	                if ($url) return ['url' => $url, 'source' => $path_template];
	            }

            return ['url' => '', 'source' => ''];
        }

        private function ravelry_metadata_summary($pattern, $pdf_url = '') {
            $lines = ['Imported from Ravelry.'];
            if (!empty($pattern['designer'])) $lines[] = 'Designer: ' . $pattern['designer'];
            if (!empty($pattern['craft_type'])) $lines[] = 'Craft: ' . $pattern['craft_type'];
            if (!empty($pattern['gauge'])) $lines[] = 'Gauge: ' . $pattern['gauge'];
            if (!empty($pattern['sizes'])) $lines[] = 'Sizes: ' . $pattern['sizes'];
            if (!empty($pattern['yardage'])) $lines[] = 'Yardage: ' . $pattern['yardage'];
            if (!empty($pattern['notes'])) {
                $lines[] = '';
                $lines[] = $pattern['notes'];
            }
            $lines[] = '';
            $lines[] = $pdf_url ? 'The Ravelry PDF was saved to your StitchSense library.' : 'Ravelry did not expose a PDF/download URL for this pattern through the connected API response.';
            return implode("\n", $lines);
        }

	        private function pattern_availability_label(array $detail, $stored_pdf_url = '') {
	            foreach (['currency', 'price', 'price_description', 'pattern_price'] as $key) {
	                if (!empty($detail[$key]) && !in_array((string) $detail[$key], ['0', '0.0', '0.00', 'free'], true)) return 'paid';
	            }
	            if (!empty($detail['free_pattern_url'])) return 'free';
	            if (array_key_exists('downloadable', $detail) && filter_var($detail['downloadable'], FILTER_VALIDATE_BOOLEAN)) return 'paid';
	            $availability = strtolower(trim((string) ($detail['availability'] ?? $detail['downloadable'] ?? '')));
	            if ($availability) {
	                if (strpos($availability, 'paid') !== false || strpos($availability, 'purchase') !== false || strpos($availability, 'buy') !== false) return 'paid';
	                if ($availability === 'free' || strpos($availability, 'free download') !== false) return 'free';
	            }
	            foreach (['free', 'free_pattern', 'is_free'] as $key) {
	                if (array_key_exists($key, $detail) && filter_var($detail[$key], FILTER_VALIDATE_BOOLEAN)) return 'free';
	            }
	            return 'paid';
	        }

        private function canonical_ravelry_pattern_url($value, $fallback = '') {
            $value = trim((string) $value);
            $fallback = trim((string) $fallback);
            if (!$value && $fallback) $value = $fallback;
            if (!$value) return '';

            if (preg_match('#^https?://#i', $value)) {
                return esc_url_raw($value);
            }

            if (strpos($value, 'www.ravelry.com/') === 0 || strpos($value, 'ravelry.com/') === 0) {
                return esc_url_raw('https://' . ltrim($value, '/'));
            }

            $path = trim($value);
            if (strpos($path, '/patterns/library/') !== false) {
                $path = substr($path, strpos($path, '/patterns/library/') + strlen('/patterns/library/'));
            }
            $path = trim($path, " \t\n\r\0\x0B/");
            if (!$path) return '';
            return esc_url_raw('https://www.ravelry.com/patterns/library/' . rawurlencode($path));
        }

        private function summary_html_from_text($text) {
            $parts = preg_split('/\n+/', (string) $text);
            $html = '';
            foreach ($parts as $part) {
                $part = trim($part);
                if ($part !== '') $html .= '<p>' . esc_html($part) . '</p>';
            }
            return '<div class="ss-pattern-summary-html">' . $html . '</div>';
        }

        private function workflow_summary_from_payload($payload) {
            if (!is_array($payload)) return ['text' => '', 'html' => '', 'structured' => new stdClass()];
            $text = '';
            foreach (['pattern_summary_text', 'summary_text', 'answer', 'overview', 'analysis', 'output'] as $key) {
                if (!empty($payload[$key]) && is_string($payload[$key])) {
                    $text = trim(wp_strip_all_tags($payload[$key]));
                    break;
                }
            }
            $html = '';
            foreach (['pattern_summary_html', 'summary_html'] as $key) {
                if (!empty($payload[$key]) && is_string($payload[$key])) {
                    $html = wp_kses_post($payload[$key]);
                    break;
                }
            }
            $structured = $payload['pattern_summary_structured'] ?? $payload['structured_data'] ?? $payload['pattern_summary'] ?? null;
            if (!$html && $text) $html = $this->summary_html_from_text($text);
            return ['text' => $text, 'html' => $html, 'structured' => $structured ?: new stdClass()];
        }

	        private function download_ravelry_pdf($uid, $url, $title, $id) {
            if (!$url) return new WP_Error('ravelry_no_pdf_url', 'No Ravelry PDF URL was available.', ['status' => 400]);
            $connection = $this->connection_for_user($uid);
            $headers = ['Accept' => 'application/pdf,application/octet-stream,*/*'];
            if ($connection && !empty($connection['access_token'])) {
	                $headers['Authorization'] = $this->auth_token_type($connection) . ' ' . $connection['access_token'];
            }
            $response = wp_remote_get($url, [
                'timeout' => 120,
                'redirection' => 5,
                'headers' => $headers,
            ]);
            if (is_wp_error($response)) return $response;
	            $status = intval(wp_remote_retrieve_response_code($response));
	            $body = wp_remote_retrieve_body($response);
	            if ($status < 200 || $status >= 300 || !$body) {
	                return new WP_Error('ravelry_pdf_download_failed', 'Ravelry PDF download failed' . ($status ? ' (HTTP ' . $status . ')' : '') . '.', ['status' => $status ?: 502]);
	            }
	            $content_type = strtolower((string) wp_remote_retrieve_header($response, 'content-type'));
	            $starts_like_pdf = substr((string) $body, 0, 5) === '%PDF-';
	            if (!$starts_like_pdf && strpos($content_type, 'pdf') === false) {
	                return new WP_Error('ravelry_pdf_download_failed', 'Ravelry returned a web page instead of a PDF for this pattern.', ['status' => 502]);
	            }
	            if (strlen($body) > 50 * 1024 * 1024) {
                return new WP_Error('ravelry_pdf_too_large', 'The Ravelry PDF is over the 50 MB StitchSense import limit.', ['status' => 413]);
            }

            $uploads = wp_upload_dir();
            if (!empty($uploads['error']) || empty($uploads['basedir']) || empty($uploads['baseurl'])) {
                return new WP_Error('ravelry_uploads_unavailable', 'WordPress uploads are unavailable for saving the Ravelry PDF.', ['status' => 500]);
            }
            $subdir = 'stitchsense/ravelry/' . gmdate('Y/m');
            $dir = trailingslashit($uploads['basedir']) . $subdir;
            if (!wp_mkdir_p($dir)) {
                return new WP_Error('ravelry_upload_dir_failed', 'Could not create the StitchSense Ravelry uploads folder.', ['status' => 500]);
            }
            $base = sanitize_file_name(($title ?: 'ravelry-pattern') . ($id ? '-' . $id : '') . '.pdf');
            $filename = wp_unique_filename($dir, $base);
            $path = trailingslashit($dir) . $filename;
            if (file_put_contents($path, $body) === false) {
                return new WP_Error('ravelry_pdf_save_failed', 'Could not save the Ravelry PDF to WordPress uploads.', ['status' => 500]);
            }

            return [
                'path' => $path,
                'url' => trailingslashit($uploads['baseurl']) . $subdir . '/' . $filename,
                'relative_path' => $subdir . '/' . $filename,
                'filename' => $filename,
                'file_size' => filesize($path),
                'mime_type' => 'application/pdf',
            ];
        }

        private function save_library_pattern(array $payload) {
            $uid = get_current_user_id();
            if ($uid > 0 && method_exists(StitchSense_Library::instance(), 'save_pattern_for_user_id')) {
                return StitchSense_Library::instance()->save_pattern_for_user_id($uid, $payload);
            }

            $request = new WP_REST_Request('POST', '/stitchsense/v1/library/patterns');
            $request->set_header('Content-Type', 'application/json');
            $request->set_body(wp_json_encode($payload));
            return StitchSense_Library::instance()->save_pattern($request);
        }

        private function merge_non_empty_pattern_fields(array $base, array $incoming) {
            foreach ($incoming as $key => $value) {
                if ($value === null || $value === '' || $value === []) {
                    continue;
                }
                $base[$key] = $value;
            }
            return $base;
        }

        private function normalise_pattern_result($item) {
            if (!is_array($item)) return null;
            $library_pattern_id = sanitize_text_field($item['library_pattern_id'] ?? $item['libraryPatternId'] ?? $item['wp_library_pattern_id'] ?? '');
            $nested_pattern = !empty($item['pattern']) && is_array($item['pattern']) ? $item['pattern'] : [];
            if (!empty($item['pattern']) && is_array($item['pattern'])) {
                $item = array_merge($item, $item['pattern']);
            }
            $id = sanitize_text_field($nested_pattern['id'] ?? $item['pattern_id'] ?? $item['patternId'] ?? $nested_pattern['pattern_id'] ?? $nested_pattern['patternId'] ?? $item['id'] ?? '');
            $name = sanitize_text_field($item['name'] ?? $item['title'] ?? 'Untitled Ravelry pattern');
            $designer = '';
            if (!empty($item['designer']) && is_array($item['designer'])) {
                $designer = sanitize_text_field($item['designer']['name'] ?? $item['designer']['username'] ?? '');
            } elseif (!empty($item['designer_name'])) {
                $designer = sanitize_text_field($item['designer_name']);
            }
            $photo = '';
            foreach (['first_photo', 'photo', 'thumbnail', 'thumbnail_url', 'thumbnailUrl', 'photos'] as $key) {
                if (!empty($item[$key]) && is_array($item[$key])) {
                    $photoSource = $this->is_list_array($item[$key]) ? ($item[$key][0] ?? []) : $item[$key];
                    $photo = is_array($photoSource) ? esc_url_raw($photoSource['small_url'] ?? $photoSource['medium_url'] ?? $photoSource['medium2_url'] ?? $photoSource['large_url'] ?? $photoSource['thumbnail_url'] ?? $photoSource['url'] ?? '') : '';
                    if ($photo) break;
                } elseif (!empty($item[$key]) && is_string($item[$key])) {
                    $photo = esc_url_raw($item[$key]);
                    break;
                }
            }
            $permalink = $this->canonical_ravelry_pattern_url($item['permalink'] ?? $item['url'] ?? '', $id);
            $craft = '';
            if (!empty($item['craft']) && is_array($item['craft'])) {
                $craft = sanitize_text_field($item['craft']['name'] ?? '');
            } elseif (!empty($item['craft']) && is_string($item['craft'])) {
                $craft = sanitize_text_field($item['craft']);
            } elseif (!empty($item['craft_name'])) {
                $craft = sanitize_text_field($item['craft_name']);
            } elseif (!empty($item['craftType'])) {
                $craft = sanitize_text_field($item['craftType']);
            }
            $pdf = '';
            foreach (['pdf_url', 'pdfUrl', 'download_url', 'downloadUrl', 'download_location', 'free_pattern_url', 'freePatternUrl', 'pattern_download_url'] as $key) {
                if (!empty($item[$key]) && is_string($item[$key])) {
                    $pdf = esc_url_raw($item[$key]);
                    break;
                }
            }
            if (!$pdf) {
                $pdf = $this->first_pdf_url_in_value($item);
            }
	            if (!$pdf && !empty($item['pattern_sources']) && is_array($item['pattern_sources'])) {
                foreach ($item['pattern_sources'] as $source) {
                    if (!is_array($source)) continue;
                    $candidate = $source['url'] ?? $source['download_url'] ?? $source['pdf_url'] ?? '';
                    if ($candidate) { $pdf = esc_url_raw($candidate); break; }
                }
	            }
	            $notes = wp_strip_all_tags((string) ($item['notes'] ?? $item['description'] ?? $item['comments'] ?? ''));
	            $yardage = sanitize_text_field($item['yardage_description'] ?? $item['yardage'] ?? '');
	            $gauge = sanitize_text_field($item['gauge_description'] ?? $item['gauge'] ?? '');
	            $sizes = sanitize_text_field($item['sizes_available'] ?? '');
            $availability = $this->pattern_availability_label(array_merge($item, ['pdf_url' => $pdf]), '');
            return [
                'id' => $id,
                'library_pattern_id' => $library_pattern_id,
                'title' => $name,
                'designer' => $designer,
                'craft_type' => strtolower($craft),
                'thumbnail_url' => $photo,
                'url' => $permalink,
                'pdf_url' => $pdf,
	                'availability' => $availability,
	                'is_free' => $availability === 'free',
	                'price' => sanitize_text_field($item['price'] ?? $item['pattern_price'] ?? ''),
	                'currency' => sanitize_text_field($item['currency'] ?? ''),
	                'price_description' => sanitize_text_field($item['price_description'] ?? ''),
	                'notes' => $notes,
                'yardage' => $yardage,
                'gauge' => $gauge,
                'sizes' => $sizes,
                'raw' => $item,
            ];
        }

        private function pagination_from_body($body, $page, $page_size, $count) {
            $p = is_array($body['paginator'] ?? null) ? $body['paginator'] : [];
            $total = intval($p['result_count'] ?? $p['results'] ?? $p['total_count'] ?? $body['total_count'] ?? 0);
            $page_count = intval($p['page_count'] ?? $p['last_page'] ?? ($total && $page_size ? ceil($total / $page_size) : 0));
            return [
                'page' => intval($p['page'] ?? $page),
                'page_size' => intval($p['page_size'] ?? $page_size),
                'page_count' => $page_count,
                'total_count' => $total,
                'returned_count' => $count,
                'has_next' => $page_count ? $page < $page_count : ($count >= $page_size),
                'has_prev' => $page > 1,
            ];
        }

	        private function popup_response($success, $message, array $extra = []) {
            $payload = array_merge([
                'source' => 'stitchsense-ravelry-oauth',
                'success' => (bool) $success,
                'message' => (string) $message,
            ], $extra);
            $json = wp_json_encode($payload);
            nocache_headers();
            header('Content-Type: text/html; charset=utf-8');
            echo '<!doctype html><html><head><meta charset="utf-8"><title>Ravelry Connection</title></head><body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;">';
            echo '<p>' . esc_html($message) . '</p>';
            echo '<script>(function(){var payload=' . $json . ';try{if(window.opener&&!window.opener.closed){window.opener.postMessage(payload, window.location.origin);window.close();}}catch(e){};})();</script>';
            echo '</body></html>';
	            exit;
	        }

	        private function parse_token_response($response) {
	            $raw = (string) wp_remote_retrieve_body($response);
	            $body = json_decode($raw, true);
	            if (is_array($body)) return $body;

	            parse_str($raw, $parsed);
	            return is_array($parsed) ? $parsed : [];
	        }

	        private function token_request(array $settings, array $token_body, $use_basic_auth = true) {
	            $args = [
	                'timeout' => 30,
	                'headers' => [
	                    'Accept' => 'application/json',
	                ],
	                'body' => $token_body,
	            ];

	            if ($use_basic_auth) {
	                $args['headers']['Authorization'] = 'Basic ' . base64_encode($settings['client_id'] . ':' . $settings['client_secret']);
	            } else {
	                $args['body']['client_id'] = $settings['client_id'];
	                $args['body']['client_secret'] = $settings['client_secret'];
	            }

	            return wp_remote_post($settings['token_url'], apply_filters('stitchsense_ravelry_token_request_args', $args, $settings, $use_basic_auth));
	        }

	        private function user_from_profile_response($profile) {
	            if (!is_array($profile)) return [];
	            $user = $profile['user'] ?? $profile['current_user'] ?? $profile;
	            return is_array($user) ? $user : [];
	        }

	        private function profile_path_candidates($configured_path) {
	            $paths = array_filter(array_map('trim', [
	                $configured_path,
	                '/current_user.json',
	                '/users/current.json',
	                '/people/current.json',
	                '/me.json',
	            ]));
	            return array_values(array_unique($paths));
	        }

	        private function fetch_connected_username($uid, array $settings) {
	            foreach ($this->profile_path_candidates($settings['profile_path'] ?? '') as $path) {
	                $profile = $this->api_get($uid, $path);
	                if (is_wp_error($profile)) continue;
	                $user = $this->user_from_profile_response($profile);
	                $username = sanitize_text_field($user['username'] ?? $user['name'] ?? $user['login'] ?? '');
	                if ($username) return $username;
	            }
	            return '';
	        }

        public function status(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);

	            $settings = self::settings();
	            $connection = get_user_meta($uid, 'stitchsense_ravelry_connection', true);
	            $connected = is_array($connection) && !empty($connection['connected']);
	            $oauth_configured = !empty($settings['client_id']) && !empty($settings['client_secret']) && !empty($settings['authorize_url']) && !empty($settings['token_url']) && !empty($settings['api_base_url']);
	            $basic_configured = ((!empty($settings['basic_username']) && !empty($settings['basic_password'])) || (!empty($settings['client_id']) && !empty($settings['client_secret']))) && !empty($settings['api_base_url']);
	            $search_configured = $basic_configured && !empty($settings['search_path']);
	            $api_ok = $connected;
	            $api_error = '';
	            $api_warning = '';
	            if ($connected && !empty($settings['api_base_url']) && !empty($settings['profile_path']) && empty($connection['username'])) {
	                $username = $this->fetch_connected_username($uid, $settings);
	                if ($username) {
	                    $connection['username'] = $username;
	                    $connection['username_saved_at'] = gmdate('c');
	                    update_user_meta($uid, 'stitchsense_ravelry_connection', $connection);
	                } else {
	                    $api_warning = 'Ravelry connected, but StitchSense could not read the username from Ravelry yet. Saved-pattern import may need the profile API path checked.';
	                }
	            }

	            return new WP_REST_Response([
	                'success' => true,
	                'configured' => $oauth_configured || $search_configured,
	                'oauth_configured' => $oauth_configured,
	                'basic_configured' => $basic_configured,
	                'search_configured' => $search_configured,
	                'connected' => $connected,
                'username' => $connected ? sanitize_text_field($connection['username'] ?? '') : '',
                'token_expires' => $connected ? sanitize_text_field($connection['token_expires'] ?? '') : '',
                'api_ok' => $api_ok,
                'api_error' => $api_error,
                'api_warning' => $api_warning,
                'callback_url' => self::callback_url(),
            ]);
        }

        public function diagnostics(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);

            $settings = self::settings();
            $connection = $this->connection_for_user($uid);
            $username = sanitize_text_field($connection['username'] ?? $request->get_param('username') ?? '');
            $tests = [];
            $tests[] = $this->api_probe($uid, 'OAuth profile', $settings['profile_path'], [], 'oauth');
            $tests[] = $this->api_probe($uid, 'OAuth search', $settings['search_path'], ['query' => 'hat', 'page_size' => 1, 'page' => 1], 'oauth');
            $tests[] = $this->api_probe($uid, 'App/basic search', $settings['search_path'], ['query' => 'hat', 'page_size' => 1, 'page' => 1], 'basic');
            if ($username) {
                $saved_path = $this->replace_path_tokens($settings['saved_path'], ['username' => $username]);
                $tests[] = $this->api_probe($uid, 'OAuth saved library', $saved_path, ['page_size' => 1, 'page' => 1], 'oauth');
            }

            $recommendations = [];
            foreach ($tests as $test) {
                if ((int) ($test['status'] ?? 0) === 403) {
                    $recommendations[] = $test['label'] . ' returned 403. Check that the Ravelry developer app is authorised for this API endpoint/scope and that the app credentials match the OAuth connection.';
                }
                if ((int) ($test['status'] ?? 0) === 401) {
                    $recommendations[] = $test['label'] . ' returned 401. Reconnect Ravelry and confirm the callback URL and token URL are from the same Ravelry app.';
                }
            }
            $profile = $tests[0] ?? [];
            $search = $tests[1] ?? [];
            if (!empty($profile['status']) && (int) $profile['status'] >= 400 && !empty($search['ok'])) {
                $recommendations[] = 'The profile endpoint is failing but search works. Saved-library import can still work if you save the Ravelry username manually.';
            }
            if (!$username) {
                $recommendations[] = 'No Ravelry username is stored. Enter your Ravelry username in My Library and click Save Username before using Import my Patterns.';
            }

            return new WP_REST_Response([
                'success' => true,
                'configured' => !empty($settings['client_id']) && !empty($settings['client_secret']) && !empty($settings['authorize_url']) && !empty($settings['token_url']) && !empty($settings['api_base_url']),
                'connected' => (bool) $connection,
                'username' => $username,
                'token_present' => !empty($connection['access_token']),
                'token_type' => sanitize_text_field($connection['token_type'] ?? ''),
                'basic_configured' => !empty($settings['basic_username']) && !empty($settings['basic_password']),
                'basic_fallback_to_oauth_credentials' => empty($settings['basic_username']) || empty($settings['basic_password']),
                'api_base_host' => $settings['api_base_url'] ? parse_url($settings['api_base_url'], PHP_URL_HOST) : '',
                'callback_url' => self::callback_url(),
                'tests' => $tests,
                'recommendations' => array_values(array_unique($recommendations)),
            ]);
        }

        public function connect_url(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);

            $settings = self::settings();
            if (empty($settings['client_id']) || empty($settings['authorize_url'])) {
                return new WP_REST_Response([
                    'success' => false,
                    'error' => 'Ravelry OAuth is not configured yet. Add the official Ravelry OAuth URLs and client credentials in WordPress admin.',
                    'callback_url' => self::callback_url(),
                ], 503);
            }

            $state = wp_generate_password(32, false, false);
            update_user_meta($uid, 'stitchsense_ravelry_oauth_state', [
                'state' => $state,
                'created_at' => time(),
            ]);
            set_transient('stitchsense_ravelry_oauth_' . $state, [
                'uid' => $uid,
                'created_at' => time(),
            ], 15 * MINUTE_IN_SECONDS);

            $url = add_query_arg([
                'response_type' => 'code',
                'client_id' => $settings['client_id'],
                'redirect_uri' => self::callback_url(),
                'state' => $state,
            ], $settings['authorize_url']);

            return new WP_REST_Response([
                'success' => true,
                'url' => esc_url_raw($url),
                'callback_url' => self::callback_url(),
            ]);
        }

        public function save_username(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);

            $username = sanitize_text_field($request->get_param('username') ?? '');
            $username = preg_replace('/[^A-Za-z0-9_.-]/', '', $username);
            if (!$username) {
                return new WP_REST_Response(['success' => false, 'error' => 'Enter your Ravelry username.'], 400);
            }

            $connection = get_user_meta($uid, 'stitchsense_ravelry_connection', true);
            if (!is_array($connection) || empty($connection['connected'])) {
                return new WP_REST_Response(['success' => false, 'error' => 'Connect Ravelry before saving a username.'], 401);
            }

            $connection['username'] = $username;
            $connection['username_saved_at'] = gmdate('c');
            update_user_meta($uid, 'stitchsense_ravelry_connection', $connection);

            return new WP_REST_Response([
                'success' => true,
                'username' => $username,
            ]);
        }

        public function callback(WP_REST_Request $request) {
            $code = sanitize_text_field($request->get_param('code') ?? '');
            $state = sanitize_text_field($request->get_param('state') ?? '');
            $oauth_error = sanitize_text_field($request->get_param('error') ?? '');
            $oauth_error_description = sanitize_textarea_field($request->get_param('error_description') ?? '');
            if ($oauth_error) {
                $this->popup_response(false, 'Ravelry authorization failed: ' . ($oauth_error_description ?: $oauth_error));
            }

            $uid = get_current_user_id();
            $state_record = $state ? get_transient('stitchsense_ravelry_oauth_' . $state) : null;
            if (!$uid && is_array($state_record) && !empty($state_record['uid'])) {
                $uid = (int) $state_record['uid'];
            }
            if (!$uid) {
                $this->popup_response(false, 'StitchSense could not match this Ravelry approval to your account. Please return to StitchSense and try connecting again.');
            }

            $stored = get_user_meta($uid, 'stitchsense_ravelry_oauth_state', true);
            if (!$code || !$state || !is_array($stored) || empty($stored['state']) || !hash_equals((string) $stored['state'], $state)) {
                $this->popup_response(false, 'Ravelry OAuth state check failed. Please try connecting again.');
            }

            $settings = self::settings();
            if (empty($settings['client_id']) || empty($settings['client_secret']) || empty($settings['token_url'])) {
                $this->popup_response(false, 'Ravelry token exchange is not configured yet.');
            }

            $token_body = [
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => self::callback_url(),
            ];

	            $response = $this->token_request($settings, $token_body, true);

	            if (!is_wp_error($response)) {
	                $first_status = intval(wp_remote_retrieve_response_code($response));
	                $first_body = $this->parse_token_response($response);
	                if ($first_status < 200 || $first_status >= 300 || !is_array($first_body) || empty($first_body['access_token'])) {
	                    $response = $this->token_request($settings, $token_body, false);
	                }
	            }

            if (is_wp_error($response)) {
                $this->popup_response(false, 'Could not reach Ravelry token endpoint: ' . $response->get_error_message());
            }

	            $status = intval(wp_remote_retrieve_response_code($response));
	            $raw_body = wp_remote_retrieve_body($response);
	            $body = $this->parse_token_response($response);
	            if ($status < 200 || $status >= 300 || !is_array($body) || empty($body['access_token'])) {
                $detail = '';
                if (is_array($body)) {
                    $detail = sanitize_text_field($body['error_description'] ?? $body['error'] ?? $body['message'] ?? '');
                }
                if (!$detail) {
                    $detail = substr(trim(wp_strip_all_tags((string) $raw_body)), 0, 220);
                }
                $this->popup_response(false, 'Ravelry token exchange failed' . ($status ? ' (HTTP ' . $status . ')' : '') . ($detail ? ': ' . $detail : '. Confirm the official OAuth settings and callback URL.'));
            }

	            delete_user_meta($uid, 'stitchsense_ravelry_oauth_state');
	            delete_transient('stitchsense_ravelry_oauth_' . $state);
	            $token_type = sanitize_text_field($body['token_type'] ?? 'Bearer');
	            $connection = [
	                'connected' => true,
	                'access_token' => sanitize_text_field($body['access_token']),
	                'refresh_token' => sanitize_text_field($body['refresh_token'] ?? ''),
	                'token_type' => $token_type ?: 'Bearer',
	                'token_expires' => !empty($body['expires_in']) ? gmdate('c', time() + intval($body['expires_in'])) : '',
	                'username' => sanitize_text_field($body['username'] ?? ''),
	                'connected_at' => gmdate('c'),
	            ];
	            update_user_meta($uid, 'stitchsense_ravelry_connection', $connection);

	            if (empty($connection['username']) && !empty($settings['profile_path'])) {
	                $username = $this->fetch_connected_username($uid, $settings);
	                if ($username) {
	                    $connection['username'] = $username;
	                    $connection['username_saved_at'] = gmdate('c');
	                    update_user_meta($uid, 'stitchsense_ravelry_connection', $connection);
	                }
	            }

	            $this->popup_response(true, 'Ravelry connected. You can close this tab and return to StitchSense.');
	        }

        public function disconnect(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);

            delete_user_meta($uid, 'stitchsense_ravelry_connection');
            delete_user_meta($uid, 'stitchsense_ravelry_oauth_state');
            return new WP_REST_Response(['success' => true]);
        }

        public function sync(WP_REST_Request $request) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Ravelry sync is not enabled yet. Search/import is available first so the API configuration can be verified safely.',
            ], 501);
        }

        public function search(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);
            $settings = self::settings();
            $query = sanitize_text_field($request->get_param('q') ?? $request->get_param('query') ?? '');
            if (!$query) {
                return new WP_REST_Response(['success' => false, 'error' => 'Enter a Ravelry search term.'], 400);
            }
	            $page_size = min(48, max(1, intval($request->get_param('page_size') ?? 12)));
	            $page = max(1, intval($request->get_param('page') ?? 1));
	            $requested_availability = sanitize_text_field($request->get_param('availability') ?? '');
	            $params = [
	                'query' => $query,
	                'page_size' => $page_size,
	                'page' => $page,
	            ];
	            foreach (['craft', 'sort', 'pc', 'fit', 'weight'] as $filter_key) {
	                $value = sanitize_text_field($request->get_param($filter_key) ?? '');
	                if ($value !== '') $params[$filter_key] = $value;
	            }
	            if ($requested_availability === 'free') {
	                $params['availability'] = 'free';
	            }
            $body = $this->api_get_public($uid, $settings['search_path'], $params);
            if (is_wp_error($body)) {
                return new WP_REST_Response(['success' => false, 'error' => $body->get_error_message()], $body->get_error_data()['status'] ?? 502);
	            }
	            $items = $this->extract_pattern_items($body);
	            $patterns = array_values(array_filter(array_map([$this, 'normalise_pattern_result'], $items)));
	            if (in_array($requested_availability, ['free', 'paid'], true)) {
	                $patterns = array_values(array_filter($patterns, function($pattern) use ($requested_availability) {
	                    return is_array($pattern) && ($pattern['availability'] ?? '') === $requested_availability;
	                }));
	            }
	            return new WP_REST_Response([
                'success' => true,
                'query' => $query,
                'patterns' => $patterns,
                'pagination' => $this->pagination_from_body($body, $page, $page_size, count($patterns)),
                'raw_keys' => array_keys($body),
            ]);
        }

        public function pattern(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);
            $settings = self::settings();
            $id = sanitize_text_field($request->get_param('id') ?? '');
            if (!$id) return new WP_REST_Response(['success' => false, 'error' => 'Missing Ravelry pattern id.'], 400);
            $path = $this->replace_path_tokens($settings['detail_path'], ['id' => $id]);
            $body = $this->api_get_public($uid, $path);
            if (is_wp_error($body)) {
                return new WP_REST_Response(['success' => false, 'error' => $body->get_error_message()], $body->get_error_data()['status'] ?? 502);
            }
            $pattern = $this->normalise_pattern_result($this->extract_pattern_item($body));
            $download = $this->discover_pattern_pdf_url($uid, $id, $body);
            if ($download['url']) {
                $pattern['pdf_url'] = $download['url'];
                $pattern['pdf_source'] = $download['source'];
            }
            return new WP_REST_Response(['success' => true, 'pattern' => $pattern, 'raw_keys' => array_keys($body)]);
        }

        public function saved(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);
            $settings = self::settings();
            $connection = $this->connection_for_user($uid);
            $username = sanitize_text_field($connection['username'] ?? $request->get_param('username') ?? '');
	            if (!$username) {
	                $username = $this->fetch_connected_username($uid, $settings);
	                if ($username) {
	                    $connection['username'] = $username;
	                    $connection['username_saved_at'] = gmdate('c');
	                    update_user_meta($uid, 'stitchsense_ravelry_connection', $connection);
	                }
	            }
	            if (!$username) return new WP_REST_Response(['success' => false, 'error' => 'Ravelry is connected, but StitchSense could not read your Ravelry username automatically. Check the Ravelry Profile/API test path in WordPress admin.'], 400);
            $page_size = min(48, max(1, intval($request->get_param('page_size') ?? 12)));
            $page = max(1, intval($request->get_param('page') ?? 1));
            $path = $this->replace_path_tokens($settings['saved_path'], ['username' => $username]);
            $body = $this->api_get($uid, $path, ['page' => $page, 'page_size' => $page_size]);
            if (is_wp_error($body)) {
                return new WP_REST_Response(['success' => false, 'error' => $body->get_error_message()], $body->get_error_data()['status'] ?? 502);
            }
            $items = $this->extract_pattern_items($body);
            $patterns = array_values(array_filter(array_map([$this, 'normalise_pattern_result'], $items)));
            return new WP_REST_Response([
                'success' => true,
                'username' => $username,
                'patterns' => $patterns,
                'pagination' => $this->pagination_from_body($body, $page, $page_size, count($patterns)),
                'raw_keys' => array_keys($body),
            ]);
        }

        public function import(WP_REST_Request $request) {
            $uid = get_current_user_id();
            if (!$uid) return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);

            $body = $request->get_json_params();
            $body = is_array($body) ? $body : [];
            $incoming = is_array($body['pattern'] ?? null) ? $body['pattern'] : $body;
            $normalised_incoming = $this->normalise_pattern_result($incoming);
            if (is_array($normalised_incoming)) {
                $incoming = $this->merge_non_empty_pattern_fields($incoming, $normalised_incoming);
            }
            $id = sanitize_text_field($body['id'] ?? $incoming['id'] ?? $incoming['pattern_id'] ?? '');
            $library_pattern_id = sanitize_text_field($body['library_pattern_id'] ?? $body['existing_pattern_id'] ?? '');
            if (!$id && empty($incoming['title']) && empty($incoming['name'])) {
                return new WP_REST_Response(['success' => false, 'error' => 'Missing Ravelry pattern details.'], 400);
            }

            $settings = self::settings();
            $detail = $incoming;
            $detail_body = [];
            if ($id) {
                $path = $this->replace_path_tokens($settings['detail_path'], ['id' => $id]);
                $api_body = $this->api_get_public($uid, $path);
                if (!is_wp_error($api_body)) {
                    $detail_body = $api_body;
                    $api_pattern = $this->normalise_pattern_result($this->extract_pattern_item($api_body));
                    if (is_array($api_pattern)) {
                        $detail = $this->merge_non_empty_pattern_fields($incoming, $api_pattern);
                    }
                }
            }

            $download = $this->discover_pattern_pdf_url($uid, $id, $detail_body ?: $detail);
            if (!empty($download['url'])) {
                $detail['pdf_url'] = $download['url'];
                $detail['pdf_source'] = $download['source'];
            }

            $stored = null;
            $download_error = '';
            if (!empty($detail['pdf_url'])) {
                $stored_pdf = $this->download_ravelry_pdf($uid, $detail['pdf_url'], $detail['title'] ?? $detail['name'] ?? 'Ravelry pattern', $id);
                if (is_wp_error($stored_pdf)) {
                    $download_error = $stored_pdf->get_error_message();
                } else {
                    $stored = $stored_pdf;
                }
            }

            $analysis = ['text' => '', 'html' => '', 'structured' => new stdClass()];
            $analysis_error = '';
            if ($stored && !empty($stored['path'])) {
                $workflow_payload = [
                    'file_name' => $stored['filename'],
                    'mime_type' => 'application/pdf',
                    'file_size' => intval($stored['file_size'] ?? 0),
                    'project_name' => sanitize_text_field($detail['title'] ?? $detail['name'] ?? 'Ravelry pattern'),
                    'craft_type' => sanitize_text_field($detail['craft_type'] ?? ''),
                    'project_type' => 'ravelry_pattern',
                    'upload_nonce' => 'ravelry_' . ($id ?: wp_generate_uuid4()),
                    'upload_transport' => 'ravelry_wordpress_file',
                    'file_url' => esc_url_raw($stored['url']),
                    'source_url' => esc_url_raw($stored['url']),
                    'wp_upload_file_url' => esc_url_raw($stored['url']),
                    'wp_upload_relative_path' => sanitize_text_field($stored['relative_path']),
                    'file_extension' => 'pdf',
                    'ravelry_id' => $id,
                    'ravelry_url' => esc_url_raw($detail['url'] ?? ''),
                    'response_language' => 'english',
                    'target_language' => 'english',
                    'translation_target_language' => 'english',
                    'locale' => 'en-GB',
                    'system_instruction' => 'Return all StitchSense summaries in English only. If the original pattern is written in another language, translate the relevant details into clear English before summarising.',
                ];
                $workflow = StitchSense_Workflow_Client::post_upload_multipart('upload', $workflow_payload, $stored['path'], 300);
                if (!empty($workflow['success']) && !empty($workflow['payload']) && is_array($workflow['payload'])) {
                    $analysis = $this->workflow_summary_from_payload($workflow['payload']);
                    $detail = array_merge($detail, [
                        'project_id' => sanitize_text_field($workflow['payload']['project_id'] ?? ''),
                        'file_id' => sanitize_text_field($workflow['payload']['file_id'] ?? ''),
                        'job_id' => sanitize_text_field($workflow['payload']['job_id'] ?? ''),
                        'detected_title' => sanitize_text_field($workflow['payload']['detected_title'] ?? ''),
                        'detected_design_code' => sanitize_text_field($workflow['payload']['detected_design_code'] ?? ''),
                    ]);
                } else {
                    $analysis_error = sanitize_text_field($workflow['payload']['error'] ?? 'The upload analysis workflow could not summarise the Ravelry PDF.');
                }
            }

            $availability_label = $this->pattern_availability_label($detail, $stored['url'] ?? '');
            $fallback_text = $this->ravelry_metadata_summary($detail, $stored['url'] ?? '');
            if (!$stored && $availability_label === 'paid') {
                $fallback_text = 'This Ravelry pattern was imported without the original PDF. Please purchase the pattern and re-import it before asking StitchSense questions or starting a rewrite.';
            }
            $summary_text = $analysis['text'] ?: $fallback_text;
            $summary_html = $analysis['html'] ?: $this->summary_html_from_text($summary_text);
            $title = sanitize_text_field(!empty($detail['detected_title']) ? $detail['detected_title'] : (!empty($detail['title']) ? $detail['title'] : ($detail['name'] ?? 'Untitled Ravelry pattern')));
            if (!$title) $title = 'Untitled Ravelry pattern';
            $metadata = [
                'external_service' => 'ravelry',
                'ravelry_id' => $id,
                'ravelry_library_pattern_id' => sanitize_text_field($detail['library_pattern_id'] ?? ''),
                'designer' => sanitize_text_field($detail['designer'] ?? ''),
                'thumbnail_url' => esc_url_raw($detail['thumbnail_url'] ?? ''),
                'ravelry_url' => esc_url_raw($detail['url'] ?? ''),
                'pdf_url' => esc_url_raw($detail['pdf_url'] ?? ''),
                'pdf_source' => sanitize_text_field($detail['pdf_source'] ?? ''),
                'stored_pdf_url' => esc_url_raw($stored['url'] ?? ''),
                'stored_pdf_relative_path' => sanitize_text_field($stored['relative_path'] ?? ''),
                'ravelry_availability' => $availability_label,
                'ravelry_is_free' => $availability_label === 'free',
                'file_extension' => $stored ? 'pdf' : '',
                'gauge' => sanitize_text_field($detail['gauge'] ?? ''),
                'sizes' => sanitize_text_field($detail['sizes'] ?? ''),
                'yardage' => sanitize_text_field($detail['yardage'] ?? ''),
                'download_error' => $download_error,
                'analysis_error' => $analysis_error,
                'imported_at' => gmdate('c'),
            ];
            $library_payload = [
                'id' => $library_pattern_id,
                'title' => $title,
                'craft_type' => sanitize_text_field($detail['craft_type'] ?? ''),
                'original_filename' => sanitize_text_field($stored['filename'] ?? (($title ?: 'Ravelry pattern') . ($stored ? '.pdf' : ''))),
	                'file_url' => esc_url_raw($stored['url'] ?? ''),
                'file_extension' => $stored ? 'pdf' : '',
                'file_mime_type' => $stored ? 'application/pdf' : '',
                'project_id' => sanitize_text_field($detail['project_id'] ?? ''),
                'file_id' => sanitize_text_field($detail['file_id'] ?? ''),
                'job_id' => sanitize_text_field($detail['job_id'] ?? ''),
                'detected_design_code' => sanitize_text_field($detail['detected_design_code'] ?? ''),
                'pattern_summary_text' => $summary_text,
                'pattern_summary_html' => $summary_html,
                'pattern_summary_structured' => $analysis['structured'],
                'source' => 'ravelry',
                'metadata' => $metadata,
            ];
            $saved = $this->save_library_pattern($library_payload);
            if (is_wp_error($saved)) {
                $saved_data = [
                    'success' => false,
                    'error' => $saved->get_error_message(),
                    'details' => $saved->get_error_data(),
                ];
                $status = (int) ($saved->get_error_data()['status'] ?? 500);
            } elseif ($saved instanceof WP_REST_Response) {
                $saved_data = $saved->get_data();
                $status = $saved->get_status();
            } else {
                $saved_data = [
                    'success' => false,
                    'error' => 'Library save failed.',
                    'details' => [
                        'response_type' => is_object($saved) ? get_class($saved) : gettype($saved),
                        'wp_user_id' => get_current_user_id(),
                    ],
                ];
                $status = 500;
            }
            if (empty($saved_data['success'])) {
                return new WP_REST_Response($saved_data, $status ?: 500);
            }

            return new WP_REST_Response([
                'success' => true,
                'pattern' => $saved_data['pattern'] ?? null,
                'id' => $saved_data['id'] ?? '',
                'pdf_saved' => (bool) $stored,
                'pdf_url' => esc_url_raw($stored['url'] ?? ''),
                'analysis_succeeded' => $analysis['text'] !== '' || $analysis['html'] !== '',
                'download_error' => $download_error,
                'analysis_error' => $analysis_error,
            ]);
        }
    }
}
