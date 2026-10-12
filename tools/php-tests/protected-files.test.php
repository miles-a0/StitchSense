<?php
// Plain-PHP regression test for StitchSense_Protected_Files. Run: php tools/php-tests/protected-files.test.php

define('ABSPATH', __DIR__ . '/');
define('STITCHSENSE_PLATFORM_BRIDGE_SECRET', 'test-wordpress-secret-with-more-than-32-characters');

$GLOBALS['ss_test_uploads'] = getenv('SS_TEST_UPLOADS') ?: '';

class WP_REST_Request {
    private $params;
    public function __construct(array $params) { $this->params = $params; }
    public function get_param($key) { return $this->params[$key] ?? null; }
}
class WP_REST_Response {
    public $data;
    public $status;
    public function __construct($data, $status) { $this->data = $data; $this->status = $status; }
}
function add_action() {}
function register_rest_route() {}
function get_option($name, $default = '') { return $default; }
function trailingslashit($value) { return rtrim($value, '/\\') . '/'; }
function wp_parse_url($url) { return parse_url($url); }
function sanitize_file_name($name) { return preg_replace('/[^A-Za-z0-9._ -]/', '', $name); }
function status_header($code) { http_response_code($code); }
function wp_upload_dir($time = null, $create = true) {
    return ['basedir' => $GLOBALS['ss_test_uploads'], 'baseurl' => 'https://knit.example.test/wp-content/uploads', 'error' => false];
}

require __DIR__ . '/../../class-stitchsense-protected-files.php';

if (($argv[1] ?? '') === 'serve') {
    $result = StitchSense_Protected_Files::serve(new WP_REST_Request(['path' => $argv[2], 'expires' => $argv[3], 'sig' => $argv[4]]));
    echo 'STATUS:' . $result->status;
    exit(0);
}

$failures = 0;
function check($label, $condition) {
    global $failures;
    echo ($condition ? 'ok     ' : 'FAILED ') . $label . "\n";
    if (!$condition) $failures++;
}

// Must match signWordPressPatternFile() in the API for the same input.
check('signature matches the API implementation', StitchSense_Protected_Files::signature(
    'stitchsense/ravelry/2026/06/Hat One-12.pdf',
    1791800000,
    'test-wordpress-secret-with-more-than-32-characters'
) === '960350baffe5098f3dda7b47de8121731cb5ff85769f9336518dcec299222b14');

check('accepts per-user upload paths', StitchSense_Protected_Files::is_safe_relative_path('stitchsense/patterns/user-4/a.pdf'));
check('rejects paths outside StitchSense folders', !StitchSense_Protected_Files::is_safe_relative_path('2026/06/a.pdf'));
check('rejects parent-directory segments', !StitchSense_Protected_Files::is_safe_relative_path('stitchsense/patterns/../../wp-config.php'));
check('rejects backslashes', !StitchSense_Protected_Files::is_safe_relative_path('stitchsense\\patterns\\a.pdf'));

check('maps an uploads URL to its relative path', StitchSense_Protected_Files::relative_path_from_url(
    'https://knit.example.test/wp-content/uploads/stitchsense/ravelry/2026/06/Hat%20One-12.pdf'
) === 'stitchsense/ravelry/2026/06/Hat One-12.pdf');
check('maps a signed link to its relative path', StitchSense_Protected_Files::relative_path_from_url(
    'https://knit.example.test/wp-json/stitchsense/v1/pattern-files?path=stitchsense%2Fpatterns%2Fuser-4%2Fa.pdf&expires=1&sig=x'
) === 'stitchsense/patterns/user-4/a.pdf');
check('ignores other uploads', StitchSense_Protected_Files::relative_path_from_url(
    'https://knit.example.test/wp-content/uploads/2026/06/photo.jpg'
) === '');

$uploads = sys_get_temp_dir() . '/ss-protected-files-' . getmypid();
mkdir($uploads . '/stitchsense/patterns/user-4', 0700, true);
file_put_contents($uploads . '/stitchsense/patterns/user-4/a.pdf', "%PDF-1.4 test pattern\n");
file_put_contents($uploads . '/secret.txt', 'outside');

$serve = function ($path, $expires, $sig) use ($uploads) {
    $cmd = 'SS_TEST_UPLOADS=' . escapeshellarg($uploads) . ' ' . escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__)
        . ' serve ' . escapeshellarg($path) . ' ' . escapeshellarg((string) $expires) . ' ' . escapeshellarg($sig);
    return (string) shell_exec($cmd);
};
$valid = time() + 600;
$sign = function ($path, $expires) { return StitchSense_Protected_Files::signature($path, $expires); };

check('serves an owned file for a valid link', $serve('stitchsense/patterns/user-4/a.pdf', $valid, $sign('stitchsense/patterns/user-4/a.pdf', $valid)) === "%PDF-1.4 test pattern\n");
check('rejects an expired link', $serve('stitchsense/patterns/user-4/a.pdf', time() - 5, $sign('stitchsense/patterns/user-4/a.pdf', time() - 5)) === 'STATUS:403');
check('rejects a link valid for too long', $serve('stitchsense/patterns/user-4/a.pdf', time() + 9000000, $sign('stitchsense/patterns/user-4/a.pdf', time() + 9000000)) === 'STATUS:403');
check('rejects a tampered signature', $serve('stitchsense/patterns/user-4/a.pdf', $valid, str_repeat('a', 64)) === 'STATUS:403');
check('rejects a signature for a different file', $serve('stitchsense/patterns/user-5/a.pdf', $valid, $sign('stitchsense/patterns/user-4/a.pdf', $valid)) === 'STATUS:403');
check('rejects a signed escape attempt', $serve('stitchsense/patterns/../../secret.txt', $valid, $sign('stitchsense/patterns/../../secret.txt', $valid)) === 'STATUS:403');
check('returns 404 for a signed missing file', $serve('stitchsense/patterns/user-4/missing.pdf', $valid, $sign('stitchsense/patterns/user-4/missing.pdf', $valid)) === 'STATUS:404');

$GLOBALS['ss_test_uploads'] = $uploads;
StitchSense_Protected_Files::ensure_uploads_protected();
check('writes a deny-all .htaccess for StitchSense uploads', strpos((string) @file_get_contents($uploads . '/stitchsense/.htaccess'), 'Require all denied') !== false);

array_map('unlink', array_filter([
    $uploads . '/stitchsense/patterns/user-4/a.pdf', $uploads . '/stitchsense/.htaccess',
    $uploads . '/stitchsense/index.php', $uploads . '/secret.txt',
], 'file_exists'));
@rmdir($uploads . '/stitchsense/patterns/user-4');
@rmdir($uploads . '/stitchsense/patterns');
@rmdir($uploads . '/stitchsense');
@rmdir($uploads);

echo $failures === 0 ? "All protected-file checks passed\n" : "$failures protected-file check(s) failed\n";
exit($failures === 0 ? 0 : 1);
