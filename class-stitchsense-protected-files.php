<?php
/**
 * Serves StitchSense pattern files from WordPress uploads only through signed, expiring links.
 * Links are minted by the StitchSense API after it has checked ownership, using the shared bridge secret.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('StitchSense_Protected_Files')) {
    class StitchSense_Protected_Files {
        const ROUTE = '/pattern-files';
        const MAX_LINK_LIFETIME = 604800;
        const ROOTS = ['stitchsense/patterns/', 'stitchsense/ravelry/'];
        const HTACCESS_RULES = "# Written by StitchSense: pattern files are served only through signed links.\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n";

        public static function register() {
            add_action('rest_api_init', [__CLASS__, 'register_routes']);
            add_action('init', [__CLASS__, 'ensure_uploads_protected']);
        }

        public static function register_routes() {
            register_rest_route('stitchsense/v1', self::ROUTE, [
                'methods' => 'GET',
                'callback' => [__CLASS__, 'serve'],
                // Access is granted by the HMAC signature, verified in serve().
                'permission_callback' => '__return_true',
            ]);
        }

        private static function secret() {
            if (defined('STITCHSENSE_PLATFORM_BRIDGE_SECRET') && STITCHSENSE_PLATFORM_BRIDGE_SECRET) {
                return (string) STITCHSENSE_PLATFORM_BRIDGE_SECRET;
            }
            return (string) get_option('stitchsense_platform_bridge_secret', '');
        }

        public static function is_safe_relative_path($path) {
            if (!is_string($path) || $path === '') return false;
            $in_root = false;
            foreach (self::ROOTS as $root) {
                if (strpos($path, $root) === 0) {
                    $in_root = true;
                    break;
                }
            }
            if (!$in_root || preg_match('/[\\\\\x00-\x1f]/', $path)) return false;
            foreach (explode('/', $path) as $segment) {
                if ($segment === '' || $segment === '.' || $segment === '..') return false;
            }
            return true;
        }

        public static function signature($path, $expires, $secret = null) {
            $key = $secret === null ? self::secret() : (string) $secret;
            return hash_hmac('sha256', "stitchsense-pattern-file\n" . $path . "\n" . (int) $expires, $key);
        }

        /**
         * Maps a stored upload URL or a signed pattern-file link to its path under uploads, or '' if unmanaged.
         */
        public static function relative_path_from_url($url) {
            $url = (string) $url;
            if ($url === '') return '';
            $parts = wp_parse_url($url);
            if (!is_array($parts) || empty($parts['path'])) return '';

            if (strpos($parts['path'], '/wp-json/stitchsense/v1' . self::ROUTE) !== false) {
                parse_str((string) ($parts['query'] ?? ''), $query);
                $path = isset($query['path']) ? (string) $query['path'] : '';
                return self::is_safe_relative_path($path) ? $path : '';
            }

            $uploads = wp_upload_dir(null, false);
            if (!empty($uploads['error']) || empty($uploads['baseurl'])) return '';
            $base = wp_parse_url($uploads['baseurl']);
            $base_path = rtrim((string) ($base['path'] ?? ''), '/') . '/';
            if (strpos($parts['path'], $base_path) !== 0) return '';
            $path = rawurldecode(substr($parts['path'], strlen($base_path)));
            return self::is_safe_relative_path($path) ? $path : '';
        }

        private static function deny($status, $message) {
            return new WP_REST_Response(['success' => false, 'error' => $message], $status);
        }

        public static function serve(WP_REST_Request $request) {
            $secret = self::secret();
            if ($secret === '') {
                return self::deny(503, 'Pattern file links are not configured.');
            }

            $path = (string) $request->get_param('path');
            $expires = (int) $request->get_param('expires');
            $sig = strtolower((string) $request->get_param('sig'));
            $now = time();
            if (
                !self::is_safe_relative_path($path)
                || $expires < $now
                || $expires > $now + self::MAX_LINK_LIFETIME
                || !preg_match('/^[a-f0-9]{64}$/', $sig)
                || !hash_equals(self::signature($path, $expires, $secret), $sig)
            ) {
                return self::deny(403, 'This pattern link has expired or is not valid. Please open the pattern again.');
            }

            $uploads = wp_upload_dir(null, false);
            if (!empty($uploads['error']) || empty($uploads['basedir'])) {
                return self::deny(503, 'Pattern files are unavailable.');
            }
            $root = realpath(trailingslashit($uploads['basedir']) . 'stitchsense');
            $file = realpath(trailingslashit($uploads['basedir']) . $path);
            if (!$root || !$file || strpos($file, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($file) || !is_readable($file)) {
                return self::deny(404, 'Pattern file not found.');
            }

            $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            $types = ['pdf' => 'application/pdf', 'txt' => 'text/plain; charset=utf-8'];
            $type = $types[$extension] ?? 'application/octet-stream';
            $filename = sanitize_file_name(basename($file));

            while (ob_get_level() > 0) {
                ob_end_clean();
            }
            status_header(200);
            header('Content-Type: ' . $type);
            header('Content-Length: ' . filesize($file));
            header('Content-Disposition: inline; filename="' . $filename . '"');
            header('Cache-Control: private, max-age=300');
            header('X-Content-Type-Options: nosniff');
            header('Referrer-Policy: no-referrer');
            header('X-Robots-Tag: noindex, nofollow');
            readfile($file);
            exit;
        }

        public static function ensure_uploads_protected() {
            $uploads = wp_upload_dir(null, false);
            if (!empty($uploads['error']) || empty($uploads['basedir'])) return;
            $dir = trailingslashit($uploads['basedir']) . 'stitchsense';
            if (!is_dir($dir)) return;
            if (!file_exists($dir . '/.htaccess')) {
                @file_put_contents($dir . '/.htaccess', self::HTACCESS_RULES);
            }
            if (!file_exists($dir . '/index.php')) {
                @file_put_contents($dir . '/index.php', "<?php\n// Silence is golden.\n");
            }
        }
    }
}
