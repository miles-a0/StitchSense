<?php
/**
 * Server-side client for StitchSense AI workflows.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('StitchSense_Workflow_Client')) {
    final class StitchSense_Workflow_Client {
        const DEFAULT_CHAT_ENDPOINT = 'https://n8n.zu-auto.co.uk/webhook/pattern-helper-chat';
        const DEFAULT_UPLOAD_ENDPOINT = 'https://n8n.zu-auto.co.uk/webhook/stitchsense-upload-v5';
        const DEFAULT_IMAGE_ENDPOINT = 'https://n8n.zu-auto.co.uk/webhook/stitchsense-image-analysis';
        const DEFAULT_SECRET = '';

        public static function endpoint($type) {
            $map = [
                'chat' => ['STITCHSENSE_CHAT_ENDPOINT', 'stitchsense_workflow_chat_endpoint', self::DEFAULT_CHAT_ENDPOINT],
                'upload' => ['STITCHSENSE_UPLOAD_ENDPOINT', 'stitchsense_workflow_upload_endpoint', self::DEFAULT_UPLOAD_ENDPOINT],
                'image' => ['STITCHSENSE_IMAGE_ENDPOINT', 'stitchsense_workflow_image_endpoint', self::DEFAULT_IMAGE_ENDPOINT],
            ];
            if (empty($map[$type])) return '';
            [$constant, $option, $default] = $map[$type];
            if (defined($constant) && constant($constant)) return esc_url_raw(constant($constant));
            $configured = get_option($option, '');
            return esc_url_raw($configured ?: $default);
        }

        public static function secret() {
            if (defined('STITCHSENSE_WORKFLOW_SECRET') && STITCHSENSE_WORKFLOW_SECRET) {
                return (string) STITCHSENSE_WORKFLOW_SECRET;
            }
            $configured = get_option('stitchsense_workflow_secret', '');
            return (string) ($configured ?: self::DEFAULT_SECRET);
        }

        public static function settings_status() {
            return [
                'chat_endpoint' => self::endpoint('chat'),
                'upload_endpoint' => self::endpoint('upload'),
                'image_endpoint' => self::endpoint('image'),
                'has_secret' => self::secret() !== '',
            ];
        }

        public static function diagnostics() {
            $secret = self::secret();
            $endpoints = [
                'chat' => self::endpoint('chat'),
                'upload' => self::endpoint('upload'),
                'image' => self::endpoint('image'),
            ];
            $safe_endpoints = [];
            foreach ($endpoints as $key => $url) {
                $safe_endpoints[$key] = [
                    'configured' => (bool) $url,
                    'host' => $url ? parse_url($url, PHP_URL_HOST) : '',
                    'path' => $url ? parse_url($url, PHP_URL_PATH) : '',
                    'scheme' => $url ? parse_url($url, PHP_URL_SCHEME) : '',
                ];
            }
            return [
                'has_secret' => $secret !== '',
                'secret_length' => $secret !== '' ? strlen($secret) : 0,
                'secret_source' => (defined('STITCHSENSE_WORKFLOW_SECRET') && STITCHSENSE_WORKFLOW_SECRET) ? 'constant' : (get_option('stitchsense_workflow_secret', '') !== '' ? 'wordpress_option' : 'missing'),
                'endpoints' => $safe_endpoints,
                'curl_available' => function_exists('curl_init') && class_exists('CURLFile'),
            ];
        }

        public static function post_json($type, array $payload, $timeout = 300, array $extra_headers = []) {
            $endpoint = self::endpoint($type);
            if (!$endpoint) {
                return self::error('StitchSense workflow endpoint is not configured.', 500);
            }

            $secret = self::secret();
            if ($secret !== '') {
                $payload['secret'] = $secret;
            }

            $headers = array_merge([
                'Content-Type' => 'application/json; charset=UTF-8',
                'Accept' => 'application/json',
            ], $extra_headers);
            if ($secret !== '' && empty($headers['x-pattern-helper-secret'])) {
                $headers['x-pattern-helper-secret'] = $secret;
            }
            if ($secret !== '' && empty($headers['x-stitchsense-secret'])) {
                $headers['x-stitchsense-secret'] = $secret;
            }

            $response = self::dispatch_json_request($endpoint, $payload, $timeout, $headers);
            $normalised = self::normalise_response($response, 'StitchSense workflow');

            if (
                $type === 'image' &&
                self::should_fallback_image_to_chat($normalised, $endpoint)
            ) {
                $chat_endpoint = self::endpoint('chat');
                if ($chat_endpoint && $chat_endpoint !== $endpoint) {
                    $chat_response = self::dispatch_json_request($chat_endpoint, $payload, $timeout, $headers);
                    return self::normalise_response($chat_response, 'StitchSense workflow');
                }
            }

            return $normalised;
        }

        private static function dispatch_json_request($endpoint, array $payload, $timeout, array $headers) {
            return wp_remote_post($endpoint, [
                'timeout' => $timeout,
                'redirection' => 3,
                'headers' => $headers,
                'body' => wp_json_encode($payload),
            ]);
        }

        public static function post_form($type, array $payload, $timeout = 300) {
            $endpoint = self::endpoint($type);
            if (!$endpoint) {
                return self::error('StitchSense workflow endpoint is not configured.', 500);
            }

            $secret = self::secret();
            if ($secret !== '') {
                $payload['secret'] = $secret;
            }

            $response = wp_remote_post($endpoint, [
                'timeout' => $timeout,
                'redirection' => 3,
                'headers' => array_filter([
                    'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept' => 'application/json',
                    'x-pattern-helper-secret' => $secret ?: null,
                    'x-stitchsense-secret' => $secret ?: null,
                ]),
                'body' => [
                    'payload' => wp_json_encode($payload),
                    'secret' => $secret,
                ],
            ]);

            return self::normalise_response($response, 'StitchSense upload workflow');
        }

        public static function post_upload_multipart($type, array $payload, $file_path, $timeout = 300) {
            if (!function_exists('curl_init') || !class_exists('CURLFile')) {
                return self::error('Server cannot forward saved pattern files because PHP cURL file upload support is unavailable.', 501);
            }

            $endpoint = self::endpoint($type);
            if (!$endpoint) {
                return self::error('StitchSense workflow endpoint is not configured.', 500);
            }

            $secret = self::secret();
            if ($secret !== '') {
                $payload['secret'] = $secret;
            }

            $file_name = sanitize_file_name($payload['file_name'] ?? basename($file_path));
            $mime_type = sanitize_text_field($payload['mime_type'] ?? 'application/octet-stream');
            $file = new CURLFile($file_path, $mime_type ?: 'application/octet-stream', $file_name ?: basename($file_path));
            $fields = [
                'payload' => wp_json_encode($payload),
                'secret' => $secret,
                'file' => $file,
                'data' => new CURLFile($file_path, $mime_type ?: 'application/octet-stream', $file_name ?: basename($file_path)),
                'pattern_file' => new CURLFile($file_path, $mime_type ?: 'application/octet-stream', $file_name ?: basename($file_path)),
            ];

            $ch = curl_init($endpoint);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 20,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_HTTPHEADER => array_values(array_filter([
                    'Accept: application/json',
                    $secret !== '' ? 'x-pattern-helper-secret: ' . $secret : '',
                    $secret !== '' ? 'x-stitchsense-secret: ' . $secret : '',
                ])),
                CURLOPT_POSTFIELDS => $fields,
            ]);
            $raw = curl_exec($ch);
            $error = $raw === false ? curl_error($ch) : '';
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($raw === false || $raw === '') {
                return self::error('Could not reach the StitchSense upload workflow' . ($error ? ': ' . $error : '.'), 502);
            }

            return self::normalise_raw($code, $raw, 'StitchSense upload workflow');
        }

        private static function normalise_response($response, $label) {
            if (is_wp_error($response)) {
                return self::error('Could not reach the ' . $label . ': ' . $response->get_error_message(), 502);
            }
            $code = intval(wp_remote_retrieve_response_code($response));
            $raw = wp_remote_retrieve_body($response);
            return self::normalise_raw($code, $raw, $label);
        }

        private static function normalise_raw($code, $raw, $label) {
            $json = json_decode((string) $raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
                $json_success = isset($json['success']) ? (bool) $json['success'] : null;
                if (($code >= 400) || $json_success === false) {
                    return [
                        'success' => false,
                        'status' => ($code >= 100 ? $code : 502),
                        'payload' => $json,
                    ];
                }
                return ['success' => true, 'status' => ($code >= 100 ? $code : 200), 'payload' => $json];
            }

            $clean = trim(wp_strip_all_tags((string) $raw));
            if ($code >= 200 && $code < 300 && $clean !== '') {
                return ['success' => true, 'status' => 200, 'payload' => ['success' => true, 'answer' => $clean]];
            }

            return self::error($label . ' returned HTTP ' . ($code ?: 'unknown') . '. ' . substr($clean, 0, 500), $code ?: 502);
        }

        private static function should_fallback_image_to_chat($result, $endpoint) {
            if (!is_array($result) || !empty($result['success'])) {
                return false;
            }

            $status = intval($result['status'] ?? 0);
            $message = '';
            if (!empty($result['payload']) && is_array($result['payload'])) {
                $message = strtolower((string) (
                    $result['payload']['error'] ??
                    $result['payload']['message'] ??
                    ''
                ));
            }

            return
                $status === 404 ||
                strpos($message, 'not registered') !== false ||
                strpos($message, 'no route was found matching') !== false;
        }

        private static function error($message, $status) {
            return [
                'success' => false,
                'status' => $status,
                'payload' => [
                    'success' => false,
                    'error' => $message,
                ],
            ];
        }
    }
}
