<?php
/**
 * Deprecated same-origin chat proxy.
 * Kept only for cached legacy frontends; delegates to the server-side workflow client.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

$wp_load = '';
$dir = __DIR__;
for ($i = 0; $i < 8; $i++) {
    $candidate = $dir . '/wp-load.php';
    if (is_readable($candidate)) { $wp_load = $candidate; break; }
    $parent = dirname($dir);
    if ($parent === $dir) break;
    $dir = $parent;
}

if (!$wp_load) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'WordPress could not be loaded for the StitchSense chat proxy.']);
    exit;
}

require_once $wp_load;
require_once __DIR__ . '/class-stitchsense-workflow-client.php';

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload) && isset($_POST['payload'])) {
    $payload = json_decode((string) wp_unslash($_POST['payload']), true);
}
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid StitchSense chat payload.']);
    exit;
}

$result = StitchSense_Workflow_Client::post_json('chat', $payload, 300);
http_response_code(($result['status'] >= 100 && $result['status'] < 600) ? $result['status'] : 200);
echo wp_json_encode($result['payload']);
