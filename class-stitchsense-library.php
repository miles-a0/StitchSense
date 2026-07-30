<?php
/**
 * StitchSense Pattern Library
 * 
 * Server-side CRUD for user patterns, chat history, rewrite sessions,
 * user settings, and service connections.
 * 
 * Requires: PostgreSQL (stitchsense-postgres on port 2303)
 * Define STITCHSENSE_DB_HOST, STITCHSENSE_DB_NAME, STITCHSENSE_DB_USER,
 * STITCHSENSE_DB_PASS in wp-config.php to override defaults.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('StitchSense_Library')) {
    final class StitchSense_Library {
        private static $instance = null;
        private $pdo = null;

        public static function instance() {
            if (self::$instance === null) {
                self::$instance = new self();
            }
            return self::$instance;
        }

        private function __construct() {}

        /* --------------------------------------------------------
           Database Connection
           -------------------------------------------------------- */

        private function db() {
            if ($this->pdo !== null) return $this->pdo;
            try {
                $host = defined('STITCHSENSE_DB_HOST') ? STITCHSENSE_DB_HOST : '127.0.0.1';
                $port = defined('STITCHSENSE_DB_PORT') ? STITCHSENSE_DB_PORT : '2303';
                $name = defined('STITCHSENSE_DB_NAME') ? STITCHSENSE_DB_NAME : 'stitchsense';
                $user = defined('STITCHSENSE_DB_USER') ? STITCHSENSE_DB_USER : 'stitchsense';
                $pass = defined('STITCHSENSE_DB_PASS') ? STITCHSENSE_DB_PASS : '';
                $dsn = "pgsql:host={$host};port={$port};dbname={$name}";
                $this->pdo = new PDO($dsn, $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
            } catch (PDOException $e) {
                return null;
            }
            return $this->pdo;
        }

        /* --------------------------------------------------------
           Auth Helpers
           -------------------------------------------------------- */

        private function current_user_id() {
            $user = wp_get_current_user();
            return $user && $user->ID ? (int) $user->ID : 0;
        }

        private function require_user() {
            $uid = $this->current_user_id();
            if (!$uid) {
                return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);
            }
            return $uid;
        }

        private function require_admin() {
            if (!current_user_can('manage_options')) {
                return new WP_Error('forbidden', 'You do not have permission to access this resource.', ['status' => 403]);
            }
            return true;
        }

        private function json_response($data, $status = 200) {
            return new WP_REST_Response($data, $status);
        }

        public function save_pattern_for_user_id($uid, $body) {
            $uid = (int) $uid;
            if ($uid <= 0) {
                return new WP_Error('not_authenticated', 'You must be logged in.', ['status' => 401]);
            }

            $platform = $this->platform_save_pattern($uid, $body);
            $platform_pattern = null;
            if ($platform !== null) {
                if (is_wp_error($platform)) return $platform;
                if ($platform instanceof WP_REST_Response) {
                    $platform_data = $platform->get_data();
                    if (is_array($platform_data) && !empty($platform_data['pattern']) && is_array($platform_data['pattern'])) {
                        $platform_pattern = $this->platform_normalise_pattern($platform_data['pattern']);

                        $body['id'] = sanitize_text_field($platform_pattern['id'] ?? ($body['id'] ?? ''));
                        $body['title'] = $platform_pattern['title'] ?? ($body['title'] ?? '');
                        $body['craft_type'] = $platform_pattern['craft_type'] ?? ($body['craft_type'] ?? '');
                        $body['original_filename'] = $platform_pattern['original_filename'] ?? ($body['original_filename'] ?? '');
                        $body['file_url'] = $platform_pattern['file_url'] ?? ($body['file_url'] ?? '');
                        $body['pattern_summary_html'] = $platform_pattern['pattern_summary_html'] ?? ($body['pattern_summary_html'] ?? '');
                        $body['pattern_summary_text'] = $platform_pattern['pattern_summary_text'] ?? ($body['pattern_summary_text'] ?? '');
                        $body['pattern_summary_structured'] = $platform_pattern['pattern_summary_structured'] ?? ($body['pattern_summary_structured'] ?? new stdClass());

                        $metadata = is_array($body['metadata'] ?? null) ? $body['metadata'] : [];
                        $platform_metadata = is_array($platform_pattern['metadata'] ?? null) ? $platform_pattern['metadata'] : [];
                        $metadata = array_merge($metadata, $platform_metadata);
                        if (!empty($platform_pattern['id'])) {
                            $metadata['platform_pattern_id'] = (string) $platform_pattern['id'];
                        }
                        if (!empty($platform_pattern['file_key'])) {
                            $metadata['platform_file_key'] = (string) $platform_pattern['file_key'];
                        }
                        $body['metadata'] = $metadata;
                    }
                }
            }

            $db = $this->db();
            if (!$db) return $this->fallback_save_pattern($uid, $body);

            $project_id = sanitize_text_field($body['project_id'] ?? '');
            $existing = null;

            if (!empty($body['id'])) {
                $stmt = $db->prepare('SELECT id FROM user_patterns WHERE wp_user_id = ? AND id = ?');
                $stmt->execute([$uid, sanitize_text_field($body['id'])]);
                $existing = $stmt->fetchColumn();
            }

            if (!$existing && $project_id) {
                $stmt = $db->prepare('SELECT id FROM user_patterns WHERE wp_user_id = ? AND project_id = ?');
                $stmt->execute([$uid, $project_id]);
                $existing = $stmt->fetchColumn();
            }

            $data = $this->pattern_payload($body, $uid);

            if ($existing) {
                $sets = [];
                $vals = [];
                foreach ($data as $col => $val) {
                    if ($col === 'wp_user_id' || $col === 'created_at') continue;
                    $sets[] = "\"{$col}\" = ?";
                    $vals[] = $col === 'pattern_summary_structured' || $col === 'metadata' ? $val : $val;
                }
                $vals[] = $existing;
                $db->prepare("UPDATE user_patterns SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
                $response_pattern = $this->fetch_pattern_by_id($db, $existing, $uid);
                return $this->json_response([
                    'success' => true,
                    'id' => $existing,
                    'pattern' => $response_pattern,
                    'action' => 'updated',
                    'storage' => $platform_pattern ? 'wordpress+stitchsense-platform' : 'wordpress',
                ]);
            }

            $placeholders = implode(', ', array_fill(0, count($data), '?'));
            $columns = '"' . implode('", "', array_keys($data)) . '"';
            $stmt = $db->prepare("INSERT INTO user_patterns ({$columns}) VALUES ({$placeholders}) RETURNING id");
            $stmt->execute(array_values($data));
            $newId = $stmt->fetchColumn();

            $response_pattern = $this->fetch_pattern_by_id($db, $newId, $uid);
            return $this->json_response([
                'success' => true,
                'id' => $newId,
                'pattern' => $response_pattern,
                'action' => 'created',
                'storage' => $platform_pattern ? 'wordpress+stitchsense-platform' : 'wordpress',
            ]);
        }

        private function json_body(WP_REST_Request $request) {
            $body = $request->get_json_params();
            return is_array($body) ? $body : [];
        }

        private function allowed_pattern_extensions() {
            return ['pdf','docx','txt','rtf','odt','md','html','htm','epub','csv','xlsx','json','xml','jpg','jpeg','png','webp','gif','tif','tiff'];
        }

        private function decode_json_field($value, $fallback) {
            if (is_array($value) || is_object($value)) return $value;
            if (!is_string($value) || $value === '') return $fallback;
            $decoded = json_decode($value, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
        }

        private function normalise_pattern($pattern) {
            if (!$pattern || !is_array($pattern)) return $pattern;
            $pattern['pattern_summary_structured'] = $this->decode_json_field($pattern['pattern_summary_structured'] ?? null, new stdClass());
            $pattern['metadata'] = $this->decode_json_field($pattern['metadata'] ?? null, new stdClass());
            if (empty($pattern['file_extension'])) {
                $meta = is_array($pattern['metadata']) ? $pattern['metadata'] : [];
                $pattern['file_extension'] = sanitize_text_field($meta['file_extension'] ?? pathinfo($pattern['original_filename'] ?? '', PATHINFO_EXTENSION));
            }
            return $pattern;
        }

        private function get_owned_pattern($db, $uid, $id) {
            $stmt = $db->prepare('SELECT * FROM user_patterns WHERE id = ? AND wp_user_id = ?');
            $stmt->execute([$id, $uid]);
            return $this->normalise_pattern($stmt->fetch());
        }

        private function fetch_pattern_by_id($db, $id, $uid = null) {
            if ($uid === null) {
                $stmt = $db->prepare('SELECT * FROM user_patterns WHERE id = ?');
                $stmt->execute([$id]);
            } else {
                $stmt = $db->prepare('SELECT * FROM user_patterns WHERE id = ? AND wp_user_id = ?');
                $stmt->execute([$id, $uid]);
            }
            return $this->normalise_pattern($stmt->fetch());
        }

        private function pattern_payload($body, $uid) {
            $metadata = $body['metadata'] ?? new stdClass();
            if (is_array($metadata)) {
                foreach (['file_extension', 'file_mime_type', 'total_chunks', 'uploaded_at', 'library_pattern_id'] as $key) {
                    if (isset($body[$key]) && !isset($metadata[$key])) {
                        $metadata[$key] = $body[$key];
                    }
                }
            }

            return [
                'wp_user_id'        => $uid,
                'title'             => sanitize_text_field($body['title'] ?? $body['detected_title'] ?? $body['project_name'] ?? 'Untitled'),
                'craft_type'        => sanitize_text_field($body['craft_type'] ?? ''),
                'original_filename' => sanitize_text_field($body['original_filename'] ?? $body['filename'] ?? ''),
                'file_url'          => esc_url_raw($body['file_url'] ?? $body['drive_link'] ?? $body['pdf_url'] ?? $body['public_url'] ?? ''),
                'pattern_summary_html' => wp_kses_post($body['pattern_summary_html'] ?? ''),
                'pattern_summary_text' => sanitize_textarea_field($body['pattern_summary_text'] ?? ''),
                'pattern_summary_structured' => wp_json_encode($body['pattern_summary_structured'] ?? $body['structured_data'] ?? new stdClass()),
                'detected_design_code' => sanitize_text_field($body['detected_design_code'] ?? ''),
                'project_id'        => sanitize_text_field($body['project_id'] ?? ''),
                'file_id'           => sanitize_text_field($body['file_id'] ?? ''),
                'job_id'            => sanitize_text_field($body['job_id'] ?? ''),
                'metadata'          => wp_json_encode($metadata),
                'source'            => sanitize_text_field($body['source'] ?? 'upload'),
                'parent_pattern_id' => sanitize_text_field($body['parent_pattern_id'] ?? '') ?: null,
                'updated_at'        => date('Y-m-d H:i:s'),
            ];
        }

        private function platform_ready() {
            if (!class_exists('StitchSense_Platform_Client')) return false;
            $status = StitchSense_Platform_Client::settings_status();
            return !empty($status['ready']);
        }

        private function platform_pattern_payload($body, $uid) {
            $metadata = is_array($body['metadata'] ?? null) ? $body['metadata'] : [];
            foreach (['project_id', 'file_id', 'job_id', 'detected_design_code', 'file_extension', 'file_mime_type', 'total_chunks', 'uploaded_at', 'library_pattern_id'] as $key) {
                if (isset($body[$key]) && !isset($metadata[$key])) {
                    $metadata[$key] = $body[$key];
                }
            }
            $metadata['legacy_wp_user_id'] = $uid;
            $metadata['wordpress_site_url'] = home_url('/');

            $payload = [
                'title' => sanitize_text_field($body['title'] ?? $body['detected_title'] ?? $body['project_name'] ?? 'Untitled'),
                'craftType' => sanitize_text_field($body['craft_type'] ?? ''),
                'originalFilename' => sanitize_text_field($body['original_filename'] ?? $body['filename'] ?? ''),
                'patternSummaryHtml' => wp_kses_post($body['pattern_summary_html'] ?? ''),
                'patternSummaryText' => sanitize_textarea_field($body['pattern_summary_text'] ?? ''),
                'patternSummaryStructured' => $body['pattern_summary_structured'] ?? $body['structured_data'] ?? new stdClass(),
                'source' => sanitize_text_field($body['source'] ?? 'wordpress'),
                'metadata' => $metadata,
            ];
            $file_url = esc_url_raw($body['file_url'] ?? $body['drive_link'] ?? $body['pdf_url'] ?? $body['public_url'] ?? '');
            if ($file_url !== '') {
                $payload['fileUrl'] = $file_url;
            }
            return $payload;
        }

        private function platform_pattern_update_payload($body, $uid) {
            $payload = [];
            if (array_key_exists('title', $body)) {
                $payload['title'] = sanitize_text_field($body['title']);
            }
            if (array_key_exists('craft_type', $body) || array_key_exists('craftType', $body)) {
                $payload['craftType'] = sanitize_text_field($body['craft_type'] ?? $body['craftType']);
            }
            if (array_key_exists('pattern_summary_html', $body) || array_key_exists('patternSummaryHtml', $body)) {
                $payload['patternSummaryHtml'] = wp_kses_post($body['pattern_summary_html'] ?? $body['patternSummaryHtml']);
            }
            if (array_key_exists('pattern_summary_text', $body) || array_key_exists('patternSummaryText', $body)) {
                $payload['patternSummaryText'] = sanitize_textarea_field($body['pattern_summary_text'] ?? $body['patternSummaryText']);
            }
            if (array_key_exists('metadata', $body) && is_array($body['metadata'])) {
                $payload['metadata'] = $body['metadata'];
                $payload['metadata']['legacy_wp_user_id'] = $uid;
                $payload['metadata']['wordpress_site_url'] = home_url('/');
            }
            if (array_key_exists('pattern_summary_structured', $body) || array_key_exists('patternSummaryStructured', $body)) {
                $structured = $body['pattern_summary_structured'] ?? $body['patternSummaryStructured'];
                $payload['patternSummaryStructured'] = is_array($structured) || is_object($structured) ? $structured : new stdClass();
            }
            return $payload;
        }

        private function platform_normalise_pattern($pattern) {
            if (!is_array($pattern)) return $pattern;
            $metadata = $pattern['metadata'] ?? [];
            if (!is_array($metadata)) $metadata = [];

            return array_merge($pattern, [
                'craft_type' => $pattern['craft_type'] ?? $pattern['craftType'] ?? '',
                'original_filename' => $pattern['original_filename'] ?? $pattern['originalFilename'] ?? '',
                'file_url' => $pattern['file_url'] ?? $pattern['fileUrl'] ?? '',
                'file_key' => $pattern['file_key'] ?? $pattern['fileKey'] ?? '',
                'pattern_summary_html' => $pattern['pattern_summary_html'] ?? $pattern['patternSummaryHtml'] ?? '',
                'pattern_summary_text' => $pattern['pattern_summary_text'] ?? $pattern['patternSummaryText'] ?? '',
                'pattern_summary_structured' => $pattern['pattern_summary_structured'] ?? $pattern['patternSummaryStructured'] ?? new stdClass(),
                'detected_design_code' => $metadata['detected_design_code'] ?? $pattern['detected_design_code'] ?? '',
                'project_id' => $metadata['project_id'] ?? $pattern['project_id'] ?? '',
                'file_id' => $metadata['file_id'] ?? $pattern['file_id'] ?? '',
                'job_id' => $metadata['job_id'] ?? $pattern['job_id'] ?? '',
                'metadata' => $metadata,
                'created_at' => $pattern['created_at'] ?? $pattern['createdAt'] ?? '',
                'updated_at' => $pattern['updated_at'] ?? $pattern['updatedAt'] ?? '',
            ]);
        }

        private function platform_save_pattern($uid, $body) {
            if (!$this->platform_ready()) return null;

            $payload = $this->platform_pattern_payload($body, $uid);
            $id = sanitize_text_field($body['id'] ?? '');
            $result = $id
                ? StitchSense_Platform_Client::request('PUT', '/patterns/' . rawurlencode($id), $payload)
                : StitchSense_Platform_Client::request('POST', '/patterns', $payload);
            if (is_wp_error($result)) return $result;

            $pattern = $this->platform_normalise_pattern(is_array($result['pattern'] ?? null) ? $result['pattern'] : []);
            return $this->json_response([
                'success' => true,
                'id' => $pattern['id'] ?? '',
                'pattern' => $pattern,
                'action' => $id ? 'updated' : 'created',
                'storage' => 'stitchsense-platform',
            ], $id ? 200 : 201);
        }

        private function platform_list_patterns(WP_REST_Request $request) {
            if (!$this->platform_ready()) return null;

            $path = '/patterns';
            $search = sanitize_text_field($request->get_param('search') ?? '');
            if ($search !== '') {
                $path .= '?search=' . rawurlencode($search);
            }

            $result = StitchSense_Platform_Client::request('GET', $path);
            if (is_wp_error($result)) return $result;

            $patterns = is_array($result['patterns'] ?? null) ? array_map([$this, 'platform_normalise_pattern'], $result['patterns']) : [];
            return $this->json_response([
                'success' => true,
                'patterns' => $patterns,
                'total' => count($patterns),
                'page' => 1,
                'pages' => 1,
                'storage' => 'stitchsense-platform',
            ]);
        }

        private function platform_get_pattern($id) {
            if (!$this->platform_ready()) return null;

            $result = StitchSense_Platform_Client::request('GET', '/patterns/' . rawurlencode($id));
            if (is_wp_error($result)) return $result;

            $pattern = $this->platform_normalise_pattern(is_array($result['pattern'] ?? null) ? $result['pattern'] : []);
            if (!empty($pattern['file_key']) && empty($pattern['file_url'])) {
                $file = StitchSense_Platform_Client::request('GET', '/patterns/' . rawurlencode($id) . '/file-url');
                if (!is_wp_error($file) && !empty($file['fileUrl'])) {
                    $pattern['file_url'] = esc_url_raw($file['fileUrl']);
                    $pattern['fileUrl'] = $pattern['file_url'];
                }
            }

            $pattern['chats'] = $pattern['chats'] ?? [];
            $pattern['chat_questions'] = $pattern['chat_questions'] ?? [];
            $pattern['rewrites'] = $pattern['rewrites'] ?? [];

            return $this->json_response(['success' => true, 'pattern' => $pattern, 'storage' => 'stitchsense-platform']);
        }

        private function platform_update_pattern($id, $body, $uid) {
            if (!$this->platform_ready()) return null;

            $payload = $this->platform_pattern_update_payload($body, $uid);
            if (empty($payload)) {
                return $this->json_response(['success' => false, 'error' => 'No valid fields to update.'], 400);
            }
            $result = StitchSense_Platform_Client::request('PUT', '/patterns/' . rawurlencode($id), $payload);
            if (is_wp_error($result)) return $result;

            return $this->json_response([
                'success' => true,
                'pattern' => $this->platform_normalise_pattern(is_array($result['pattern'] ?? null) ? $result['pattern'] : []),
                'action' => 'updated',
                'storage' => 'stitchsense-platform',
            ]);
        }

        private function platform_delete_pattern($id) {
            if (!$this->platform_ready()) return null;

            $result = StitchSense_Platform_Client::request('DELETE', '/patterns/' . rawurlencode($id));
            if (is_wp_error($result)) return $result;
            return $this->json_response(['success' => true, 'action' => 'archived', 'storage' => 'stitchsense-platform']);
        }

        private function platform_normalise_chat_session($session) {
            if (!is_array($session)) return $session;
            return array_merge($session, [
                'pattern_id' => $session['pattern_id'] ?? $session['patternId'] ?? null,
                'skill_level' => $session['skill_level'] ?? $session['skillLevel'] ?? null,
                'created_at' => $session['created_at'] ?? $session['createdAt'] ?? '',
                'updated_at' => $session['updated_at'] ?? $session['updatedAt'] ?? '',
            ]);
        }

        private function platform_list_chat_sessions($pattern_id) {
            if (!$this->platform_ready()) return null;

            $result = StitchSense_Platform_Client::request('GET', '/patterns/' . rawurlencode($pattern_id) . '/chats');
            if (is_wp_error($result)) return $result;

            $sessions = is_array($result['sessions'] ?? null) ? array_map([$this, 'platform_normalise_chat_session'], $result['sessions']) : [];
            return $this->json_response(['success' => true, 'sessions' => $sessions, 'storage' => 'stitchsense-platform']);
        }

        private function platform_create_chat_session($body) {
            if (!$this->platform_ready()) return null;

            $payload = [
                'patternId' => sanitize_text_field($body['pattern_id'] ?? $body['patternId'] ?? ''),
                'title' => sanitize_text_field($body['title'] ?? 'Untitled chat'),
                'skillLevel' => sanitize_text_field($body['skill_level'] ?? $body['skillLevel'] ?? 'beginner'),
            ];
            if ($payload['patternId'] === '') unset($payload['patternId']);

            $result = StitchSense_Platform_Client::request('POST', '/chats', $payload);
            if (is_wp_error($result)) return $result;

            $session = $this->platform_normalise_chat_session(is_array($result['session'] ?? null) ? $result['session'] : []);
            return $this->json_response([
                'success' => true,
                'id' => $session['id'] ?? '',
                'session' => $session,
                'storage' => 'stitchsense-platform',
            ], 201);
        }

        private function platform_get_chat_session($session_id) {
            if (!$this->platform_ready()) return null;

            $result = StitchSense_Platform_Client::request('GET', '/chats/' . rawurlencode($session_id) . '/messages');
            if (is_wp_error($result)) return $result;

            $messages = is_array($result['messages'] ?? null) ? $result['messages'] : [];
            return $this->json_response([
                'success' => true,
                'session' => [
                    'id' => $session_id,
                    'messages' => $messages,
                ],
                'storage' => 'stitchsense-platform',
            ]);
        }

        private function platform_list_chat_messages($session_id) {
            if (!$this->platform_ready()) return null;

            $result = StitchSense_Platform_Client::request('GET', '/chats/' . rawurlencode($session_id) . '/messages');
            if (is_wp_error($result)) return $result;

            return $this->json_response([
                'success' => true,
                'messages' => is_array($result['messages'] ?? null) ? $result['messages'] : [],
                'page' => 1,
                'storage' => 'stitchsense-platform',
            ]);
        }

        private function platform_append_chat_messages($session_id, $messages) {
            if (!$this->platform_ready()) return null;

            $payload = ['messages' => []];
            foreach ((array) $messages as $message) {
                if (!is_array($message)) continue;
                $content = (string) ($message['content'] ?? '');
                if ($content === '') continue;
                $payload['messages'][] = [
                    'role' => sanitize_text_field($message['role'] ?? 'user'),
                    'content' => $content,
                    'kind' => sanitize_text_field($message['kind'] ?? 'message'),
                    'toolMode' => sanitize_text_field($message['tool_mode'] ?? $message['toolMode'] ?? ''),
                ];
                $pattern_id = sanitize_text_field($message['pattern_id'] ?? $message['patternId'] ?? '');
                if ($pattern_id !== '') {
                    $payload['messages'][count($payload['messages']) - 1]['patternId'] = $pattern_id;
                }
            }

            if (empty($payload['messages'])) {
                return $this->json_response(['success' => false, 'error' => 'No messages supplied.'], 400);
            }

            $result = StitchSense_Platform_Client::request('PUT', '/chats/' . rawurlencode($session_id) . '/messages', $payload);
            if (is_wp_error($result)) return $result;

            return $this->json_response([
                'success' => true,
                'ids' => is_array($result['ids'] ?? null) ? $result['ids'] : [],
                'imported' => (int) ($result['imported'] ?? count($payload['messages'])),
                'storage' => 'stitchsense-platform',
            ], 201);
        }

        private function platform_upload_pattern_file($pattern_id, $file_path, $original_filename, $mime_type = 'application/octet-stream') {
            if (!$this->platform_ready()) return null;
            if (!$pattern_id || !is_readable($file_path)) return null;

            $result = StitchSense_Platform_Client::upload_file(
                '/patterns/' . rawurlencode($pattern_id) . '/file',
                $file_path,
                [
                    'filename' => $original_filename,
                    'mimeType' => $mime_type,
                ]
            );

            return is_wp_error($result) ? $result : $result;
        }

        private function platform_list_rewrites($pattern_id) {
            if (!$this->platform_ready()) return null;

            $result = StitchSense_Platform_Client::request('GET', '/patterns/' . rawurlencode($pattern_id) . '/rewrites');
            if (is_wp_error($result)) return $result;

            return $this->json_response([
                'success' => true,
                'rewrites' => is_array($result['rewrites'] ?? null) ? $result['rewrites'] : [],
                'storage' => 'stitchsense-platform',
            ]);
        }

        private function platform_save_rewrite($body) {
            if (!$this->platform_ready()) return null;

            $payload = [
                'patternId' => sanitize_text_field($body['pattern_id'] ?? $body['patternId'] ?? ''),
                'prompt' => sanitize_textarea_field($body['prompt'] ?? ''),
                'rewriteResult' => (string) ($body['rewrite_result'] ?? $body['rewriteResult'] ?? ''),
                'rewriteChanges' => array_values(is_array($body['rewrite_changes'] ?? null) ? $body['rewrite_changes'] : []),
                'rewriteWarnings' => array_values(is_array($body['rewrite_warnings'] ?? null) ? $body['rewrite_warnings'] : []),
                'confidenceScore' => (int) ($body['confidence_score'] ?? $body['confidenceScore'] ?? 0),
            ];

            if ($payload['patternId'] === '' || $payload['rewriteResult'] === '') {
                return $this->json_response(['success' => false, 'error' => 'Pattern and rewrite result are required.'], 400);
            }
            if ($payload['prompt'] === '') unset($payload['prompt']);

            $result = StitchSense_Platform_Client::request('POST', '/rewrites/import', $payload);
            if (is_wp_error($result)) return $result;

            $rewrite = is_array($result['rewrite'] ?? null) ? $result['rewrite'] : [];
            return $this->json_response([
                'success' => true,
                'id' => $rewrite['id'] ?? '',
                'rewrite' => $rewrite,
                'storage' => 'stitchsense-platform',
            ], 201);
        }

        /* --------------------------------------------------------
           WordPress Fallback Store
           -------------------------------------------------------- */

        private function fallback_key($name) {
            return 'stitchsense_library_' . $name;
        }

        private function fallback_get($uid, $name, $default = []) {
            $value = get_user_meta($uid, $this->fallback_key($name), true);
            return is_array($value) ? $value : $default;
        }

        private function fallback_set($uid, $name, $value) {
            update_user_meta($uid, $this->fallback_key($name), is_array($value) ? $value : []);
        }

        private function fallback_uuid($prefix) {
            if (function_exists('wp_generate_uuid4')) return wp_generate_uuid4();
            return $prefix . '_' . uniqid('', true);
        }

        private function fallback_save_pattern($uid, $body) {
            $patterns = $this->fallback_get($uid, 'patterns');
            $project_id = sanitize_text_field($body['project_id'] ?? '');
            $id = sanitize_text_field($body['id'] ?? $body['library_pattern_id'] ?? '');
            if (!$id && $project_id) {
                foreach ($patterns as $existing) {
                    if (($existing['project_id'] ?? '') === $project_id) {
                        $id = $existing['id'];
                        break;
                    }
                }
            }
            if (!$id) $id = $this->fallback_uuid('pattern');

            $data = $this->pattern_payload($body, $uid);
            $now = date('Y-m-d H:i:s');
            $existingCreated = $patterns[$id]['created_at'] ?? $now;
            $pattern = $this->normalise_pattern(array_merge($patterns[$id] ?? [], $data, [
                'id' => $id,
                'created_at' => $existingCreated,
                'updated_at' => $now,
                'is_archived' => !empty($body['is_archived']),
            ]));
            $patterns[$id] = $pattern;
            $this->fallback_set($uid, 'patterns', $patterns);
            return $this->json_response(['success' => true, 'id' => $id, 'pattern' => $pattern, 'action' => $existingCreated === $now ? 'created' : 'updated', 'storage' => 'wordpress']);
        }

        private function fallback_list_patterns($uid, WP_REST_Request $request) {
            $patterns = array_values($this->fallback_get($uid, 'patterns'));
            $search = strtolower(sanitize_text_field($request->get_param('search') ?? ''));
            $craft = sanitize_text_field($request->get_param('craft') ?? '');
            $sort = sanitize_text_field($request->get_param('sort') ?? 'recent');
            $patterns = array_values(array_filter($patterns, function($pattern) use ($search, $craft) {
                if (!empty($pattern['is_archived'])) return false;
                if ($craft && $craft !== 'all' && ($pattern['craft_type'] ?? '') !== $craft) return false;
                if ($search) {
                    $haystack = strtolower(($pattern['title'] ?? '') . ' ' . ($pattern['pattern_summary_text'] ?? '') . ' ' . ($pattern['detected_design_code'] ?? ''));
                    if (strpos($haystack, $search) === false) return false;
                }
                return true;
            }));
            $chats = $this->fallback_get($uid, 'chats');
            $rewrites = $this->fallback_get($uid, 'rewrites');
            foreach ($patterns as &$pattern) {
                $pid = $pattern['id'] ?? '';
                $pattern['chat_count'] = count(array_filter($chats, function($chat) use ($pid) { return ($chat['pattern_id'] ?? '') === $pid; }));
                $pattern['rewrite_count'] = count(array_filter($rewrites, function($rewrite) use ($pid) { return ($rewrite['pattern_id'] ?? '') === $pid; }));
            }
            unset($pattern);
            usort($patterns, function($a, $b) use ($sort) {
                if ($sort === 'oldest') return strcmp($a['created_at'] ?? '', $b['created_at'] ?? '');
                if ($sort === 'title') return strcasecmp($a['title'] ?? '', $b['title'] ?? '');
                if ($sort === 'chats') return (int)($b['chat_count'] ?? 0) <=> (int)($a['chat_count'] ?? 0);
                if ($sort === 'rewrites') return (int)($b['rewrite_count'] ?? 0) <=> (int)($a['rewrite_count'] ?? 0);
                return strcmp($b['created_at'] ?? '', $a['created_at'] ?? '');
            });
            return $this->json_response(['success' => true, 'patterns' => $patterns, 'total' => count($patterns), 'page' => 1, 'pages' => 1, 'storage' => 'wordpress']);
        }

        private function fallback_get_pattern($uid, $id) {
            $patterns = $this->fallback_get($uid, 'patterns');
            if (empty($patterns[$id])) return $this->json_response(['success' => false, 'error' => 'Pattern not found.'], 404);
            $pattern = $this->normalise_pattern($patterns[$id]);
            $chats = $this->fallback_get($uid, 'chats');
            $rewrites = $this->fallback_get($uid, 'rewrites');
            $pattern['chats'] = array_values(array_filter($chats, function($chat) use ($id) { return ($chat['pattern_id'] ?? '') === $id && empty($chat['is_archived']); }));
            $messages = $this->fallback_get($uid, 'messages');
            $chatIds = array_map(function($chat) { return $chat['id'] ?? ''; }, $pattern['chats']);
            $pattern['chat_questions'] = array_values(array_filter($messages, function($message) use ($chatIds) {
                return in_array($message['session_id'] ?? '', $chatIds, true) && ($message['role'] ?? '') === 'user';
            }));
            usort($pattern['chat_questions'], function($a, $b) { return strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''); });
            $pattern['chat_questions'] = array_slice(array_map(function($message) use ($pattern) {
                $sessionId = $message['session_id'] ?? '';
                $sessionTitle = 'Pattern chat';
                foreach ($pattern['chats'] as $chat) {
                    if (($chat['id'] ?? '') === $sessionId) {
                        $sessionTitle = $chat['title'] ?? $sessionTitle;
                        break;
                    }
                }
                return [
                    'id' => $message['id'] ?? '',
                    'session_id' => $sessionId,
                    'session_title' => $sessionTitle,
                    'content' => $message['content'] ?? '',
                    'created_at' => $message['created_at'] ?? '',
                ];
            }, $pattern['chat_questions']), 0, 12);
            $pattern['rewrites'] = array_values(array_filter($rewrites, function($rewrite) use ($id) { return ($rewrite['pattern_id'] ?? '') === $id; }));
            return $this->json_response(['success' => true, 'pattern' => $pattern, 'storage' => 'wordpress']);
        }

        private function fallback_update_pattern($uid, $id, $body) {
            $patterns = $this->fallback_get($uid, 'patterns');
            if (empty($patterns[$id])) return $this->json_response(['success' => false, 'error' => 'Pattern not found.'], 404);
            foreach (['title', 'craft_type', 'metadata', 'is_archived', 'pattern_summary_html', 'pattern_summary_text', 'pattern_summary_structured'] as $key) {
                if (isset($body[$key])) $patterns[$id][$key] = $body[$key];
            }
            $patterns[$id]['updated_at'] = date('Y-m-d H:i:s');
            $patterns[$id] = $this->normalise_pattern($patterns[$id]);
            $this->fallback_set($uid, 'patterns', $patterns);
            return $this->json_response(['success' => true, 'pattern' => $patterns[$id], 'action' => 'updated', 'storage' => 'wordpress']);
        }

        private function fallback_delete_pattern($uid, $id, $hard = false) {
            $patterns = $this->fallback_get($uid, 'patterns');
            if ($hard) unset($patterns[$id]);
            elseif (isset($patterns[$id])) {
                $patterns[$id]['is_archived'] = true;
                $patterns[$id]['updated_at'] = date('Y-m-d H:i:s');
            }
            $this->fallback_set($uid, 'patterns', $patterns);
            return $this->json_response(['success' => true, 'action' => $hard ? 'deleted' : 'archived', 'storage' => 'wordpress']);
        }

        private function fallback_create_chat($uid, $body) {
            $chats = $this->fallback_get($uid, 'chats');
            $id = $this->fallback_uuid('chat');
            $chat = [
                'id' => $id,
                'wp_user_id' => $uid,
                'pattern_id' => sanitize_text_field($body['pattern_id'] ?? ''),
                'title' => sanitize_text_field($body['title'] ?? 'Untitled chat'),
                'skill_level' => sanitize_text_field($body['skill_level'] ?? 'beginner'),
                'is_archived' => false,
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s'),
            ];
            $chats[$id] = $chat;
            $this->fallback_set($uid, 'chats', $chats);
            return $this->json_response(['success' => true, 'id' => $id, 'session' => $chat, 'storage' => 'wordpress']);
        }

        private function fallback_list_chats($uid, $pattern_id) {
            $chats = array_values(array_filter($this->fallback_get($uid, 'chats'), function($chat) use ($pattern_id) {
                return ($chat['pattern_id'] ?? '') === $pattern_id && empty($chat['is_archived']);
            }));
            $messages = $this->fallback_get($uid, 'messages');
            foreach ($chats as &$chat) {
                $id = $chat['id'];
                $chat['message_count'] = count(array_filter($messages, function($msg) use ($id) { return ($msg['session_id'] ?? '') === $id; }));
            }
            unset($chat);
            return $this->json_response(['success' => true, 'sessions' => $chats, 'storage' => 'wordpress']);
        }

        private function fallback_get_chat($uid, $id) {
            $chats = $this->fallback_get($uid, 'chats');
            if (empty($chats[$id])) return $this->json_response(['success' => false, 'error' => 'Not found.'], 404);
            $session = $chats[$id];
            $session['messages'] = array_values(array_filter($this->fallback_get($uid, 'messages'), function($msg) use ($id) {
                return ($msg['session_id'] ?? '') === $id;
            }));
            usort($session['messages'], function($a, $b) { return (int)($a['id_num'] ?? 0) <=> (int)($b['id_num'] ?? 0); });
            return $this->json_response(['success' => true, 'session' => $session, 'storage' => 'wordpress']);
        }

        private function fallback_list_messages($uid, $session_id) {
            $messages = array_values(array_filter($this->fallback_get($uid, 'messages'), function($msg) use ($session_id) {
                return ($msg['session_id'] ?? '') === $session_id;
            }));
            usort($messages, function($a, $b) { return (int)($a['id_num'] ?? 0) <=> (int)($b['id_num'] ?? 0); });
            return $this->json_response(['success' => true, 'messages' => $messages, 'page' => 1, 'storage' => 'wordpress']);
        }

        private function fallback_append_messages($uid, $session_id, $messages) {
            $chats = $this->fallback_get($uid, 'chats');
            if (empty($chats[$session_id])) return $this->json_response(['success' => false, 'error' => 'Session not found.'], 404);
            $session_pattern_id = sanitize_text_field($chats[$session_id]['pattern_id'] ?? '');
            $store = $this->fallback_get($uid, 'messages');
            $ids = [];
            foreach ($messages as $message) {
                if (!is_array($message) || empty($message['content'])) continue;
                $message_pattern_id = sanitize_text_field($message['pattern_id'] ?? $message['patternId'] ?? '');
                if ($session_pattern_id !== '' && $message_pattern_id === '') {
                    return $this->json_response([
                        'success' => false,
                        'error' => 'This chat session is bound to a specific pattern. Please reopen the selected pattern and start a fresh chat if needed.',
                    ], 409);
                }
                if ($session_pattern_id !== '' && $message_pattern_id !== '' && $message_pattern_id !== $session_pattern_id) {
                    return $this->json_response([
                        'success' => false,
                        'error' => 'This chat session belongs to a different pattern. Please start a fresh chat for the selected pattern.',
                    ], 409);
                }
                $id = $this->fallback_uuid('message');
                $store[$id] = [
                    'id' => $id,
                    'id_num' => count($store) + 1,
                    'session_id' => $session_id,
                    'role' => sanitize_text_field($message['role'] ?? 'user'),
                    'content' => (string) ($message['content'] ?? ''),
                    'kind' => sanitize_text_field($message['kind'] ?? 'message'),
                    'tool_mode' => sanitize_text_field($message['tool_mode'] ?? ''),
                    'created_at' => date('Y-m-d H:i:s'),
                ];
                $ids[] = $id;
            }
            $chats[$session_id]['updated_at'] = date('Y-m-d H:i:s');
            $this->fallback_set($uid, 'messages', $store);
            $this->fallback_set($uid, 'chats', $chats);
            return $this->json_response(['success' => true, 'ids' => $ids, 'storage' => 'wordpress']);
        }

        private function fallback_admin_user_ids() {
            if (!function_exists('get_users')) return [];
            $ids = get_users([
                'fields' => 'ID',
                'meta_key' => $this->fallback_key('patterns'),
            ]);
            return array_map('intval', is_array($ids) ? $ids : []);
        }

        private function fallback_admin_patterns() {
            $rows = [];
            foreach ($this->fallback_admin_user_ids() as $uid) {
                $patterns = $this->fallback_get($uid, 'patterns');
                $chats = $this->fallback_get($uid, 'chats');
                $rewrites = $this->fallback_get($uid, 'rewrites');

                foreach ($patterns as $pattern) {
                    if (!is_array($pattern)) continue;
                    $pid = $pattern['id'] ?? '';
                    $pattern['wp_user_id'] = (int) ($pattern['wp_user_id'] ?? $uid);
                    $pattern['chat_count'] = count(array_filter($chats, function($chat) use ($pid) {
                        return ($chat['pattern_id'] ?? '') === $pid;
                    }));
                    $pattern['rewrite_count'] = count(array_filter($rewrites, function($rewrite) use ($pid) {
                        return ($rewrite['pattern_id'] ?? '') === $pid;
                    }));
                    $pattern['storage'] = 'wordpress';
                    $rows[] = $this->normalise_pattern($pattern);
                }
            }
            return $rows;
        }

        private function fallback_admin_users() {
            $rows = [];
            foreach ($this->fallback_admin_user_ids() as $uid) {
                $patterns = $this->fallback_get($uid, 'patterns');
                $chats = $this->fallback_get($uid, 'chats');
                $rewrites = $this->fallback_get($uid, 'rewrites');
                $last = '';

                foreach ($patterns as $pattern) {
                    if (!is_array($pattern)) continue;
                    $activity = (string) ($pattern['updated_at'] ?? $pattern['created_at'] ?? '');
                    if ($activity && (!$last || strcmp($activity, $last) > 0)) $last = $activity;
                }
                foreach ($chats as $chat) {
                    if (!is_array($chat)) continue;
                    $activity = (string) ($chat['updated_at'] ?? $chat['created_at'] ?? '');
                    if ($activity && (!$last || strcmp($activity, $last) > 0)) $last = $activity;
                }
                foreach ($rewrites as $rewrite) {
                    if (!is_array($rewrite)) continue;
                    $activity = (string) ($rewrite['created_at'] ?? '');
                    if ($activity && (!$last || strcmp($activity, $last) > 0)) $last = $activity;
                }

                $rows[$uid] = [
                    'wp_user_id' => $uid,
                    'pattern_count' => count($patterns),
                    'chat_count' => count($chats),
                    'rewrite_count' => count($rewrites),
                    'last_activity' => $last,
                    'storage' => 'wordpress',
                ];
            }
            return array_values($rows);
        }

        private function fallback_save_rewrite($uid, $body) {
            $rewrites = $this->fallback_get($uid, 'rewrites');
            $id = $this->fallback_uuid('rewrite');
            $rewrites[$id] = [
                'id' => $id,
                'wp_user_id' => $uid,
                'pattern_id' => sanitize_text_field($body['pattern_id'] ?? ''),
                'rewrite_result' => (string) ($body['rewrite_result'] ?? ''),
                'rewrite_changes' => $body['rewrite_changes'] ?? [],
                'rewrite_warnings' => $body['rewrite_warnings'] ?? [],
                'confidence_score' => (int) ($body['confidence_score'] ?? 0),
                'created_at' => date('Y-m-d H:i:s'),
            ];
            $this->fallback_set($uid, 'rewrites', $rewrites);
            return $this->json_response(['success' => true, 'id' => $id, 'storage' => 'wordpress']);
        }

        private function fallback_list_rewrites($uid, $pattern_id) {
            $rewrites = array_values(array_filter($this->fallback_get($uid, 'rewrites'), function($rewrite) use ($pattern_id) {
                return ($rewrite['pattern_id'] ?? '') === $pattern_id;
            }));
            return $this->json_response(['success' => true, 'rewrites' => $rewrites, 'storage' => 'wordpress']);
        }

        /* ================================================================
           PATTERNS
           ================================================================ */

        public function save_pattern_file(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $body = $this->json_body($request);
            $files = $request->get_file_params();
            $file = is_array($files) && !empty($files['pattern_file']) ? $files['pattern_file'] : null;
            $data_uri = (string) ($body['file_data_uri'] ?? '');
            $original = sanitize_file_name(($file && !empty($file['name'])) ? $file['name'] : ($body['file_name'] ?? 'pattern-upload'));
            $project_id = sanitize_text_field(($body['project_id'] ?? '') ?: ($request->get_param('project_id') ?? ''));
            $pattern_id = sanitize_text_field(($body['pattern_id'] ?? '') ?: ($request->get_param('pattern_id') ?? ''));
            $mime_type = sanitize_text_field(($body['mime_type'] ?? '') ?: ($file['type'] ?? 'application/octet-stream'));

            $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
            if (!$extension || !in_array($extension, $this->allowed_pattern_extensions(), true)) {
                return $this->json_response(['success' => false, 'error' => 'Unsupported pattern file type.'], 400);
            }

            $source_path = '';
            $bytes = null;
            if ($file && empty($file['error']) && !empty($file['tmp_name']) && is_readable($file['tmp_name'])) {
                $source_path = $file['tmp_name'];
                $size = isset($file['size']) ? (int) $file['size'] : filesize($source_path);
                if ($size > 50 * 1024 * 1024) {
                    return $this->json_response(['success' => false, 'error' => 'Pattern file is over 50 MB.'], 413);
                }
            } else {
                if ($data_uri === '' || strpos($data_uri, 'base64,') === false) {
                    return $this->json_response(['success' => false, 'error' => 'No valid file data received.'], 400);
                }

                $parts = explode('base64,', $data_uri, 2);
                $bytes = base64_decode($parts[1], true);
                if ($bytes === false || $bytes === '') {
                    return $this->json_response(['success' => false, 'error' => 'Could not decode uploaded pattern file.'], 400);
                }
                if (strlen($bytes) > 50 * 1024 * 1024) {
                    return $this->json_response(['success' => false, 'error' => 'Pattern file is over 50 MB.'], 413);
                }
            }

            $uploads = wp_upload_dir();
            if (!empty($uploads['error'])) {
                return $this->json_response(['success' => false, 'error' => 'WordPress uploads folder is unavailable: ' . $uploads['error']], 500);
            }

            $subdir = 'stitchsense/patterns/user-' . $uid;
            $dir = trailingslashit($uploads['basedir']) . $subdir;
            if (!wp_mkdir_p($dir)) {
                return $this->json_response(['success' => false, 'error' => 'Could not create StitchSense uploads folder.'], 500);
            }

            $base = $project_id ? sanitize_file_name($project_id . '-' . $original) : $original;
            $filename = wp_unique_filename($dir, $base);
            $path = trailingslashit($dir) . $filename;
            if ($source_path) {
                $saved = is_uploaded_file($source_path) ? move_uploaded_file($source_path, $path) : copy($source_path, $path);
                if (!$saved) {
                    return $this->json_response(['success' => false, 'error' => 'Could not save pattern file to WordPress uploads.'], 500);
                }
            } else {
                if (file_put_contents($path, $bytes) === false) {
                    return $this->json_response(['success' => false, 'error' => 'Could not save pattern file to WordPress uploads.'], 500);
                }
            }

            $url = trailingslashit($uploads['baseurl']) . $subdir . '/' . $filename;
            $response = [
                'success' => true,
                'file_url' => esc_url_raw($url),
                'file_name' => $filename,
                'file_extension' => $extension,
                'file_size' => filesize($path),
                'relative_path' => $subdir . '/' . $filename,
                'storage' => 'wordpress',
            ];

            if ($pattern_id !== '' && $this->platform_ready()) {
                $platform_upload = $this->platform_upload_pattern_file($pattern_id, $path, $original, $mime_type);
                if (!is_wp_error($platform_upload) && is_array($platform_upload)) {
                    $response['platform_file'] = [
                        'file_key' => sanitize_text_field($platform_upload['fileKey'] ?? ''),
                        'file_size' => isset($platform_upload['fileSize']) ? (int) $platform_upload['fileSize'] : filesize($path),
                        'storage_provider' => sanitize_text_field($platform_upload['storageProvider'] ?? ''),
                    ];
                    $response['storage'] = 'wordpress+stitchsense-platform';
                } elseif (is_wp_error($platform_upload)) {
                    $response['platform_upload_warning'] = $platform_upload->get_error_message();
                }
            }

            return $this->json_response($response);
        }

        public function save_pattern(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $body = $this->json_body($request);
            return $this->save_pattern_for_user_id($uid, $body);
        }

        public function list_patterns(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $platform = $this->platform_list_patterns($request);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_list_patterns($uid, $request);

            $search = sanitize_text_field($request->get_param('search') ?? '');
            $craft  = sanitize_text_field($request->get_param('craft') ?? '');
            $sort   = sanitize_text_field($request->get_param('sort') ?? 'recent');
            $page   = max(1, (int) ($request->get_param('page') ?? 1));
            $per    = min(50, max(1, (int) ($request->get_param('per_page') ?? 20)));
            $offset = ($page - 1) * $per;

            $where  = 'WHERE p.wp_user_id = ? AND p.is_archived = FALSE';
            $params = [$uid];

            if ($search) {
                $where .= ' AND (p.title ILIKE ? OR p.pattern_summary_text ILIKE ? OR p.detected_design_code ILIKE ?)';
                $q = '%' . $search . '%';
                $params[] = $q; $params[] = $q; $params[] = $q;
            }
            if ($craft && $craft !== 'all') {
                $where .= ' AND p.craft_type = ?';
                $params[] = $craft;
            }

            $orderMap = [
                'recent'  => 'p.created_at DESC',
                'oldest'  => 'p.created_at ASC',
                'title'   => 'p.title ASC',
                'chats'   => 'chat_count DESC, p.updated_at DESC',
                'rewrites'=> 'rewrite_count DESC, p.updated_at DESC',
            ];
            $order = $orderMap[$sort] ?? 'created_at DESC';

            $countStmt = $db->prepare("SELECT COUNT(*) FROM user_patterns p {$where}");
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $stmt = $db->prepare("
                SELECT p.*,
                       (SELECT COUNT(*) FROM chat_sessions WHERE pattern_id = p.id) AS chat_count,
                       (SELECT COUNT(*) FROM rewrite_sessions WHERE pattern_id = p.id) AS rewrite_count
                FROM user_patterns p
                {$where}
                ORDER BY {$order}
                LIMIT ? OFFSET ?
            ");
            $allParams = array_merge($params, [$per, $offset]);
            $stmt->execute($allParams);
            $patterns = array_map([$this, 'normalise_pattern'], $stmt->fetchAll());

            return $this->json_response([
                'success'  => true,
                'patterns' => $patterns,
                'total'    => $total,
                'page'     => $page,
                'pages'    => ceil($total / $per),
            ]);
        }

        public function get_pattern(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $id = sanitize_text_field($request->get_param('id'));
            $platform = $this->platform_get_pattern($id);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_get_pattern($uid, $id);

            $pattern = $this->get_owned_pattern($db, $uid, $id);

            if (!$pattern) {
                return $this->json_response(['success' => false, 'error' => 'Pattern not found.'], 404);
            }

            $chatStmt = $db->prepare('SELECT id, title, skill_level, created_at, updated_at, (SELECT COUNT(*) FROM chat_messages WHERE session_id = chat_sessions.id) AS message_count FROM chat_sessions WHERE wp_user_id = ? AND pattern_id = ? AND is_archived = FALSE ORDER BY updated_at DESC LIMIT 10');
            $chatStmt->execute([$uid, $id]);
            $pattern['chats'] = $chatStmt->fetchAll();

            $questionStmt = $db->prepare("
                SELECT cm.id,
                       cm.session_id,
                       cm.content,
                       cm.created_at,
                       cs.title AS session_title
                FROM chat_messages cm
                INNER JOIN chat_sessions cs ON cs.id = cm.session_id
                WHERE cs.wp_user_id = ?
                  AND cs.pattern_id = ?
                  AND cs.is_archived = FALSE
                  AND cm.role = 'user'
                ORDER BY cm.created_at DESC, cm.id DESC
                LIMIT 12
            ");
            $questionStmt->execute([$uid, $id]);
            $pattern['chat_questions'] = $questionStmt->fetchAll();

            $rewriteStmt = $db->prepare('SELECT id, confidence_score, rewrite_changes, rewrite_warnings, created_at FROM rewrite_sessions WHERE wp_user_id = ? AND pattern_id = ? ORDER BY created_at DESC LIMIT 10');
            $rewriteStmt->execute([$uid, $id]);
            $pattern['rewrites'] = $rewriteStmt->fetchAll();

            return $this->json_response(['success' => true, 'pattern' => $pattern]);
        }

        public function update_pattern(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $id   = sanitize_text_field($request->get_param('id'));
            $body = $this->json_body($request);
            $platform = $this->platform_update_pattern($id, $body, $uid);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_update_pattern($uid, $id, $body);

            $allowed = ['title', 'craft_type', 'metadata', 'is_archived', 'pattern_summary_html', 'pattern_summary_text', 'pattern_summary_structured'];
            $sets = [];
            $vals = [];
            foreach ($allowed as $col) {
                if (isset($body[$col])) {
                    $sets[] = "\"{$col}\" = ?";
                    if ($col === 'metadata' || $col === 'pattern_summary_structured') {
                        $vals[] = wp_json_encode($body[$col]);
                    } elseif ($col === 'pattern_summary_html') {
                        $vals[] = wp_kses_post($body[$col]);
                    } elseif ($col === 'pattern_summary_text') {
                        $vals[] = sanitize_textarea_field($body[$col]);
                    } elseif ($col === 'is_archived') {
                        $vals[] = !empty($body[$col]) ? 'true' : 'false';
                    } else {
                        $vals[] = sanitize_text_field($body[$col]);
                    }
                }
            }
            if (empty($sets)) {
                return $this->json_response(['success' => false, 'error' => 'No valid fields to update.'], 400);
            }

            $sets[] = '"updated_at" = NOW()';
            $vals[] = $id;
            $vals[] = $uid;
            $stmt = $db->prepare("UPDATE user_patterns SET " . implode(', ', $sets) . " WHERE id = ? AND wp_user_id = ?");
            $stmt->execute($vals);

            return $this->json_response(['success' => true, 'pattern' => $this->fetch_pattern_by_id($db, $id, $uid), 'action' => 'updated']);
        }

        public function delete_pattern(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $id = sanitize_text_field($request->get_param('id'));
            $bridge_local = $request->get_param('platform_bridge_local') === '1';
            $platform = $bridge_local ? null : $this->platform_delete_pattern($id);
            if (is_wp_error($platform)) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_delete_pattern($uid, $id, $request->get_param('hard') === 'true');

            $hard = $request->get_param('hard') === 'true';

            if ($hard) {
                $stmt = $db->prepare('DELETE FROM user_patterns WHERE id = ? AND wp_user_id = ?');
            } else {
                $stmt = $db->prepare("UPDATE user_patterns SET is_archived = TRUE, updated_at = NOW() WHERE id = ? AND wp_user_id = ?");
            }
            $stmt->execute([$id, $uid]);

            return $this->json_response([
                'success' => true,
                'action' => $hard ? 'deleted' : 'archived',
                'storage' => $platform !== null ? 'wordpress+stitchsense-platform' : 'wordpress',
            ]);
        }

        /* ================================================================
           CHAT SESSIONS
           ================================================================ */

        public function list_chat_sessions(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $pattern_id = sanitize_text_field($request->get_param('id'));
            $platform = $this->platform_list_chat_sessions($pattern_id);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_list_chats($uid, $pattern_id);

            $stmt = $db->prepare('
                SELECT cs.*, (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) AS message_count
                FROM chat_sessions cs
                WHERE cs.wp_user_id = ? AND cs.pattern_id = ? AND cs.is_archived = FALSE
                ORDER BY cs.updated_at DESC
            ');
            $stmt->execute([$uid, $pattern_id]);
            return $this->json_response(['success' => true, 'sessions' => $stmt->fetchAll()]);
        }

        public function create_chat_session(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $body = $this->json_body($request);
            $platform = $this->platform_create_chat_session($body);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_create_chat($uid, $body);

            $pattern_id = sanitize_text_field($body['pattern_id'] ?? '');
            if ($pattern_id) {
                $pattern = $this->get_owned_pattern($db, $uid, $pattern_id);
                if (!$pattern) {
                    return $this->json_response(['success' => false, 'error' => 'Pattern not found.'], 404);
                }
            }

            $stmt = $db->prepare('INSERT INTO chat_sessions (wp_user_id, pattern_id, title, skill_level) VALUES (?, ?, ?, ?) RETURNING id');
            $stmt->execute([
                $uid,
                $pattern_id ?: null,
                sanitize_text_field($body['title'] ?? 'Untitled chat'),
                sanitize_text_field($body['skill_level'] ?? 'beginner'),
            ]);

            $id = $stmt->fetchColumn();
            return $this->json_response(['success' => true, 'id' => $id, 'session' => [
                'id' => $id,
                'wp_user_id' => $uid,
                'pattern_id' => $pattern_id,
                'title' => sanitize_text_field($body['title'] ?? 'Untitled chat'),
                'skill_level' => sanitize_text_field($body['skill_level'] ?? 'beginner'),
            ]]);
        }

        public function get_chat_session(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $id = sanitize_text_field($request->get_param('id'));
            $platform = $this->platform_get_chat_session($id);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_get_chat($uid, $id);

            $stmt = $db->prepare('SELECT * FROM chat_sessions WHERE id = ? AND wp_user_id = ?');
            $stmt->execute([$id, $uid]);
            $session = $stmt->fetch();

            if (!$session) return $this->json_response(['success' => false, 'error' => 'Not found.'], 404);

            $page = max(1, (int) ($request->get_param('page') ?? 1));
            $per  = min(100, max(1, (int) ($request->get_param('per_page') ?? 50)));
            $offset = ($page - 1) * $per;

            $msgStmt = $db->prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT ? OFFSET ?');
            $msgStmt->execute([$id, $per, $offset]);
            $session['messages'] = $msgStmt->fetchAll();

            return $this->json_response(['success' => true, 'session' => $session]);
        }

        public function append_chat_message(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $body = $this->json_body($request);
            $session_id = sanitize_text_field($request->get_param('id'));
            $platform = $this->platform_append_chat_messages($session_id, [$body]);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_append_messages($uid, $session_id, [$body]);

            $ownStmt = $db->prepare('SELECT id, pattern_id FROM chat_sessions WHERE id = ? AND wp_user_id = ?');
            $ownStmt->execute([$session_id, $uid]);
            $session = $ownStmt->fetch();
            if (!$session) {
                return $this->json_response(['success' => false, 'error' => 'Session not found.'], 404);
            }

            $session_pattern_id = sanitize_text_field($session['pattern_id'] ?? '');
            $message_pattern_id = sanitize_text_field($body['pattern_id'] ?? $body['patternId'] ?? '');
            if ($session_pattern_id !== '' && $message_pattern_id === '') {
                return $this->json_response([
                    'success' => false,
                    'error' => 'This chat session is bound to a specific pattern. Please reopen the selected pattern and start a fresh chat if needed.',
                ], 409);
            }
            if ($session_pattern_id !== '' && $message_pattern_id !== '' && $message_pattern_id !== $session_pattern_id) {
                return $this->json_response([
                    'success' => false,
                    'error' => 'This chat session belongs to a different pattern. Please start a fresh chat for the selected pattern.',
                ], 409);
            }

            $stmt = $db->prepare('INSERT INTO chat_messages (session_id, role, content, kind, tool_mode) VALUES (?, ?, ?, ?, ?) RETURNING id');
            $stmt->execute([
                $session_id,
                sanitize_text_field($body['role'] ?? 'user'),
                $body['content'] ?? '',
                sanitize_text_field($body['kind'] ?? 'message'),
                sanitize_text_field($body['tool_mode'] ?? null),
            ]);

            $db->prepare("UPDATE chat_sessions SET updated_at = NOW() WHERE id = ?")->execute([$session_id]);

            return $this->json_response(['success' => true, 'id' => $stmt->fetchColumn()]);
        }

        public function append_chat_messages(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $body = $this->json_body($request);
            $session_id = sanitize_text_field($request->get_param('id'));
            $messages = $body['messages'] ?? [];
            if (!is_array($messages) || empty($messages)) {
                return $this->json_response(['success' => false, 'error' => 'No messages supplied.'], 400);
            }

            $platform = $this->platform_append_chat_messages($session_id, $messages);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_append_messages($uid, $session_id, $messages);

            $ownStmt = $db->prepare('SELECT id, pattern_id FROM chat_sessions WHERE id = ? AND wp_user_id = ?');
            $ownStmt->execute([$session_id, $uid]);
            $session = $ownStmt->fetch();
            if (!$session) {
                return $this->json_response(['success' => false, 'error' => 'Session not found.'], 404);
            }

            $session_pattern_id = sanitize_text_field($session['pattern_id'] ?? '');
            foreach ($messages as $message) {
                if (!is_array($message)) continue;
                $content = (string) ($message['content'] ?? '');
                if ($content === '') continue;
                $message_pattern_id = sanitize_text_field($message['pattern_id'] ?? $message['patternId'] ?? '');
                if ($session_pattern_id !== '' && $message_pattern_id === '') {
                    return $this->json_response([
                        'success' => false,
                        'error' => 'This chat session is bound to a specific pattern. Please reopen the selected pattern and start a fresh chat if needed.',
                    ], 409);
                }
                if ($session_pattern_id !== '' && $message_pattern_id !== '' && $message_pattern_id !== $session_pattern_id) {
                    return $this->json_response([
                        'success' => false,
                        'error' => 'This chat session belongs to a different pattern. Please start a fresh chat for the selected pattern.',
                    ], 409);
                }
            }

            $ids = [];
            $stmt = $db->prepare('INSERT INTO chat_messages (session_id, role, content, kind, tool_mode) VALUES (?, ?, ?, ?, ?) RETURNING id');
            foreach ($messages as $message) {
                if (!is_array($message)) continue;
                $content = (string) ($message['content'] ?? '');
                if ($content === '') continue;
                $stmt->execute([
                    $session_id,
                    sanitize_text_field($message['role'] ?? 'user'),
                    $content,
                    sanitize_text_field($message['kind'] ?? 'message'),
                    sanitize_text_field($message['tool_mode'] ?? null),
                ]);
                $ids[] = $stmt->fetchColumn();
            }

            $db->prepare("UPDATE chat_sessions SET updated_at = NOW() WHERE id = ?")->execute([$session_id]);
            return $this->json_response(['success' => true, 'ids' => $ids]);
        }

        public function list_chat_messages(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $session_id = sanitize_text_field($request->get_param('id'));
            $platform = $this->platform_list_chat_messages($session_id);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_list_messages($uid, $session_id);

            $ownStmt = $db->prepare('SELECT id FROM chat_sessions WHERE id = ? AND wp_user_id = ?');
            $ownStmt->execute([$session_id, $uid]);
            if (!$ownStmt->fetch()) {
                return $this->json_response(['success' => false, 'error' => 'Session not found.'], 404);
            }

            $page = max(1, (int) ($request->get_param('page') ?? 1));
            $per  = min(200, max(1, (int) ($request->get_param('per_page') ?? 100)));
            $offset = ($page - 1) * $per;
            $stmt = $db->prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT ? OFFSET ?');
            $stmt->execute([$session_id, $per, $offset]);
            return $this->json_response(['success' => true, 'messages' => $stmt->fetchAll(), 'page' => $page]);
        }

        public function delete_chat_session(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $db = $this->db();
            if (!$db) {
                $id = sanitize_text_field($request->get_param('id'));
                $chats = $this->fallback_get($uid, 'chats');
                $messages = $this->fallback_get($uid, 'messages');
                unset($chats[$id]);
                foreach ($messages as $messageId => $message) {
                    if (($message['session_id'] ?? '') === $id) unset($messages[$messageId]);
                }
                $this->fallback_set($uid, 'chats', $chats);
                $this->fallback_set($uid, 'messages', $messages);
                return $this->json_response(['success' => true, 'storage' => 'wordpress']);
            }

            $id = sanitize_text_field($request->get_param('id'));
            $stmt = $db->prepare('DELETE FROM chat_sessions WHERE id = ? AND wp_user_id = ?');
            $stmt->execute([$id, $uid]);

            return $this->json_response(['success' => true]);
        }

        /* ================================================================
           REWRITE SESSIONS
           ================================================================ */

        public function save_rewrite(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $body = $this->json_body($request);
            $platform = $this->platform_save_rewrite($body);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_save_rewrite($uid, $body);

            $pattern_id = sanitize_text_field($body['pattern_id'] ?? '');
            if (!$this->get_owned_pattern($db, $uid, $pattern_id)) {
                return $this->json_response(['success' => false, 'error' => 'Pattern not found.'], 404);
            }
            $stmt = $db->prepare('INSERT INTO rewrite_sessions (wp_user_id, pattern_id, prompt, rewrite_result, rewrite_changes, rewrite_warnings, confidence_score) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id');
            $stmt->execute([
                $uid,
                $pattern_id,
                sanitize_textarea_field($body['prompt'] ?? ''),
                $body['rewrite_result'] ?? '',
                wp_json_encode($body['rewrite_changes'] ?? []),
                wp_json_encode($body['rewrite_warnings'] ?? []),
                (int) ($body['confidence_score'] ?? 0),
            ]);

            return $this->json_response(['success' => true, 'id' => $stmt->fetchColumn()]);
        }

        public function list_rewrites(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $pattern_id = sanitize_text_field($request->get_param('id'));
            $platform = $this->platform_list_rewrites($pattern_id);
            if ($platform !== null) return $platform;

            $db = $this->db();
            if (!$db) return $this->fallback_list_rewrites($uid, $pattern_id);

            $stmt = $db->prepare('
                SELECT id, confidence_score, rewrite_changes, rewrite_warnings, created_at
                FROM rewrite_sessions
                WHERE wp_user_id = ? AND pattern_id = ?
                ORDER BY created_at DESC
            ');
            $stmt->execute([$uid, $pattern_id]);

            return $this->json_response(['success' => true, 'rewrites' => $stmt->fetchAll()]);
        }

        public function get_rewrite(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $db = $this->db();
            if (!$db) {
                $rewrites = $this->fallback_get($uid, 'rewrites');
                $id = sanitize_text_field($request->get_param('id'));
                if (empty($rewrites[$id])) return $this->json_response(['success' => false, 'error' => 'Not found.'], 404);
                return $this->json_response(['success' => true, 'rewrite' => $rewrites[$id], 'storage' => 'wordpress']);
            }

            $id = sanitize_text_field($request->get_param('id'));
            $stmt = $db->prepare('SELECT * FROM rewrite_sessions WHERE id = ? AND wp_user_id = ?');
            $stmt->execute([$id, $uid]);
            $rewrite = $stmt->fetch();

            if (!$rewrite) return $this->json_response(['success' => false, 'error' => 'Not found.'], 404);
            return $this->json_response(['success' => true, 'rewrite' => $rewrite]);
        }

        public function delete_rewrite(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $db = $this->db();
            if (!$db) {
                $rewrites = $this->fallback_get($uid, 'rewrites');
                unset($rewrites[sanitize_text_field($request->get_param('id'))]);
                $this->fallback_set($uid, 'rewrites', $rewrites);
                return $this->json_response(['success' => true, 'storage' => 'wordpress']);
            }

            $id = sanitize_text_field($request->get_param('id'));
            $stmt = $db->prepare('DELETE FROM rewrite_sessions WHERE id = ? AND wp_user_id = ?');
            $stmt->execute([$id, $uid]);

            return $this->json_response(['success' => true]);
        }

        /* ================================================================
           USER SETTINGS
           ================================================================ */

        public function get_settings(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $db = $this->db();
            if (!$db) {
                $settings = get_user_meta($uid, $this->fallback_key('settings'), true);
                if (!is_array($settings)) {
                    $settings = ['wp_user_id' => $uid, 'default_skill' => 'beginner', 'measurement_unit' => 'metric', 'language' => 'uk', 'preferences' => []];
                }
                return $this->json_response(['success' => true, 'settings' => $settings, 'storage' => 'wordpress']);
            }

            $stmt = $db->prepare('SELECT * FROM user_settings WHERE wp_user_id = ?');
            $stmt->execute([$uid]);
            $settings = $stmt->fetch();

            if (!$settings) {
                $settings = [
                    'wp_user_id' => $uid,
                    'default_skill' => 'beginner',
                    'measurement_unit' => 'metric',
                    'language' => 'uk',
                    'preferences' => '{}',
                ];
            }

            return $this->json_response(['success' => true, 'settings' => $settings]);
        }

        public function update_settings(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;

            $db = $this->db();
            if (!$db) {
                $body = $this->json_body($request);
                $settings = [
                    'wp_user_id' => $uid,
                    'default_skill' => sanitize_text_field($body['default_skill'] ?? 'beginner'),
                    'measurement_unit' => sanitize_text_field($body['measurement_unit'] ?? 'metric'),
                    'language' => sanitize_text_field($body['language'] ?? 'uk'),
                    'preferences' => $body['preferences'] ?? [],
                    'updated_at' => date('Y-m-d H:i:s'),
                ];
                update_user_meta($uid, $this->fallback_key('settings'), $settings);
                return $this->json_response(['success' => true, 'storage' => 'wordpress']);
            }

            $body = $request->get_json_params();

            $stmt = $db->prepare('
                INSERT INTO user_settings (wp_user_id, default_skill, measurement_unit, language, preferences, updated_at)
                VALUES (?, ?, ?, ?, ?, NOW())
                ON CONFLICT (wp_user_id) DO UPDATE SET
                    default_skill = EXCLUDED.default_skill,
                    measurement_unit = EXCLUDED.measurement_unit,
                    language = EXCLUDED.language,
                    preferences = EXCLUDED.preferences,
                    updated_at = NOW()
            ');
            $stmt->execute([
                $uid,
                sanitize_text_field($body['default_skill'] ?? 'beginner'),
                sanitize_text_field($body['measurement_unit'] ?? 'metric'),
                sanitize_text_field($body['language'] ?? 'uk'),
                wp_json_encode($body['preferences'] ?? new stdClass()),
            ]);

            return $this->json_response(['success' => true]);
        }

        /* ================================================================
           USER DATA EXPORT / DELETE
           ================================================================ */

        public function export_user_data(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;
            return $this->json_response($this->build_user_export_payload($uid));
        }

        public function admin_export_user_data(WP_REST_Request $request) {
            $admin = $this->require_admin();
            if (is_wp_error($admin)) return $admin;

            $uid = (int) ($request->get_param('user_id') ?? 0);
            if ($uid <= 0) {
                $email = sanitize_email((string) ($request->get_param('email') ?? ''));
                if ($email !== '') {
                    $user = get_user_by('email', $email);
                    $uid = $user instanceof WP_User ? (int) $user->ID : 0;
                }
            }

            if ($uid <= 0) {
                return $this->json_response(['success' => false, 'error' => 'Supply a valid user_id or email.'], 400);
            }

            $user = get_user_by('id', $uid);
            if (!($user instanceof WP_User) || empty($user->ID)) {
                return $this->json_response(['success' => false, 'error' => 'WordPress user not found.'], 404);
            }

            return $this->json_response($this->build_user_export_payload($uid));
        }

        public function admin_export_payload_for_user($uid) {
            $admin = $this->require_admin();
            if (is_wp_error($admin)) return $admin;

            $uid = (int) $uid;
            if ($uid <= 0) {
                return new WP_Error('invalid_user', 'Supply a valid WordPress user ID.', ['status' => 400]);
            }

            $user = get_user_by('id', $uid);
            if (!($user instanceof WP_User) || empty($user->ID)) {
                return new WP_Error('user_not_found', 'WordPress user not found.', ['status' => 404]);
            }

            return $this->build_user_export_payload($uid);
        }

        public function bridge_export_payload_for_user($uid) {
            $uid = (int) $uid;
            if ($uid <= 0) {
                return new WP_Error('invalid_user', 'Supply a valid WordPress user ID.', ['status' => 400]);
            }

            $user = get_user_by('id', $uid);
            if (!($user instanceof WP_User) || empty($user->ID)) {
                return new WP_Error('user_not_found', 'WordPress user not found.', ['status' => 404]);
            }

            return $this->build_bridge_export_payload($user);
        }

        private function build_bridge_export_payload(WP_User $user) {
            $local = $this->build_user_export_payload((int) $user->ID);
            if (!is_array($local)) return $local;
            // Platform sync expects WordPress export to be authoritative.
            // Re-merging platform rows here can resurrect deleted data on re-sync,
            // so the bridge export must remain a pure WordPress snapshot.
            return $local;
        }

        private function merge_bridge_patterns($local_patterns, $platform_patterns) {
            $merged = [];
            $index = [];

            foreach (array_merge((array) $platform_patterns, (array) $local_patterns) as $pattern) {
                if (!is_array($pattern)) continue;
                $metadata = is_array($pattern['metadata'] ?? null) ? $pattern['metadata'] : [];
                $key = '';

                if (!empty($pattern['project_id'])) {
                    $key = 'project:' . (string) $pattern['project_id'];
                } elseif (!empty($metadata['project_id'])) {
                    $key = 'project:' . (string) $metadata['project_id'];
                } elseif (!empty($pattern['id'])) {
                    $key = 'id:' . (string) $pattern['id'];
                } else {
                    $key = 'shape:' . md5(
                        strtolower(trim((string) ($pattern['title'] ?? ''))) . '|' .
                        strtolower(trim((string) ($pattern['original_filename'] ?? '')))
                    );
                }

                if (isset($index[$key])) {
                    $existing = $merged[$index[$key]];
                    $merged[$index[$key]] = array_merge($existing, $pattern);
                    continue;
                }

                $index[$key] = count($merged);
                $merged[] = $pattern;
            }

            return array_values($merged);
        }

        private function merge_bridge_records_by_id($local_records, $platform_records) {
            $merged = [];
            $index = [];

            foreach (array_merge((array) $platform_records, (array) $local_records) as $record) {
                if (!is_array($record)) continue;
                $id = (string) ($record['id'] ?? '');
                $key = $id !== '' ? $id : md5(wp_json_encode($record));

                if (isset($index[$key])) {
                    $existing = $merged[$index[$key]];
                    $merged[$index[$key]] = array_merge($existing, $record);
                    continue;
                }

                $index[$key] = count($merged);
                $merged[] = $record;
            }

            return array_values($merged);
        }

        private function merge_bridge_chat_messages($local_messages, $platform_messages) {
            $merged = [];
            $index = [];

            foreach (array_merge((array) $platform_messages, (array) $local_messages) as $message) {
                if (!is_array($message)) continue;
                $key = (string) ($message['id'] ?? '');
                if ($key === '') {
                    $key = md5(
                        (string) ($message['session_id'] ?? $message['sessionId'] ?? '') . '|' .
                        (string) ($message['role'] ?? '') . '|' .
                        (string) ($message['content'] ?? '') . '|' .
                        (string) ($message['created_at'] ?? $message['createdAt'] ?? '')
                    );
                }

                if (isset($index[$key])) {
                    $existing = $merged[$index[$key]];
                    $merged[$index[$key]] = array_merge($existing, $message);
                    continue;
                }

                $index[$key] = count($merged);
                $merged[] = $message;
            }

            return array_values($merged);
        }

        private function build_user_export_payload($uid) {
            $db = $this->db();
            if (!$db) {
                $user = get_user_by('id', $uid);
                return [
                    'success' => true,
                    'exported_at' => date('c'),
                    'user_id' => $uid,
                    'user' => [
                        'email' => $user instanceof WP_User ? $user->user_email : '',
                        'display_name' => $user instanceof WP_User ? $user->display_name : '',
                        'legacy_wp_user_id' => $uid,
                    ],
                    'patterns' => array_values($this->fallback_get($uid, 'patterns')),
                    'chat_sessions' => array_values($this->fallback_get($uid, 'chats')),
                    'chat_messages' => array_values($this->fallback_get($uid, 'messages')),
                    'rewrite_sessions' => array_values($this->fallback_get($uid, 'rewrites')),
                    'settings' => get_user_meta($uid, $this->fallback_key('settings'), true) ?: null,
                    'storage' => 'wordpress',
                ];
            }

            $patternsStmt = $db->prepare('SELECT * FROM user_patterns WHERE wp_user_id = ? ORDER BY created_at DESC');
            $patternsStmt->execute([$uid]);
            $patterns = array_map([$this, 'normalise_pattern'], $patternsStmt->fetchAll());

            $chatStmt = $db->prepare('SELECT * FROM chat_sessions WHERE wp_user_id = ? ORDER BY updated_at DESC');
            $chatStmt->execute([$uid]);
            $chats = $chatStmt->fetchAll();

            $messages = [];
            if ($chats) {
                $ids = array_column($chats, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $msgStmt = $db->prepare("SELECT * FROM chat_messages WHERE session_id IN ({$placeholders}) ORDER BY session_id, id ASC");
                $msgStmt->execute($ids);
                $messages = $msgStmt->fetchAll();
            }

            $rewriteStmt = $db->prepare('SELECT * FROM rewrite_sessions WHERE wp_user_id = ? ORDER BY created_at DESC');
            $rewriteStmt->execute([$uid]);

            $settingsStmt = $db->prepare('SELECT * FROM user_settings WHERE wp_user_id = ?');
            $settingsStmt->execute([$uid]);

            $user = get_user_by('id', $uid);
            return [
                'success' => true,
                'exported_at' => date('c'),
                'user_id' => $uid,
                'user' => [
                    'email' => $user instanceof WP_User ? $user->user_email : '',
                    'display_name' => $user instanceof WP_User ? $user->display_name : '',
                    'legacy_wp_user_id' => $uid,
                ],
                'patterns' => $patterns,
                'chat_sessions' => $chats,
                'chat_messages' => $messages,
                'rewrite_sessions' => $rewriteStmt->fetchAll(),
                'settings' => $settingsStmt->fetch() ?: null,
                'storage' => 'postgresql',
            ];
        }

        public function delete_user_data(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;
            $bridge_local = $request->get_param('platform_bridge_local') === '1';
            $db = $this->db();
            if (!$db) {
                $body = $this->json_body($request);
                if (($body['confirm'] ?? '') !== 'DELETE') {
                    return $this->json_response(['success' => false, 'error' => 'Confirmation required.'], 400);
                }
                foreach (['patterns', 'chats', 'messages', 'rewrites', 'settings'] as $name) {
                    delete_user_meta($uid, $this->fallback_key($name));
                }
                if (!$bridge_local && StitchSense_Platform_Client::enabled()) {
                    $user = get_user_by('id', $uid);
                    if ($user instanceof WP_User) {
                        StitchSense_Platform_Client::request_for_user($user, 'POST', '/user/delete-data', ['confirm' => 'DELETE']);
                    }
                }
                return $this->json_response(['success' => true, 'action' => 'deleted_user_data', 'storage' => 'wordpress']);
            }

            $body = $this->json_body($request);
            if (($body['confirm'] ?? '') !== 'DELETE') {
                return $this->json_response(['success' => false, 'error' => 'Confirmation required.'], 400);
            }

            $db->beginTransaction();
            try {
                $sessionStmt = $db->prepare('SELECT id FROM chat_sessions WHERE wp_user_id = ?');
                $sessionStmt->execute([$uid]);
                $sessionIds = $sessionStmt->fetchAll(PDO::FETCH_COLUMN);
                if ($sessionIds) {
                    $placeholders = implode(',', array_fill(0, count($sessionIds), '?'));
                    $db->prepare("DELETE FROM chat_messages WHERE session_id IN ({$placeholders})")->execute($sessionIds);
                }
                $db->prepare('DELETE FROM rewrite_sessions WHERE wp_user_id = ?')->execute([$uid]);
                $db->prepare('DELETE FROM chat_sessions WHERE wp_user_id = ?')->execute([$uid]);
                $db->prepare('DELETE FROM user_connections WHERE wp_user_id = ?')->execute([$uid]);
                $db->prepare('DELETE FROM user_settings WHERE wp_user_id = ?')->execute([$uid]);
                $db->prepare('DELETE FROM user_patterns WHERE wp_user_id = ?')->execute([$uid]);
                $db->commit();
            } catch (Throwable $e) {
                $db->rollBack();
                return $this->json_response(['success' => false, 'error' => 'Delete failed.'], 500);
            }

            if (!$bridge_local && StitchSense_Platform_Client::enabled()) {
                $user = get_user_by('id', $uid);
                if ($user instanceof WP_User) {
                    $platform = StitchSense_Platform_Client::request_for_user($user, 'POST', '/user/delete-data', ['confirm' => 'DELETE']);
                    if (is_wp_error($platform)) {
                        return $this->json_response([
                            'success' => false,
                            'error' => 'WordPress deleted the user data, but the shared platform sync cleanup failed.',
                            'details' => $platform->get_error_message(),
                        ], 502);
                    }
                }
            }

            return $this->json_response(['success' => true, 'action' => 'deleted_user_data']);
        }

        /* ================================================================
           ADMIN READ MODELS
           ================================================================ */

        public function admin_list_patterns($limit = 100) {
            if (!current_user_can('manage_options')) return [];
            $limit = max(1, min(500, (int) $limit));
            $rows = [];
            $db = $this->db();
            if ($db) {
                $stmt = $db->prepare('
                    SELECT p.*,
                           (SELECT COUNT(*) FROM chat_sessions WHERE pattern_id = p.id) AS chat_count,
                           (SELECT COUNT(*) FROM rewrite_sessions WHERE pattern_id = p.id) AS rewrite_count
                    FROM user_patterns p
                    ORDER BY p.created_at DESC
                    LIMIT ?
                ');
                $stmt->execute([$limit]);
                $rows = array_map([$this, 'normalise_pattern'], $stmt->fetchAll());
            }

            $seen = [];
            foreach ($rows as $row) {
                if (!empty($row['id'])) $seen[(string) $row['id']] = true;
            }
            foreach ($this->fallback_admin_patterns() as $row) {
                $id = (string) ($row['id'] ?? '');
                if ($id && isset($seen[$id])) continue;
                $rows[] = $row;
            }

            usort($rows, function($a, $b) {
                return strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? ''));
            });
            return array_slice($rows, 0, $limit);
        }

        public function admin_list_users($limit = 100) {
            if (!current_user_can('manage_options')) return [];
            $limit = max(1, min(500, (int) $limit));
            $rows = [];
            $db = $this->db();
            if ($db) {
                $stmt = $db->prepare('
                    SELECT wp_user_id,
                           COUNT(*) AS pattern_count,
                           MAX(updated_at) AS last_activity,
                           (SELECT COUNT(*) FROM chat_sessions cs WHERE cs.wp_user_id = user_patterns.wp_user_id) AS chat_count,
                           (SELECT COUNT(*) FROM rewrite_sessions rs WHERE rs.wp_user_id = user_patterns.wp_user_id) AS rewrite_count
                    FROM user_patterns
                    GROUP BY wp_user_id
                    ORDER BY last_activity DESC
                    LIMIT ?
                ');
                $stmt->execute([$limit]);
                $rows = $stmt->fetchAll();
            }

            $byUser = [];
            foreach ($rows as $row) {
                $uid = (int) ($row['wp_user_id'] ?? 0);
                if (!$uid) continue;
                $byUser[$uid] = $row;
            }
            foreach ($this->fallback_admin_users() as $row) {
                $uid = (int) ($row['wp_user_id'] ?? 0);
                if (!$uid) continue;
                if (isset($byUser[$uid])) {
                    $byUser[$uid]['pattern_count'] = (int) ($byUser[$uid]['pattern_count'] ?? 0) + (int) ($row['pattern_count'] ?? 0);
                    $byUser[$uid]['chat_count'] = (int) ($byUser[$uid]['chat_count'] ?? 0) + (int) ($row['chat_count'] ?? 0);
                    $byUser[$uid]['rewrite_count'] = (int) ($byUser[$uid]['rewrite_count'] ?? 0) + (int) ($row['rewrite_count'] ?? 0);
                    if (strcmp((string) ($row['last_activity'] ?? ''), (string) ($byUser[$uid]['last_activity'] ?? '')) > 0) {
                        $byUser[$uid]['last_activity'] = $row['last_activity'];
                    }
                    continue;
                }
                $byUser[$uid] = $row;
            }

            $rows = array_values($byUser);
            usort($rows, function($a, $b) {
                return strcmp((string) ($b['last_activity'] ?? ''), (string) ($a['last_activity'] ?? ''));
            });
            return array_slice($rows, 0, $limit);
        }

        /* ================================================================
           USER CONNECTIONS (Ravelry — future)
           ================================================================ */

        public function list_connections(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;
            $db = $this->db();
            if (!$db) return $this->json_response(['error' => 'Database unavailable.'], 503);

            $stmt = $db->prepare('SELECT id, wp_user_id, service, token_expires, metadata, created_at FROM user_connections WHERE wp_user_id = ?');
            $stmt->execute([$uid]);
            return $this->json_response(['success' => true, 'connections' => $stmt->fetchAll()]);
        }

        public function delete_connection(WP_REST_Request $request) {
            $uid = $this->require_user();
            if (is_wp_error($uid)) return $uid;
            $db = $this->db();
            if (!$db) return $this->json_response(['error' => 'Database unavailable.'], 503);

            $id = sanitize_text_field($request->get_param('id'));
            $stmt = $db->prepare('DELETE FROM user_connections WHERE id = ? AND wp_user_id = ?');
            $stmt->execute([$id, $uid]);
            return $this->json_response(['success' => true]);
        }
    }
}
