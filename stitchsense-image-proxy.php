<?php
/**
 * Deprecated same-origin image proxy.
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
if (empty($_FILES['image']) || empty($_FILES['image']['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No image was received by the local StitchSense proxy.']);
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
    echo json_encode(['success' => false, 'error' => 'WordPress could not be loaded for the StitchSense image proxy.']);
    exit;
}

require_once $wp_load;
require_once __DIR__ . '/class-stitchsense-workflow-client.php';

$file = $_FILES['image'];
if (!empty($file['error'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Image upload failed before analysis. Upload error code: ' . intval($file['error'])]);
    exit;
}
if (!is_uploaded_file($file['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid image upload received by local proxy.']);
    exit;
}
if (!empty($file['size']) && intval($file['size']) > 50 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Image is over 50 MB.']);
    exit;
}

$bytes = file_get_contents($file['tmp_name']);
if ($bytes === false || $bytes === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Could not read image file.']);
    exit;
}

$mime = !empty($file['type']) ? sanitize_text_field(strtolower($file['type'])) : 'image/jpeg';
$payload = [
    'question' => isset($_POST['question']) ? sanitize_text_field(wp_unslash($_POST['question'])) : 'What stitch or issue is visible?',
    'session_id' => isset($_POST['session_id']) ? sanitize_text_field(wp_unslash($_POST['session_id'])) : '',
    'skill_level' => isset($_POST['skill_level']) ? sanitize_text_field(wp_unslash($_POST['skill_level'])) : 'beginner',
    'project_id' => isset($_POST['project_id']) ? sanitize_text_field(wp_unslash($_POST['project_id'])) : '',
    'original_filename' => isset($_POST['original_filename']) ? sanitize_file_name(wp_unslash($_POST['original_filename'])) : sanitize_file_name($file['name']),
    'mime_type' => $mime,
    'image_data_uri' => 'data:' . $mime . ';base64,' . base64_encode($bytes),
    'tool_mode' => 'stitch_image_analysis',
    'model' => isset($_POST['model']) ? sanitize_text_field(wp_unslash($_POST['model'])) : '',
];

$result = StitchSense_Workflow_Client::post_json('image', $payload, 180);
http_response_code(($result['status'] >= 100 && $result['status'] < 600) ? $result['status'] : 200);
echo wp_json_encode($result['payload']);
