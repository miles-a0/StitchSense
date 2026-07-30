<?php
/**
 * Plugin Name: StitchSense StitchSense AI Assistant Hub Pro
 * Description: Premium StitchSense AI assistant hub with inline FilePond upload canvas and hybrid uploaded-pattern/core-knowledge chat, pattern help, stitch dictionary, gauge tools and UK metric-first guidance.
 * Version: 7.7.39
 * Author: Zu-Media
 * Text Domain: stitchsense-assistant-hub-pro
 */

if (!defined('ABSPATH')) {
    exit;
}

// v7.7.39 - In-app one-time-code password recovery bridge
require_once __DIR__ . '/class-stitchsense-library.php';
require_once __DIR__ . '/class-stitchsense-platform-client.php';
require_once __DIR__ . '/class-stitchsense-workflow-client.php';
require_once __DIR__ . '/class-stitchsense-ravelry.php';

if (!class_exists('StitchSense_Assistant_Hub_Pro_V5')) {
    final class StitchSense_Assistant_Hub_Pro_V5 {
        const VERSION = '7.7.39';
        const SHORTCODE = 'stitchsense_assistant_hub';

        const OPENROUTER_VISION_MODELS = [
            'free' => [
                ['id' => 'google/gemma-4-26b-a4b-it:free',        'name' => 'Gemma 4 26B A4B (free)'],
                ['id' => 'google/gemma-4-31b-it:free',            'name' => 'Gemma 4 31B (free)'],
                ['id' => 'moonshotai/kimi-k2.6:free',             'name' => 'Kimi K2.6 (free)'],
                ['id' => 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'name' => 'Nemotron 3 Nano Omni (free)'],
                ['id' => 'nvidia/nemotron-nano-12b-v2-vl:free',   'name' => 'Nemotron Nano 12B VL (free)'],
            ],
            'paid' => [
                ['id' => 'amazon/nova-2-lite-v1',                 'name' => 'Amazon Nova 2 Lite'],
                ['id' => 'amazon/nova-lite-v1',                   'name' => 'Amazon Nova Lite 1.0'],
                ['id' => 'amazon/nova-premier-v1',                'name' => 'Amazon Nova Premier 1.0'],
                ['id' => 'amazon/nova-pro-v1',                    'name' => 'Amazon Nova Pro 1.0'],
                ['id' => 'anthropic/claude-3-haiku',              'name' => 'Claude 3 Haiku'],
                ['id' => 'anthropic/claude-3.5-haiku',            'name' => 'Claude 3.5 Haiku'],
                ['id' => 'anthropic/claude-haiku-4.5',            'name' => 'Claude Haiku 4.5'],
                ['id' => 'anthropic/claude-opus-4',               'name' => 'Claude Opus 4'],
                ['id' => 'anthropic/claude-opus-4.1',             'name' => 'Claude Opus 4.1'],
                ['id' => 'anthropic/claude-opus-4.5',             'name' => 'Claude Opus 4.5'],
                ['id' => 'anthropic/claude-opus-4.6',             'name' => 'Claude Opus 4.6'],
                ['id' => 'anthropic/claude-opus-4.7',             'name' => 'Claude Opus 4.7'],
                ['id' => 'anthropic/claude-opus-4.8',             'name' => 'Claude Opus 4.8'],
                ['id' => 'anthropic/claude-sonnet-4',             'name' => 'Claude Sonnet 4'],
                ['id' => 'anthropic/claude-sonnet-4.5',           'name' => 'Claude Sonnet 4.5'],
                ['id' => 'anthropic/claude-sonnet-4.6',           'name' => 'Claude Sonnet 4.6'],
                ['id' => 'baidu/ernie-4.5-vl-28b-a3b',            'name' => 'ERNIE 4.5 VL 28B A3B'],
                ['id' => 'baidu/ernie-4.5-vl-424b-a47b',          'name' => 'ERNIE 4.5 VL 424B A47B'],
                ['id' => 'bytedance-seed/seed-1.6',               'name' => 'Seed 1.6'],
                ['id' => 'bytedance-seed/seed-1.6-flash',         'name' => 'Seed 1.6 Flash'],
                ['id' => 'bytedance-seed/seed-2.0-lite',          'name' => 'Seed 2.0 Lite'],
                ['id' => 'bytedance-seed/seed-2.0-mini',          'name' => 'Seed 2.0 Mini'],
                ['id' => 'google/gemini-2.5-flash',               'name' => 'Gemini 2.5 Flash (vision default)'],
                ['id' => 'google/gemini-2.5-flash-lite',          'name' => 'Gemini 2.5 Flash Lite'],
                ['id' => 'google/gemini-2.5-flash-image',         'name' => 'Gemini 2.5 Flash Image'],
                ['id' => 'google/gemini-2.5-pro',                 'name' => 'Gemini 2.5 Pro'],
                ['id' => 'google/gemini-3-flash-preview',         'name' => 'Gemini 3 Flash Preview'],
                ['id' => 'google/gemini-3.1-flash-lite',          'name' => 'Gemini 3.1 Flash Lite'],
                ['id' => 'google/gemini-3.1-pro-preview',         'name' => 'Gemini 3.1 Pro Preview'],
                ['id' => 'google/gemini-3.5-flash',               'name' => 'Gemini 3.5 Flash'],
                ['id' => 'google/gemma-3-4b-it',                  'name' => 'Gemma 3 4B'],
                ['id' => 'google/gemma-3-12b-it',                 'name' => 'Gemma 3 12B'],
                ['id' => 'google/gemma-3-27b-it',                 'name' => 'Gemma 3 27B'],
                ['id' => 'google/gemma-4-26b-a4b-it',             'name' => 'Gemma 4 26B A4B'],
                ['id' => 'google/gemma-4-31b-it',                 'name' => 'Gemma 4 31B'],
                ['id' => 'google/lyria-3-clip-preview',           'name' => 'Lyria 3 Clip Preview'],
                ['id' => 'google/lyria-3-pro-preview',            'name' => 'Lyria 3 Pro Preview'],
                ['id' => 'meta-llama/llama-3.2-11b-vision-instruct', 'name' => 'Llama 3.2 11B Vision'],
                ['id' => 'meta-llama/llama-4-maverick',           'name' => 'Llama 4 Maverick'],
                ['id' => 'meta-llama/llama-4-scout',              'name' => 'Llama 4 Scout'],
                ['id' => 'minimax/minimax-m3',                    'name' => 'MiniMax M3'],
                ['id' => 'minimax/minimax-01',                    'name' => 'MiniMax-01'],
                ['id' => 'mistralai/ministral-14b-2512',          'name' => 'Ministral 14B'],
                ['id' => 'mistralai/ministral-8b-2512',           'name' => 'Ministral 8B'],
                ['id' => 'mistralai/mistral-large-2512',          'name' => 'Mistral Large 3 2512'],
                ['id' => 'mistralai/mistral-medium-3.1',          'name' => 'Mistral Medium 3.1'],
                ['id' => 'mistralai/mistral-small-3.2-24b-instruct', 'name' => 'Mistral Small 3.2 24B'],
                ['id' => 'moonshotai/kimi-k2.6',                  'name' => 'Kimi K2.6'],
                ['id' => 'openai/gpt-4o',                         'name' => 'GPT-4o'],
                ['id' => 'openai/gpt-4o-mini',                    'name' => 'GPT-4o Mini'],
                ['id' => 'openai/gpt-4.1',                        'name' => 'GPT-4.1'],
                ['id' => 'openai/gpt-4.1-mini',                   'name' => 'GPT-4.1 Mini'],
                ['id' => 'openai/gpt-4.1-nano',                   'name' => 'GPT-4.1 Nano'],
                ['id' => 'openai/gpt-5-nano',                     'name' => 'GPT-5 Nano'],
                ['id' => 'openai/gpt-5-mini',                     'name' => 'GPT-5 Mini'],
                ['id' => 'openai/gpt-5',                          'name' => 'GPT-5'],
                ['id' => 'openai/gpt-5-pro',                      'name' => 'GPT-5 Pro'],
                ['id' => 'openai/gpt-5.1',                        'name' => 'GPT-5.1'],
                ['id' => 'openai/gpt-5.2',                        'name' => 'GPT-5.2'],
                ['id' => 'openai/gpt-5.4',                        'name' => 'GPT-5.4'],
                ['id' => 'openai/gpt-5.4-mini',                   'name' => 'GPT-5.4 Mini'],
                ['id' => 'openai/gpt-5.4-nano',                   'name' => 'GPT-5.4 Nano'],
                ['id' => 'openai/gpt-5.4-pro',                    'name' => 'GPT-5.4 Pro'],
                ['id' => 'openai/gpt-5.5',                        'name' => 'GPT-5.5'],
                ['id' => 'openai/gpt-5.5-pro',                    'name' => 'GPT-5.5 Pro'],
                ['id' => 'openai/o1',                             'name' => 'o1'],
                ['id' => 'openai/o1-pro',                         'name' => 'o1 Pro'],
                ['id' => 'openai/o3',                             'name' => 'o3'],
                ['id' => 'openai/o3-pro',                         'name' => 'o3 Pro'],
                ['id' => 'openai/o4-mini',                        'name' => 'o4 Mini'],
                ['id' => 'openai/gpt-4-turbo',                    'name' => 'GPT-4 Turbo'],
                ['id' => 'perplexity/sonar',                      'name' => 'Sonar'],
                ['id' => 'perplexity/sonar-pro',                  'name' => 'Sonar Pro'],
                ['id' => 'perplexity/sonar-pro-search',           'name' => 'Sonar Pro Search'],
                ['id' => 'perplexity/sonar-reasoning-pro',        'name' => 'Sonar Reasoning Pro'],
                ['id' => 'qwen/qwen2.5-vl-72b-instruct',          'name' => 'Qwen 2.5 VL 72B'],
                ['id' => 'qwen/qwen3-vl-30b-a3b-instruct',        'name' => 'Qwen3 VL 30B A3B'],
                ['id' => 'qwen/qwen3-vl-30b-a3b-thinking',        'name' => 'Qwen3 VL 30B A3B Thinking'],
                ['id' => 'qwen/qwen3-vl-235b-a22b-instruct',      'name' => 'Qwen3 VL 235B A22B'],
                ['id' => 'qwen/qwen3-vl-235b-a22b-thinking',      'name' => 'Qwen3 VL 235B A22B Thinking'],
                ['id' => 'qwen/qwen3-vl-32b-instruct',            'name' => 'Qwen3 VL 32B'],
                ['id' => 'qwen/qwen3.5-397b-a17b',                'name' => 'Qwen3.5 397B A17B'],
                ['id' => 'qwen/qwen3.6-flash',                    'name' => 'Qwen 3.6 Flash'],
                ['id' => 'qwen/qwen3.6-plus',                     'name' => 'Qwen 3.6 Plus'],
                ['id' => 'rekaai/reka-edge',                      'name' => 'Reka Edge'],
                ['id' => 'stepfun/step-3.7-flash',                'name' => 'Step 3.7 Flash'],
                ['id' => 'x-ai/grok-4.20',                        'name' => 'Grok 4.20'],
                ['id' => 'x-ai/grok-4.3',                         'name' => 'Grok 4.3'],
                ['id' => 'x-ai/grok-build-0.1',                   'name' => 'Grok Build 0.1'],
                ['id' => 'xiaomi/mimo-v2.5',                      'name' => 'MiMo V2.5'],
                ['id' => 'z-ai/glm-4.5v',                         'name' => 'GLM 4.5V'],
                ['id' => 'z-ai/glm-4.6v',                         'name' => 'GLM 4.6V'],
                ['id' => 'z-ai/glm-5v-turbo',                     'name' => 'GLM 5V Turbo'],
                ['id' => 'mistralai/mistral-small-2603',          'name' => 'Mistral Small 4'],
                ['id' => 'openai/gpt-5.4-image-2',                'name' => 'GPT-5.4 Image 2'],
                ['id' => 'google/gemini-3.1-flash-image-preview', 'name' => 'Gemini 3.1 Flash Image'],
                ['id' => 'google/gemini-3-pro-image-preview',     'name' => 'Gemini 3 Pro Image'],
                ['id' => 'openai/gpt-5-image',                    'name' => 'GPT-5 Image'],
                ['id' => 'openai/gpt-5-image-mini',               'name' => 'GPT-5 Image Mini'],
            ],
        ];

        const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash';
        const DEFAULT_CHAT_MODEL = 'qwen/qwen-2.5-72b-instruct';

        private static $instance = null;

        public static function instance() {
            if (self::$instance === null) {
                self::$instance = new self();
            }
            return self::$instance;
        }

        private function __construct() {
            add_shortcode(self::SHORTCODE, [$this, 'render_shortcode']);
            add_action('init', [$this, 'apply_stitchsense_cache_bypass'], 0);
            add_action('wp_enqueue_scripts', [$this, 'register_assets']);
            add_action('admin_menu', [$this, 'register_admin_menu']);
            add_action('admin_init', [$this, 'register_admin_settings']);
            add_action('admin_init', [$this, 'handle_platform_entitlement_admin_action']);
            add_action('admin_init', [$this, 'handle_promotion_admin_action']);
            add_action('admin_init', [$this, 'handle_stripe_subscription_admin_action']);
            add_action('admin_enqueue_scripts', [$this, 'register_admin_assets']);
            add_action('wp_ajax_stitchsense_image_analysis_proxy', [$this, 'image_analysis_proxy']);
            add_action('wp_ajax_nopriv_stitchsense_image_analysis_proxy', [$this, 'image_analysis_proxy']);
            add_action('wp_ajax_stitchsense_chat_proxy', [$this, 'chat_proxy']);
            add_action('wp_ajax_nopriv_stitchsense_chat_proxy', [$this, 'chat_proxy']);
            add_action('wp_ajax_stitchsense_rest_nonce', [$this, 'ajax_rest_nonce']);
            add_action('wp_ajax_nopriv_stitchsense_rest_nonce', [$this, 'ajax_rest_nonce']);
            add_action('admin_post_stitchsense_chat_proxy', [$this, 'chat_proxy']);
            add_action('admin_post_nopriv_stitchsense_chat_proxy', [$this, 'chat_proxy']);
            add_action('rest_api_init', [$this, 'register_rest_routes']);
            add_filter('rest_pre_serve_request', [$this, 'send_stitchsense_nocache_headers'], 10, 4);
        }

        private function is_stitchsense_request() {
            $requestUri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
            $action = isset($_REQUEST['action']) ? sanitize_key((string) $_REQUEST['action']) : '';

            if ($requestUri && strpos($requestUri, '/wp-json/stitchsense/v1/') !== false) {
                return true;
            }

            return in_array($action, [
                'stitchsense_image_analysis_proxy',
                'stitchsense_chat_proxy',
            ], true);
        }

        public function apply_stitchsense_cache_bypass() {
            if (!$this->is_stitchsense_request()) {
                return;
            }

            if (!defined('DONOTCACHEPAGE')) {
                define('DONOTCACHEPAGE', true);
            }

            if (!defined('DONOTCACHEOBJECT')) {
                define('DONOTCACHEOBJECT', true);
            }

            if (!defined('DONOTCACHEDB')) {
                define('DONOTCACHEDB', true);
            }
        }

        public function send_stitchsense_nocache_headers($served, $result, $request, $server) {
            if (!($request instanceof WP_REST_Request)) {
                return $served;
            }

            $route = (string) $request->get_route();
            if (strpos($route, '/stitchsense/v1/') !== 0) {
                return $served;
            }

            nocache_headers();
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0', true);
            header('Pragma: no-cache', true);
            header('Expires: Wed, 11 Jan 1984 05:00:00 GMT', true);
            header('Surrogate-Control: no-store', true);
            header('Vary: Authorization, Cookie', false);

            return $served;
        }

        public function register_admin_menu() {
            add_menu_page(
                'StitchSense Pro',
                'StitchSense Pro',
                'manage_options',
                'stitchsense-model-settings',
                [$this, 'render_admin_page'],
                'dashicons-admin-generic'
            );
            add_submenu_page(
                'stitchsense-model-settings',
                'Pattern Helper AI — LLM Model',
                'Pattern Helper AI',
                'manage_options',
                'stitchsense-model-settings',
                [$this, 'render_admin_page']
            );
            add_submenu_page(
                'stitchsense-model-settings',
                'StitchSense Library',
                'StitchSense Library',
                'manage_options',
                'stitchsense-library-admin',
                [$this, 'render_library_admin_page']
            );
            add_submenu_page(
                'stitchsense-model-settings',
                'StitchSense Users',
                'StitchSense Users',
                'manage_options',
                'stitchsense-users-admin',
                [$this, 'render_users_admin_page']
            );
            add_submenu_page(
                'stitchsense-model-settings',
                'Mobile Promotions',
                'Mobile Promotions',
                'manage_options',
                'stitchsense-promotions-admin',
                [$this, 'render_promotions_admin_page']
            );
            add_submenu_page(
                'stitchsense-model-settings',
                'Stripe Subscriptions',
                'Stripe Subscriptions',
                'manage_options',
                'stitchsense-stripe-subscriptions',
                [$this, 'render_stripe_subscriptions_page']
            );
            add_submenu_page(
                'stitchsense-model-settings',
                'Migration Export',
                'Migration Export',
                'manage_options',
                'stitchsense-migration-export',
                [$this, 'render_migration_export_page']
            );
        }

        public function register_admin_settings() {
            register_setting('stitchsense_model_settings_group', 'stitchsense_chat_model');
            register_setting('stitchsense_model_settings_group', 'stitchsense_vision_model');
            register_setting('stitchsense_model_settings_group', 'stitchsense_workflow_chat_endpoint', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_workflow_upload_endpoint', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_workflow_image_endpoint', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_workflow_secret', ['sanitize_callback' => [$this, 'sanitize_secret_setting']]);
            register_setting('stitchsense_model_settings_group', 'stitchsense_platform_api_enabled', ['sanitize_callback' => [$this, 'sanitize_checkbox_setting']]);
            register_setting('stitchsense_model_settings_group', 'stitchsense_platform_api_base_url', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_platform_bridge_secret', ['sanitize_callback' => [$this, 'sanitize_platform_secret_setting']]);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_client_id', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_client_secret', ['sanitize_callback' => [$this, 'sanitize_ravelry_secret_setting']]);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_basic_username', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_basic_password', ['sanitize_callback' => [$this, 'sanitize_ravelry_basic_password_setting']]);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_authorize_url', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_token_url', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_api_base_url', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_callback_url', ['sanitize_callback' => 'esc_url_raw']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_profile_path', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_search_path', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_detail_path', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_saved_path', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_model_settings_group', 'stitchsense_ravelry_download_paths', ['sanitize_callback' => 'sanitize_textarea_field']);

            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_stripe_mode', ['sanitize_callback' => [$this, 'sanitize_stripe_mode_setting']]);
            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_stripe_publishable_key', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_stripe_secret_key', ['sanitize_callback' => [$this, 'sanitize_stripe_secret_key_setting']]);
            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_stripe_webhook_secret', ['sanitize_callback' => [$this, 'sanitize_stripe_webhook_secret_setting']]);
            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_monthly_price_id', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_annual_price_id', ['sanitize_callback' => 'sanitize_text_field']);
            register_setting('stitchsense_stripe_subscription_settings_group', 'stitchsense_subscriptions_portal_configured', ['sanitize_callback' => [$this, 'sanitize_checkbox_setting']]);
        }

        public function sanitize_secret_setting($value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') return get_option('stitchsense_workflow_secret', '');
            return sanitize_text_field($value);
        }

        public function sanitize_platform_secret_setting($value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') return get_option('stitchsense_platform_bridge_secret', '');
            return sanitize_text_field($value);
        }

        public function sanitize_checkbox_setting($value) {
            return $value ? '1' : '0';
        }

        public function sanitize_stripe_mode_setting($value) {
            return $value === 'live' ? 'live' : 'test';
        }

        public function sanitize_stripe_secret_key_setting($value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') return get_option('stitchsense_subscriptions_stripe_secret_key', '');
            return sanitize_text_field($value);
        }

        public function sanitize_stripe_webhook_secret_setting($value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') return get_option('stitchsense_subscriptions_stripe_webhook_secret', '');
            return sanitize_text_field($value);
        }

        public function sanitize_ravelry_secret_setting($value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') return get_option('stitchsense_ravelry_client_secret', '');
            return sanitize_text_field($value);
        }

        public function sanitize_ravelry_basic_password_setting($value) {
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') return get_option('stitchsense_ravelry_basic_password', '');
            return sanitize_text_field($value);
        }

        public function register_admin_assets($hook_suffix) {
            if (strpos((string) $hook_suffix, 'stitchsense') === false) {
                return;
            }
            wp_enqueue_style(
                'stitchsense-admin-model',
                plugin_dir_url(__FILE__) . 'assets/stitchsense-hub-pro.css',
                [],
                self::VERSION
            );
            wp_add_inline_style('stitchsense-admin-model', '
                .ss-admin-wrap { max-width:900px; margin:24px 20px 0 0; font-size:15px; }
                .ss-admin-wrap h1 { font-size:26px; margin-bottom:20px; }
                .ss-admin-wrap .ss-admin-intro { margin-bottom:28px; color:#555; }
                .ss-admin-wrap .ss-admin-intro strong { color:#222; }
                .ss-admin-card { background:#fff; border:1px solid #ccd0d4; border-radius:10px; padding:28px 32px; margin-bottom:24px; box-shadow:0 1px 4px rgba(0,0,0,.04); }
                .ss-admin-card h2 { margin:0 0 8px 0; font-size:18px; }
                .ss-admin-card p { color:#555; margin:0 0 18px 0; }
                .ss-admin-card select { width:100%; max-width:560px; padding:8px 12px; font-size:14px; border-radius:6px; border:1px solid #8c8f94; }
                .ss-admin-card .ss-setting-row { margin-bottom:20px; }
                .ss-admin-card .ss-setting-row label { display:block; font-weight:600; margin-bottom:6px; }
                .ss-admin-card .ss-setting-row .ss-help { font-size:13px; color:#787c82; margin-top:4px; }
                .ss-admin-card .ss-model-search { width:100%; max-width:560px; padding:8px 12px; font-size:14px; border-radius:6px; border:1px solid #8c8f94; margin-bottom:8px; }
                .ss-admin-card .ss-model-select { width:100%; max-width:560px; padding:8px 12px; font-size:14px; border-radius:6px; border:1px solid #8c8f94; }
                .ss-admin-card .ss-model-tag { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; margin-left:6px; vertical-align:middle; }
                .ss-admin-card .ss-model-tag.free { background:#d4edda; color:#155724; }
                .ss-admin-card .ss-admin-notice { padding:12px 16px; border-left:4px solid #2271b1; background:#f0f6fc; margin:16px 0 4px 0; border-radius:4px; font-size:13px; }
                .ss-admin-card .ss-admin-notice strong { color:#0a4b78; }
                .ss-admin-card .submit-btn-wrapper { margin-top:12px; }
                .ss-admin-wrap.ss-admin-table-wrap { max-width:none; }
                .ss-admin-table-card { overflow-x:auto; }
                .ss-admin-table-card table { width:100%; }
                @media (max-width:782px) { .ss-admin-card { padding:20px; } .ss-admin-card .ss-model-search, .ss-admin-card .ss-model-select { max-width:100%; } }
            ');
            wp_add_inline_script('jquery', '
                jQuery(function($) {
                    $(".ss-model-search").on("input", function() {
                        var filter = $(this).val().toLowerCase();
                        var select = $("#" + $(this).attr("id").replace("_search", ""));
                        select.find("option, optgroup").hide();
                        select.find("optgroup[label]").each(function() {
                            var hasVisible = false;
                            $(this).find("option").each(function() {
                                var text = $(this).text().toLowerCase();
                                var val = ($(this).val() || "").toLowerCase();
                                if (filter === "" || text.indexOf(filter) !== -1 || val.indexOf(filter) !== -1) {
                                    $(this).show();
                                    hasVisible = true;
                                }
                            });
                            if (hasVisible) $(this).show();
                        });
                    });
                });
            ');
        }

        public function render_admin_page() {
            if (!current_user_can('manage_options')) {
                return;
            }

            $chatModel   = get_option('stitchsense_chat_model', '');
            $visionModel = get_option('stitchsense_vision_model', '');
            $workflowStatus = StitchSense_Workflow_Client::settings_status();
            $platformStatus = StitchSense_Platform_Client::settings_status();
            $ravelrySettings = StitchSense_Ravelry::settings();

            $currentChatLabel   = self::findModelName($chatModel)   ?: 'Default (Qwen 2.5 72B Instruct)';
            $currentVisionLabel = self::findModelName($visionModel) ?: 'Default (Gemini 2.5 Flash)';

            ?>
            <div class="wrap ss-admin-wrap">
                <h1>Pattern Helper AI — LLM Model Settings</h1>
                <p class="ss-admin-intro">
                    <strong>Choose which OpenRouter vision-capable LLM powers each feature.</strong><br>
                    Only models that support image input (vision / multimodal) are listed. Changes take effect immediately for new chat sessions.
                </p>

                <form method="post" action="options.php">
                    <?php settings_fields('stitchsense_model_settings_group'); ?>

                    <div class="ss-admin-card">
                        <h2>Chat &amp; Pattern Help Model</h2>
                        <p>Used for text-only chat questions (no pattern attached). When a pattern is uploaded and attached to the chat, the Stitch Vision Model is used instead to ensure the strongest available comprehension of pattern content. Leave empty to use the factory default (Qwen 2.5 72B Instruct).</p>

                        <div class="ss-setting-row">
                            <label for="stitchsense_chat_model">Selected model</label>
                            <?php echo self::renderModelSelect('stitchsense_chat_model', $chatModel); ?>
                            <p class="ss-help">Currently active: <strong><?php echo esc_html($currentChatLabel); ?></strong></p>
                        </div>
                    </div>

                    <div class="ss-admin-card">
                        <h2>Stitch Vision Model</h2>
                        <p>Used for the Stitch Vision tab — photo-based stitch identification, technique recognition, and mistake spotting. This model receives uploaded images.</p>

                        <div class="ss-setting-row">
                            <label for="stitchsense_vision_model">Selected model</label>
                            <?php echo self::renderModelSelect('stitchsense_vision_model', $visionModel); ?>
                            <p class="ss-help">Currently active: <strong><?php echo esc_html($currentVisionLabel); ?></strong></p>
                        </div>
                    </div>

                    <div class="ss-admin-notice">
                        <strong>Dynamic routing:</strong> The Stitch Vision model is used whenever a photo is uploaded or a pattern is attached to the chat. Text-only chat uses the Chat & Pattern Help model. Leave either selection empty to use the factory defaults — Gemini 2.5 Flash for vision/pattern analysis and Qwen 2.5 72B Instruct for text chat.
                    </div>

                    <div class="ss-admin-card">
                        <h2>Server Workflow Settings</h2>
                        <p>These values are used only by WordPress server-side proxy routes. The workflow secret is no longer sent to the browser config.</p>

                        <div class="ss-setting-row">
                            <label for="stitchsense_workflow_chat_endpoint">Chat workflow endpoint</label>
                            <input type="url" id="stitchsense_workflow_chat_endpoint" name="stitchsense_workflow_chat_endpoint" value="<?php echo esc_attr(get_option('stitchsense_workflow_chat_endpoint', '')); ?>" placeholder="<?php echo esc_attr(StitchSense_Workflow_Client::DEFAULT_CHAT_ENDPOINT); ?>" class="regular-text">
                            <p class="ss-help">Active: <code><?php echo esc_html($workflowStatus['chat_endpoint']); ?></code></p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_workflow_upload_endpoint">Upload analysis workflow endpoint</label>
                            <input type="url" id="stitchsense_workflow_upload_endpoint" name="stitchsense_workflow_upload_endpoint" value="<?php echo esc_attr(get_option('stitchsense_workflow_upload_endpoint', '')); ?>" placeholder="<?php echo esc_attr(StitchSense_Workflow_Client::DEFAULT_UPLOAD_ENDPOINT); ?>" class="regular-text">
                            <p class="ss-help">Active: <code><?php echo esc_html($workflowStatus['upload_endpoint']); ?></code></p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_workflow_image_endpoint">Image analysis workflow endpoint</label>
                            <input type="url" id="stitchsense_workflow_image_endpoint" name="stitchsense_workflow_image_endpoint" value="<?php echo esc_attr(get_option('stitchsense_workflow_image_endpoint', '')); ?>" placeholder="<?php echo esc_attr(StitchSense_Workflow_Client::DEFAULT_IMAGE_ENDPOINT); ?>" class="regular-text">
                            <p class="ss-help">Active: <code><?php echo esc_html($workflowStatus['image_endpoint']); ?></code></p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_workflow_secret">Workflow shared secret</label>
                            <input type="password" id="stitchsense_workflow_secret" name="stitchsense_workflow_secret" value="" placeholder="<?php echo $workflowStatus['has_secret'] ? esc_attr('Saved - leave blank to keep existing') : esc_attr('Enter workflow secret'); ?>" class="regular-text" autocomplete="new-password">
                            <p class="ss-help">For security, this value is stored server-side and is not printed back into the page.</p>
                        </div>
                    </div>

                    <div class="ss-admin-card">
                        <h2>StitchSense Platform API</h2>
                        <p>Optional bridge for the dedicated mobile/web platform. Leave disabled to keep the existing WordPress library behaviour unchanged.</p>

                        <div class="ss-setting-row">
                            <label>
                                <input type="hidden" name="stitchsense_platform_api_enabled" value="0">
                                <input type="checkbox" name="stitchsense_platform_api_enabled" value="1" <?php checked($platformStatus['enabled']); ?>>
                                Use shared StitchSense API for synced platform data
                            </label>
                            <p class="ss-help">When enabled, WordPress can authenticate verified WP users with the platform API so web and mobile can share the same account and library.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_platform_api_base_url">Platform API base URL</label>
                            <input type="url" id="stitchsense_platform_api_base_url" name="stitchsense_platform_api_base_url" value="<?php echo esc_attr($platformStatus['api_base_url']); ?>" placeholder="https://api.example.com" class="regular-text">
                            <p class="ss-help">Active: <code><?php echo esc_html($platformStatus['api_base_url'] ?: 'Not configured'); ?></code></p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_platform_bridge_secret">WordPress bridge shared secret</label>
                            <input type="password" id="stitchsense_platform_bridge_secret" name="stitchsense_platform_bridge_secret" value="" placeholder="<?php echo $platformStatus['has_secret'] ? esc_attr('Saved - leave blank to keep existing') : esc_attr('Enter bridge secret'); ?>" class="regular-text" autocomplete="new-password">
                            <p class="ss-help">Must match <code>WORDPRESS_BRIDGE_SHARED_SECRET</code> on the StitchSense API. This is stored server-side only.</p>
                        </div>
                    </div>

                    <div class="ss-admin-card">
                        <h2>Ravelry Integration</h2>
                        <p>Manage the developer app credentials and official OAuth/API URLs from your signed-in Ravelry developer documentation. StitchSense users will connect through OAuth; never ask users for their Ravelry password.</p>

                        <div class="ss-setting-row">
                            <label>OAuth callback URL</label>
                            <input type="text" readonly value="<?php echo esc_attr(StitchSense_Ravelry::callback_url()); ?>" class="regular-text" onclick="this.select();">
                            <p class="ss-help">Add this exact callback URL to the Ravelry developer app settings. It must match exactly, including HTTPS and path.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_callback_url">Public callback URL override</label>
                            <input type="url" id="stitchsense_ravelry_callback_url" name="stitchsense_ravelry_callback_url" value="<?php echo esc_attr(get_option('stitchsense_ravelry_callback_url', '')); ?>" placeholder="<?php echo esc_attr(rest_url('stitchsense/v1/ravelry/callback')); ?>" class="regular-text">
                            <p class="ss-help">Use this if Ravelry rejects the generated callback URL. For this site it should usually be <code>https://catlowyarns.co.uk/wp-json/stitchsense/v1/ravelry/callback</code>.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_client_id">Ravelry client ID / app key</label>
                            <input type="text" id="stitchsense_ravelry_client_id" name="stitchsense_ravelry_client_id" value="<?php echo esc_attr($ravelrySettings['client_id']); ?>" class="regular-text" autocomplete="off">
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_client_secret">Ravelry client secret</label>
                            <input type="password" id="stitchsense_ravelry_client_secret" name="stitchsense_ravelry_client_secret" value="" placeholder="<?php echo !empty($ravelrySettings['client_secret']) ? esc_attr('Saved - leave blank to keep existing') : esc_attr('Enter client secret'); ?>" class="regular-text" autocomplete="new-password">
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_basic_username">Ravelry Basic Auth read-only username / app key</label>
                            <input type="text" id="stitchsense_ravelry_basic_username" name="stitchsense_ravelry_basic_username" value="<?php echo esc_attr($ravelrySettings['basic_username']); ?>" class="regular-text" autocomplete="off">
                            <p class="ss-help">Optional but recommended: use credentials from a separate Ravelry app created as <strong>Basic Auth: Read only access</strong>. Public search and pattern metadata will try this before OAuth.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_basic_password">Ravelry Basic Auth read-only password / secret</label>
                            <input type="password" id="stitchsense_ravelry_basic_password" name="stitchsense_ravelry_basic_password" value="" placeholder="<?php echo !empty($ravelrySettings['basic_password']) ? esc_attr('Saved - leave blank to keep existing') : esc_attr('Enter Basic Auth secret'); ?>" class="regular-text" autocomplete="new-password">
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_authorize_url">OAuth authorize URL</label>
                            <input type="url" id="stitchsense_ravelry_authorize_url" name="stitchsense_ravelry_authorize_url" value="<?php echo esc_attr($ravelrySettings['authorize_url']); ?>" placeholder="Confirm in https://www.ravelry.com/api" class="regular-text">
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_token_url">OAuth token URL</label>
                            <input type="url" id="stitchsense_ravelry_token_url" name="stitchsense_ravelry_token_url" value="<?php echo esc_attr($ravelrySettings['token_url']); ?>" placeholder="Confirm in https://www.ravelry.com/api" class="regular-text">
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_api_base_url">Ravelry API base URL</label>
                            <input type="url" id="stitchsense_ravelry_api_base_url" name="stitchsense_ravelry_api_base_url" value="<?php echo esc_attr($ravelrySettings['api_base_url']); ?>" placeholder="Confirm in https://www.ravelry.com/api" class="regular-text">
                            <p class="ss-help">Example format: <code>https://api.ravelry.com</code> or the base URL shown in your Ravelry API docs.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_profile_path">Profile/API test path</label>
                            <input type="text" id="stitchsense_ravelry_profile_path" name="stitchsense_ravelry_profile_path" value="<?php echo esc_attr($ravelrySettings['profile_path']); ?>" placeholder="/current_user.json" class="regular-text">
                            <p class="ss-help">Used by the frontend status check to confirm the token can call the Ravelry API.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_search_path">Pattern search path</label>
                            <input type="text" id="stitchsense_ravelry_search_path" name="stitchsense_ravelry_search_path" value="<?php echo esc_attr($ravelrySettings['search_path']); ?>" placeholder="/patterns/search.json" class="regular-text">
                            <p class="ss-help">The plugin appends <code>query</code> and <code>page_size</code> parameters to this path.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_detail_path">Pattern detail path</label>
                            <input type="text" id="stitchsense_ravelry_detail_path" name="stitchsense_ravelry_detail_path" value="<?php echo esc_attr($ravelrySettings['detail_path']); ?>" placeholder="/patterns/{id}.json" class="regular-text">
                            <p class="ss-help">Used before importing so StitchSense can pull richer metadata, photos, and any accessible PDF/download URL.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_saved_path">Saved/library patterns path</label>
                            <input type="text" id="stitchsense_ravelry_saved_path" name="stitchsense_ravelry_saved_path" value="<?php echo esc_attr($ravelrySettings['saved_path']); ?>" placeholder="/people/{username}/library/search.json" class="regular-text">
                            <p class="ss-help">Used by the saved-pattern sync screen. The plugin replaces <code>{username}</code> with the connected Ravelry username.</p>
                        </div>

                        <div class="ss-setting-row">
                            <label for="stitchsense_ravelry_download_paths">Pattern download/source paths</label>
                            <textarea id="stitchsense_ravelry_download_paths" name="stitchsense_ravelry_download_paths" class="large-text code" rows="4" placeholder="/patterns/{id}/download.json"><?php echo esc_textarea($ravelrySettings['download_paths']); ?></textarea>
                            <p class="ss-help">Optional fallback paths tried during import when the pattern detail response does not include a PDF URL. One path per line; <code>{id}</code> is replaced with the Ravelry pattern ID.</p>
                        </div>
                    </div>

                    <p class="submit-btn-wrapper">
                        <?php submit_button('Save Model Settings'); ?>
                    </p>
                </form>
            </div>
            <?php
        }

        public function render_library_admin_page() {
            if (!current_user_can('manage_options')) {
                return;
            }
            $patterns = StitchSense_Library::instance()->admin_list_patterns(200);
            ?>
            <div class="wrap ss-admin-wrap ss-admin-table-wrap">
                <h1>StitchSense Library</h1>
                <p class="ss-admin-intro">Recent saved patterns across all WordPress users. This is a read-only operational view.</p>
                <div class="ss-admin-card ss-admin-table-card">
                    <table class="widefat striped">
                        <thead><tr><th>Date</th><th>User</th><th>Title</th><th>File</th><th>Craft</th><th>Source</th><th>Chats</th><th>Rewrites</th><th>Archived</th></tr></thead>
                        <tbody>
                        <?php if (empty($patterns)) : ?>
                            <tr><td colspan="9">No library patterns found yet.</td></tr>
                        <?php else : foreach ($patterns as $pattern) :
                            $user = get_user_by('id', (int) ($pattern['wp_user_id'] ?? 0));
                            $fileUrl = esc_url($pattern['file_url'] ?? '');
                            ?>
                            <tr>
                                <td><?php echo esc_html($pattern['created_at'] ?? ''); ?></td>
                                <td><?php echo esc_html($user ? $user->display_name : ('User #' . ($pattern['wp_user_id'] ?? ''))); ?></td>
                                <td><strong><?php echo esc_html($pattern['title'] ?? 'Untitled'); ?></strong><br><small><?php echo esc_html($pattern['original_filename'] ?? ''); ?></small></td>
                                <td>
                                    <?php if ($fileUrl) : ?>
                                        <a href="<?php echo $fileUrl; ?>" target="_blank" rel="noopener noreferrer">Open pattern</a>
                                    <?php else : ?>
                                        &mdash;
                                    <?php endif; ?>
                                </td>
                                <td><?php echo esc_html($pattern['craft_type'] ?? ''); ?></td>
                                <td><?php echo esc_html($pattern['source'] ?? ''); ?></td>
                                <td><?php echo esc_html($pattern['chat_count'] ?? 0); ?></td>
                                <td><?php echo esc_html($pattern['rewrite_count'] ?? 0); ?></td>
                                <td><?php echo !empty($pattern['is_archived']) ? 'Yes' : 'No'; ?></td>
                            </tr>
                        <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <?php
        }

        private function default_promotion_slots() {
            return [
                [
                    'id' => 'promo_1',
                    'enabled' => false,
                    'title' => '',
                    'body' => '',
                    'image_url' => '',
                    'button_label' => 'View offer',
                    'starts_at' => '',
                    'ends_at' => '',
                    'audience' => 'all',
                    'action_type' => 'url',
                    'action_url' => '',
                    'app_route' => '',
                    'checkout_plan' => 'annual',
                    'promo_code' => '',
                    'stripe_coupon_id' => '',
                    'stripe_promotion_code_id' => '',
                    'dismiss_key' => '',
                ],
                [
                    'id' => 'promo_2',
                    'enabled' => false,
                    'title' => '',
                    'body' => '',
                    'image_url' => '',
                    'button_label' => 'View offer',
                    'starts_at' => '',
                    'ends_at' => '',
                    'audience' => 'all',
                    'action_type' => 'checkout',
                    'action_url' => '',
                    'app_route' => '',
                    'checkout_plan' => 'annual',
                    'promo_code' => '',
                    'stripe_coupon_id' => '',
                    'stripe_promotion_code_id' => '',
                    'dismiss_key' => '',
                ],
                [
                    'id' => 'promo_3',
                    'enabled' => false,
                    'title' => '',
                    'body' => '',
                    'image_url' => '',
                    'button_label' => 'View offer',
                    'starts_at' => '',
                    'ends_at' => '',
                    'audience' => 'all',
                    'action_type' => 'app_route',
                    'action_url' => '',
                    'app_route' => '/paywall',
                    'checkout_plan' => 'annual',
                    'promo_code' => '',
                    'stripe_coupon_id' => '',
                    'stripe_promotion_code_id' => '',
                    'dismiss_key' => '',
                ],
            ];
        }

        private function promotion_slots() {
            $saved = get_option('stitchsense_mobile_promotions', []);
            $saved = is_array($saved) ? $saved : [];
            $defaults = $this->default_promotion_slots();
            foreach ($defaults as $index => $default) {
                if (isset($saved[$index]) && is_array($saved[$index])) {
                    $defaults[$index] = array_merge($default, $saved[$index]);
                }
            }
            return $defaults;
        }

        private function sanitize_promotion_slot($slot, $fallback_id) {
            $slot = is_array($slot) ? $slot : [];
            $action_type = sanitize_key((string) ($slot['action_type'] ?? 'url'));
            if (!in_array($action_type, ['url', 'checkout', 'app_route'], true)) {
                $action_type = 'url';
            }
            $audience = sanitize_key((string) ($slot['audience'] ?? 'all'));
            if (!in_array($audience, ['all', 'trial', 'free', 'pro'], true)) {
                $audience = 'all';
            }
            $checkout_plan = sanitize_key((string) ($slot['checkout_plan'] ?? 'annual'));
            if (!in_array($checkout_plan, ['monthly', 'annual'], true)) {
                $checkout_plan = 'annual';
            }
            $dismiss_key = sanitize_key((string) ($slot['dismiss_key'] ?? ''));
            return [
                'id' => sanitize_key((string) ($slot['id'] ?? $fallback_id)),
                'enabled' => !empty($slot['enabled']),
                'title' => sanitize_text_field((string) ($slot['title'] ?? '')),
                'body' => sanitize_textarea_field((string) ($slot['body'] ?? '')),
                'image_url' => esc_url_raw((string) ($slot['image_url'] ?? '')),
                'button_label' => sanitize_text_field((string) ($slot['button_label'] ?? 'View offer')),
                'starts_at' => sanitize_text_field((string) ($slot['starts_at'] ?? '')),
                'ends_at' => sanitize_text_field((string) ($slot['ends_at'] ?? '')),
                'audience' => $audience,
                'action_type' => $action_type,
                'action_url' => esc_url_raw((string) ($slot['action_url'] ?? '')),
                'app_route' => sanitize_text_field((string) ($slot['app_route'] ?? '')),
                'checkout_plan' => $checkout_plan,
                'promo_code' => sanitize_text_field((string) ($slot['promo_code'] ?? '')),
                'stripe_coupon_id' => sanitize_text_field((string) ($slot['stripe_coupon_id'] ?? '')),
                'stripe_promotion_code_id' => sanitize_text_field((string) ($slot['stripe_promotion_code_id'] ?? '')),
                'dismiss_key' => $dismiss_key,
            ];
        }

        private function stripe_subscription_settings() {
            return [
                'mode' => get_option('stitchsense_subscriptions_stripe_mode', 'test') === 'live' ? 'live' : 'test',
                'publishable_key' => (string) get_option('stitchsense_subscriptions_stripe_publishable_key', ''),
                'secret_key' => (string) get_option('stitchsense_subscriptions_stripe_secret_key', ''),
                'webhook_secret' => (string) get_option('stitchsense_subscriptions_stripe_webhook_secret', ''),
                'monthly_price_id' => (string) get_option('stitchsense_subscriptions_monthly_price_id', ''),
                'annual_price_id' => (string) get_option('stitchsense_subscriptions_annual_price_id', ''),
                'portal_configured' => get_option('stitchsense_subscriptions_portal_configured', '') === '1',
            ];
        }

        private function mask_secret_value($value) {
            $value = (string) $value;
            if ($value === '') return 'Not set';
            $length = strlen($value);
            if ($length <= 10) return str_repeat('*', $length);
            return substr($value, 0, 6) . str_repeat('*', max(4, $length - 10)) . substr($value, -4);
        }

        private function stripe_key_mode($key) {
            $key = (string) $key;
            if (strpos($key, '_live_') !== false) return 'live';
            if (strpos($key, '_test_') !== false) return 'test';
            return 'unknown';
        }

        private function stripe_subscription_env_block($settings) {
            return implode("\n", [
                'STRIPE_SECRET_KEY=' . ($settings['secret_key'] ? $this->mask_secret_value($settings['secret_key']) : 'sk_test_or_live_...'),
                'STRIPE_WEBHOOK_SECRET=' . ($settings['webhook_secret'] ? $this->mask_secret_value($settings['webhook_secret']) : 'whsec_...'),
                'STRIPE_MONTHLY_PRICE_ID=' . ($settings['monthly_price_id'] ?: 'price_...'),
                'STRIPE_ANNUAL_PRICE_ID=' . ($settings['annual_price_id'] ?: 'price_...'),
            ]);
        }

        private function stripe_price_lookup($secret_key, $price_id) {
            if ($secret_key === '' || $price_id === '') {
                return ['ok' => false, 'message' => 'Missing key or price ID.'];
            }
            $response = wp_remote_get('https://api.stripe.com/v1/prices/' . rawurlencode($price_id), [
                'timeout' => 20,
                'headers' => [
                    'authorization' => 'Bearer ' . $secret_key,
                    'accept' => 'application/json',
                ],
            ]);
            if (is_wp_error($response)) {
                return ['ok' => false, 'message' => $response->get_error_message()];
            }
            $code = (int) wp_remote_retrieve_response_code($response);
            $payload = json_decode((string) wp_remote_retrieve_body($response), true);
            if ($code < 200 || $code >= 300) {
                $message = is_array($payload) ? (string) ($payload['error']['message'] ?? $payload['message'] ?? 'Stripe rejected the request.') : 'Stripe rejected the request.';
                return ['ok' => false, 'message' => 'HTTP ' . $code . ': ' . $message];
            }
            $currency = strtoupper((string) ($payload['currency'] ?? ''));
            $amount = isset($payload['unit_amount']) ? number_format(((int) $payload['unit_amount']) / 100, 2) : 'unknown';
            $interval = (string) ($payload['recurring']['interval'] ?? 'one-off');
            $active = !empty($payload['active']) ? 'active' : 'inactive';
            return [
                'ok' => true,
                'message' => $active . ' price, ' . $currency . ' ' . $amount . ' / ' . $interval,
            ];
        }

        private function stripe_subscription_diagnostics($run_remote_checks = false) {
            $settings = $this->stripe_subscription_settings();
            $mode = $settings['mode'];
            $secret_mode = $this->stripe_key_mode($settings['secret_key']);
            $publishable_mode = $this->stripe_key_mode($settings['publishable_key']);
            $rows = [];

            $rows[] = [
                'label' => 'Selected Stripe mode',
                'ok' => in_array($mode, ['test', 'live'], true),
                'message' => strtoupper($mode),
            ];
            $rows[] = [
                'label' => 'Publishable key',
                'ok' => $settings['publishable_key'] !== '' && ($publishable_mode === $mode || $publishable_mode === 'unknown'),
                'message' => $this->mask_secret_value($settings['publishable_key']) . ' (' . $publishable_mode . ')',
            ];
            $rows[] = [
                'label' => 'Secret key',
                'ok' => $settings['secret_key'] !== '' && ($secret_mode === $mode || $secret_mode === 'unknown'),
                'message' => $this->mask_secret_value($settings['secret_key']) . ' (' . $secret_mode . ')',
            ];
            $rows[] = [
                'label' => 'Webhook signing secret',
                'ok' => $settings['webhook_secret'] !== '' && strpos($settings['webhook_secret'], 'whsec_') === 0,
                'message' => $this->mask_secret_value($settings['webhook_secret']),
            ];
            $rows[] = [
                'label' => 'Monthly price ID',
                'ok' => strpos($settings['monthly_price_id'], 'price_') === 0,
                'message' => $settings['monthly_price_id'] ?: 'Not set',
            ];
            $rows[] = [
                'label' => 'Annual price ID',
                'ok' => strpos($settings['annual_price_id'], 'price_') === 0,
                'message' => $settings['annual_price_id'] ?: 'Not set',
            ];
            $rows[] = [
                'label' => 'Customer portal',
                'ok' => $settings['portal_configured'],
                'message' => $settings['portal_configured'] ? 'Marked as configured in Stripe Dashboard' : 'Tick this after configuring cancel-at-period-end subscription management.',
            ];

            if ($run_remote_checks) {
                $monthly = $this->stripe_price_lookup($settings['secret_key'], $settings['monthly_price_id']);
                $annual = $this->stripe_price_lookup($settings['secret_key'], $settings['annual_price_id']);
                $rows[] = ['label' => 'Stripe monthly price check', 'ok' => $monthly['ok'], 'message' => $monthly['message']];
                $rows[] = ['label' => 'Stripe annual price check', 'ok' => $annual['ok'], 'message' => $annual['message']];
            }

            return $rows;
        }

        private function admin_stripe_page_url($args = []) {
            return add_query_arg(array_merge(['page' => 'stitchsense-stripe-subscriptions'], $args), admin_url('admin.php'));
        }

        public function handle_stripe_subscription_admin_action() {
            if (!is_admin() || !current_user_can('manage_options')) {
                return;
            }
            $action = isset($_POST['stitchsense_stripe_subscription_action']) ? sanitize_text_field(wp_unslash($_POST['stitchsense_stripe_subscription_action'])) : '';
            if ($action !== 'run_diagnostics') {
                return;
            }
            check_admin_referer('stitchsense_stripe_subscription_diagnostics');
            set_transient('stitchsense_stripe_subscription_diagnostics', $this->stripe_subscription_diagnostics(true), 5 * MINUTE_IN_SECONDS);
            wp_safe_redirect($this->admin_stripe_page_url(['ss_notice' => 'diagnostics_run']));
            exit;
        }

        public function render_stripe_subscriptions_page() {
            if (!current_user_can('manage_options')) {
                wp_die('You do not have permission to access this page.');
            }
            $settings = $this->stripe_subscription_settings();
            $diagnostics = get_transient('stitchsense_stripe_subscription_diagnostics');
            if (!is_array($diagnostics)) {
                $diagnostics = $this->stripe_subscription_diagnostics(false);
            }
            $platform_status = class_exists('StitchSense_Platform_Client') ? StitchSense_Platform_Client::settings_status() : ['ready' => false, 'api_base_url' => ''];
            ?>
            <div class="wrap ss-admin-wrap">
                <h1>StitchSense Stripe Subscriptions</h1>
                <p class="ss-admin-intro">Use this page for the separate Stripe account that powers StitchSense app subscriptions. Do not paste WooCommerce Stripe keys here unless you intentionally want the app to use that same Stripe account.</p>
                <?php if (isset($_GET['settings-updated'])) : ?>
                    <div class="notice notice-success"><p>Subscription Stripe settings saved.</p></div>
                <?php endif; ?>
                <?php if (isset($_GET['ss_notice']) && $_GET['ss_notice'] === 'diagnostics_run') : ?>
                    <div class="notice notice-info"><p>Stripe diagnostics refreshed.</p></div>
                <?php endif; ?>

                <div class="ss-admin-card">
                    <h2>Connection Status</h2>
                    <table class="widefat striped">
                        <tbody>
                            <tr>
                                <td><strong>Platform API</strong></td>
                                <td><?php echo !empty($platform_status['ready']) ? '<span style="color:#008a20;font-weight:700;">OK</span>' : '<span style="color:#b32d2e;font-weight:700;">Needs attention</span>'; ?></td>
                                <td><?php echo esc_html((string) ($platform_status['api_base_url'] ?? '')); ?></td>
                            </tr>
                            <?php foreach ($diagnostics as $row) : ?>
                                <tr>
                                    <td><strong><?php echo esc_html((string) $row['label']); ?></strong></td>
                                    <td><?php echo !empty($row['ok']) ? '<span style="color:#008a20;font-weight:700;">OK</span>' : '<span style="color:#b32d2e;font-weight:700;">Needs attention</span>'; ?></td>
                                    <td><?php echo esc_html((string) $row['message']); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <form method="post" action="<?php echo esc_url(admin_url('admin.php?page=stitchsense-stripe-subscriptions')); ?>" style="margin-top:16px;">
                        <?php wp_nonce_field('stitchsense_stripe_subscription_diagnostics'); ?>
                        <input type="hidden" name="stitchsense_stripe_subscription_action" value="run_diagnostics">
                        <?php submit_button('Test Stripe Price IDs', 'secondary', 'submit', false); ?>
                    </form>
                </div>

                <form method="post" action="options.php">
                    <?php settings_fields('stitchsense_stripe_subscription_settings_group'); ?>
                    <div class="ss-admin-card">
                        <h2>Stripe Account</h2>
                        <div class="ss-setting-row">
                            <label>Mode</label>
                            <select name="stitchsense_subscriptions_stripe_mode">
                                <option value="test" <?php selected($settings['mode'], 'test'); ?>>Test / sandbox</option>
                                <option value="live" <?php selected($settings['mode'], 'live'); ?>>Live</option>
                            </select>
                            <p class="ss-help">Use test mode while checking dummy card payments. Switch to live only after checkout, webhooks, access refresh, and cancellation are proven.</p>
                        </div>
                        <div class="ss-setting-row">
                            <label>Publishable key</label>
                            <input type="text" name="stitchsense_subscriptions_stripe_publishable_key" value="<?php echo esc_attr($settings['publishable_key']); ?>" class="regular-text" placeholder="pk_test_...">
                        </div>
                        <div class="ss-setting-row">
                            <label>Secret key</label>
                            <input type="password" name="stitchsense_subscriptions_stripe_secret_key" value="" class="regular-text" placeholder="<?php echo esc_attr($this->mask_secret_value($settings['secret_key'])); ?>">
                            <p class="ss-help">Leave blank to keep the saved key. This is separate from WooCommerce Stripe.</p>
                        </div>
                        <div class="ss-setting-row">
                            <label>Webhook signing secret</label>
                            <input type="password" name="stitchsense_subscriptions_stripe_webhook_secret" value="" class="regular-text" placeholder="<?php echo esc_attr($this->mask_secret_value($settings['webhook_secret'])); ?>">
                            <p class="ss-help">Starts with whsec_. Leave blank to keep the saved value.</p>
                        </div>
                    </div>

                    <div class="ss-admin-card">
                        <h2>Subscription Prices</h2>
                        <div class="ss-setting-row">
                            <label>Monthly Stripe price ID</label>
                            <input type="text" name="stitchsense_subscriptions_monthly_price_id" value="<?php echo esc_attr($settings['monthly_price_id']); ?>" class="regular-text" placeholder="price_...">
                            <p class="ss-help">The app currently displays £10 per month.</p>
                        </div>
                        <div class="ss-setting-row">
                            <label>Annual Stripe price ID</label>
                            <input type="text" name="stitchsense_subscriptions_annual_price_id" value="<?php echo esc_attr($settings['annual_price_id']); ?>" class="regular-text" placeholder="price_...">
                            <p class="ss-help">The app currently displays £96 per year.</p>
                        </div>
                        <div class="ss-setting-row">
                            <label>
                                <input type="checkbox" name="stitchsense_subscriptions_portal_configured" value="1" <?php checked($settings['portal_configured']); ?>>
                                Stripe Customer Portal is configured for cancel-at-period-end subscription management.
                            </label>
                        </div>
                    </div>

                    <div class="ss-admin-card">
                        <h2>VPS Environment Values</h2>
                        <p>The mobile API reads Stripe settings from <code>stitchsense-api/.env.vps</code>. Use the same separate subscription Stripe account values there.</p>
                        <textarea class="large-text code" rows="5" readonly><?php echo esc_textarea($this->stripe_subscription_env_block($settings)); ?></textarea>
                        <p class="ss-help">Secrets are masked here. Copy the real values from Stripe Dashboard when editing the VPS env file.</p>
                    </div>

                    <?php submit_button('Save Stripe Subscription Settings'); ?>
                </form>
            </div>
            <?php
        }

        public function handle_promotion_admin_action() {
            if (!is_admin() || !current_user_can('manage_options')) {
                return;
            }
            $action = isset($_POST['stitchsense_promotion_admin_action']) ? sanitize_text_field(wp_unslash($_POST['stitchsense_promotion_admin_action'])) : '';
            if ($action !== 'save_promotions') {
                return;
            }
            check_admin_referer('stitchsense_promotion_admin');
            $raw_promos = isset($_POST['promotions']) && is_array($_POST['promotions']) ? wp_unslash($_POST['promotions']) : [];
            $saved = [];
            foreach ($this->default_promotion_slots() as $index => $default) {
                $saved[] = $this->sanitize_promotion_slot($raw_promos[$index] ?? [], $default['id']);
            }
            update_option('stitchsense_mobile_promotions', $saved, false);
            wp_safe_redirect(add_query_arg(['page' => 'stitchsense-promotions-admin', 'ss_notice' => 'promotions_saved'], admin_url('admin.php')));
            exit;
        }

        public function render_promotions_admin_page() {
            if (!current_user_can('manage_options')) {
                return;
            }
            $promotions = $this->promotion_slots();
            ?>
            <div class="wrap ss-admin-wrap">
                <h1>Mobile Promotions</h1>
                <p class="ss-admin-intro">Create image-led promo popups for the mobile app. The app supports safe actions: open a URL, open checkout with an optional Stripe coupon/promotion code ID, or open an app route. Arbitrary JavaScript/PHP is intentionally not executed in the mobile app.</p>
                <?php if (isset($_GET['ss_notice']) && $_GET['ss_notice'] === 'promotions_saved') : ?>
                    <div class="notice notice-success"><p>Promotions saved.</p></div>
                <?php endif; ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin.php?page=stitchsense-promotions-admin')); ?>">
                    <?php wp_nonce_field('stitchsense_promotion_admin'); ?>
                    <input type="hidden" name="stitchsense_promotion_admin_action" value="save_promotions">
                    <?php foreach ($promotions as $index => $promo) : ?>
                        <div class="ss-admin-card">
                            <h2>Promo slot <?php echo esc_html((string) ($index + 1)); ?></h2>
                            <div class="ss-setting-row">
                                <label>
                                    <input type="checkbox" name="promotions[<?php echo esc_attr((string) $index); ?>][enabled]" value="1" <?php checked(!empty($promo['enabled'])); ?>>
                                    Active
                                </label>
                            </div>
                            <input type="hidden" name="promotions[<?php echo esc_attr((string) $index); ?>][id]" value="<?php echo esc_attr((string) $promo['id']); ?>">
                            <div class="ss-setting-row">
                                <label>Title</label>
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][title]" value="<?php echo esc_attr((string) $promo['title']); ?>" class="regular-text">
                            </div>
                            <div class="ss-setting-row">
                                <label>Body copy</label>
                                <textarea name="promotions[<?php echo esc_attr((string) $index); ?>][body]" rows="3" class="large-text"><?php echo esc_textarea((string) $promo['body']); ?></textarea>
                            </div>
                            <div class="ss-setting-row">
                                <label>Promo JPG/image URL</label>
                                <input type="url" name="promotions[<?php echo esc_attr((string) $index); ?>][image_url]" value="<?php echo esc_attr((string) $promo['image_url']); ?>" class="regular-text" placeholder="https://example.com/promo.jpg">
                            </div>
                            <div class="ss-setting-row">
                                <label>Button label</label>
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][button_label]" value="<?php echo esc_attr((string) $promo['button_label']); ?>" class="regular-text">
                            </div>
                            <div class="ss-setting-row">
                                <label>Schedule</label>
                                <input type="datetime-local" name="promotions[<?php echo esc_attr((string) $index); ?>][starts_at]" value="<?php echo esc_attr((string) $promo['starts_at']); ?>">
                                <input type="datetime-local" name="promotions[<?php echo esc_attr((string) $index); ?>][ends_at]" value="<?php echo esc_attr((string) $promo['ends_at']); ?>">
                                <p class="ss-help">Leave blank to show whenever active. Times use the WordPress site timezone.</p>
                            </div>
                            <div class="ss-setting-row">
                                <label>Audience</label>
                                <select name="promotions[<?php echo esc_attr((string) $index); ?>][audience]">
                                    <?php foreach (['all' => 'All users', 'trial' => 'Trial users', 'free' => 'Free/expired users', 'pro' => 'Pro users'] as $value => $label) : ?>
                                        <option value="<?php echo esc_attr($value); ?>" <?php selected((string) $promo['audience'], $value); ?>><?php echo esc_html($label); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div class="ss-setting-row">
                                <label>Action type</label>
                                <select name="promotions[<?php echo esc_attr((string) $index); ?>][action_type]">
                                    <?php foreach (['url' => 'Open URL', 'checkout' => 'Open checkout', 'app_route' => 'Open app route'] as $value => $label) : ?>
                                        <option value="<?php echo esc_attr($value); ?>" <?php selected((string) $promo['action_type'], $value); ?>><?php echo esc_html($label); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div class="ss-setting-row">
                                <label>Action URL</label>
                                <input type="url" name="promotions[<?php echo esc_attr((string) $index); ?>][action_url]" value="<?php echo esc_attr((string) $promo['action_url']); ?>" class="regular-text">
                            </div>
                            <div class="ss-setting-row">
                                <label>App route</label>
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][app_route]" value="<?php echo esc_attr((string) $promo['app_route']); ?>" class="regular-text" placeholder="/paywall or /(tabs)/stash">
                            </div>
                            <div class="ss-setting-row">
                                <label>Checkout plan</label>
                                <select name="promotions[<?php echo esc_attr((string) $index); ?>][checkout_plan]">
                                    <option value="annual" <?php selected((string) $promo['checkout_plan'], 'annual'); ?>>Annual</option>
                                    <option value="monthly" <?php selected((string) $promo['checkout_plan'], 'monthly'); ?>>Monthly</option>
                                </select>
                            </div>
                            <div class="ss-setting-row">
                                <label>Promo code / Stripe IDs</label>
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][promo_code]" value="<?php echo esc_attr((string) $promo['promo_code']); ?>" class="regular-text" placeholder="Public code label, e.g. SUMMER25">
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][stripe_coupon_id]" value="<?php echo esc_attr((string) $promo['stripe_coupon_id']); ?>" class="regular-text" placeholder="Stripe coupon ID, e.g. coupon_...">
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][stripe_promotion_code_id]" value="<?php echo esc_attr((string) $promo['stripe_promotion_code_id']); ?>" class="regular-text" placeholder="Stripe promotion code ID, e.g. promo_...">
                                <p class="ss-help">For automatic Stripe discounts use the Stripe coupon ID or promotion code ID, not just the visible code text. If only the public code is set, checkout will allow the user to enter it manually.</p>
                            </div>
                            <div class="ss-setting-row">
                                <label>Dismiss key</label>
                                <input type="text" name="promotions[<?php echo esc_attr((string) $index); ?>][dismiss_key]" value="<?php echo esc_attr((string) $promo['dismiss_key']); ?>" class="regular-text" placeholder="summer-2026-v1">
                                <p class="ss-help">Change this when you want users who dismissed an older promo to see the new version.</p>
                            </div>
                        </div>
                    <?php endforeach; ?>
                    <?php submit_button('Save Promotions'); ?>
                </form>
            </div>
            <?php
        }

        private function active_mobile_promotions_payload($wp_user_id = 0) {
            $now = current_time('timestamp');
            $promotions = [];
            foreach ($this->promotion_slots() as $promo) {
                if (empty($promo['enabled']) || empty($promo['image_url'])) {
                    continue;
                }
                $starts = !empty($promo['starts_at']) ? strtotime((string) $promo['starts_at']) : false;
                $ends = !empty($promo['ends_at']) ? strtotime((string) $promo['ends_at']) : false;
                if ($starts && $starts > $now) continue;
                if ($ends && $ends < $now) continue;

                $promotions[] = [
                    'id' => sanitize_key((string) $promo['id']),
                    'title' => sanitize_text_field((string) $promo['title']),
                    'body' => sanitize_textarea_field((string) $promo['body']),
                    'imageUrl' => esc_url_raw((string) $promo['image_url']),
                    'buttonLabel' => sanitize_text_field((string) $promo['button_label']),
                    'audience' => sanitize_key((string) $promo['audience']),
                    'startsAt' => sanitize_text_field((string) $promo['starts_at']),
                    'endsAt' => sanitize_text_field((string) $promo['ends_at']),
                    'dismissKey' => sanitize_key((string) ($promo['dismiss_key'] ?: $promo['id'])),
                    'action' => [
                        'type' => sanitize_key((string) $promo['action_type']),
                        'url' => esc_url_raw((string) $promo['action_url']),
                        'appRoute' => sanitize_text_field((string) $promo['app_route']),
                        'checkoutPlan' => sanitize_key((string) $promo['checkout_plan']),
                        'promoCode' => sanitize_text_field((string) $promo['promo_code']),
                        'couponId' => sanitize_text_field((string) $promo['stripe_coupon_id']),
                        'promotionCodeId' => sanitize_text_field((string) $promo['stripe_promotion_code_id']),
                    ],
                ];
            }
            return [
                'success' => true,
                'wpUserId' => (int) $wp_user_id,
                'promotions' => $promotions,
            ];
        }

        private function platform_admin_error_message($error) {
            if ($error instanceof WP_Error) {
                $data = $error->get_error_data();
                if (is_array($data) && !empty($data['payload'])) {
                    $payload = $data['payload'];
                    if (is_array($payload)) {
                        $message = $payload['error'] ?? $payload['message'] ?? null;
                        if (is_string($message) && $message !== '') {
                            return $message;
                        }
                    }
                }
                return $error->get_error_message();
            }
            return 'The StitchSense platform request failed.';
        }

        private function admin_users_page_url($args = []) {
            $base = ['page' => 'stitchsense-users-admin'];
            return add_query_arg(array_merge($base, $args), admin_url('admin.php'));
        }

        public function handle_platform_entitlement_admin_action() {
            if (!is_admin() || !current_user_can('manage_options')) {
                return;
            }

            $action = isset($_POST['stitchsense_platform_admin_action']) ? sanitize_text_field(wp_unslash($_POST['stitchsense_platform_admin_action'])) : '';
            if ($action === '') {
                return;
            }

            check_admin_referer('stitchsense_platform_entitlement_admin');

            $manage_user_id = isset($_POST['manage_user_id']) ? (int) $_POST['manage_user_id'] : 0;
            $redirect_args = ['manage_user_id' => $manage_user_id];

            if (!class_exists('StitchSense_Platform_Client')) {
                $redirect_args['ss_notice'] = 'error';
                $redirect_args['ss_message'] = 'The StitchSense platform client is not available in this build.';
                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }

            $status = StitchSense_Platform_Client::settings_status();
            if (empty($status['ready'])) {
                $redirect_args['ss_notice'] = 'error';
                $redirect_args['ss_message'] = 'The StitchSense Platform API is not enabled or fully configured yet.';
                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }

            $wp_user = $manage_user_id > 0 ? get_user_by('id', $manage_user_id) : false;
            if (!($wp_user instanceof WP_User) || empty($wp_user->ID)) {
                $redirect_args['ss_notice'] = 'error';
                $redirect_args['ss_message'] = 'Choose a valid WordPress user first.';
                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }

            $platform_me = StitchSense_Platform_Client::request_for_user($wp_user, 'GET', 'me');
            if (is_wp_error($platform_me)) {
                $redirect_args['ss_notice'] = 'error';
                $redirect_args['ss_message'] = $this->platform_admin_error_message($platform_me);
                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }

            $platform_user_id = sanitize_text_field((string) ($platform_me['user']['id'] ?? ''));
            if ($platform_user_id === '') {
                $redirect_args['ss_notice'] = 'error';
                $redirect_args['ss_message'] = 'The selected user could not be linked to a platform account.';
                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }

            if ($action === 'grant_entitlement') {
                $preset = isset($_POST['entitlement_preset']) ? sanitize_text_field(wp_unslash($_POST['entitlement_preset'])) : '';
                $reason = isset($_POST['entitlement_reason']) ? sanitize_text_field(wp_unslash($_POST['entitlement_reason'])) : '';
                $custom_expires = isset($_POST['custom_expires_at']) ? sanitize_text_field(wp_unslash($_POST['custom_expires_at'])) : '';

                $type = 'extended_trial';
                $expires_at = null;

                switch ($preset) {
                    case 'lifetime_pro':
                        $type = 'lifetime_pro';
                        $expires_at = null;
                        break;
                    case 'extended_trial_3m':
                        $type = 'extended_trial';
                        $expires_at = gmdate('c', strtotime('+3 months'));
                        break;
                    case 'extended_trial_6m':
                        $type = 'extended_trial';
                        $expires_at = gmdate('c', strtotime('+6 months'));
                        break;
                    case 'courtesy_access':
                        $type = 'courtesy_access';
                        $expires_at = null;
                        break;
                    case 'custom_trial':
                        $type = 'extended_trial';
                        $expires_at = $custom_expires !== '' ? gmdate('c', strtotime($custom_expires)) : null;
                        break;
                    case 'custom_courtesy':
                        $type = 'courtesy_access';
                        $expires_at = $custom_expires !== '' ? gmdate('c', strtotime($custom_expires)) : null;
                        break;
                    default:
                        $redirect_args['ss_notice'] = 'error';
                        $redirect_args['ss_message'] = 'Choose a valid access preset.';
                        wp_safe_redirect($this->admin_users_page_url($redirect_args));
                        exit;
                }

                if (($preset === 'custom_trial' || $preset === 'custom_courtesy') && $expires_at === null) {
                    $redirect_args['ss_notice'] = 'error';
                    $redirect_args['ss_message'] = 'Choose a custom expiry date for the custom access preset.';
                    wp_safe_redirect($this->admin_users_page_url($redirect_args));
                    exit;
                }

                $grant = StitchSense_Platform_Client::request('POST', 'admin/entitlements', [
                    'userId' => $platform_user_id,
                    'type' => $type,
                    'expiresAt' => $expires_at,
                    'reason' => $reason !== '' ? $reason : null,
                ]);

                if (is_wp_error($grant)) {
                    $redirect_args['ss_notice'] = 'error';
                    $redirect_args['ss_message'] = $this->platform_admin_error_message($grant);
                } else {
                    $redirect_args['ss_notice'] = 'success';
                    $redirect_args['ss_message'] = 'Platform access updated for ' . $wp_user->display_name . '.';
                }

                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }

            if ($action === 'revoke_entitlement') {
                $grant_id = isset($_POST['grant_id']) ? sanitize_text_field(wp_unslash($_POST['grant_id'])) : '';
                if ($grant_id === '') {
                    $redirect_args['ss_notice'] = 'error';
                    $redirect_args['ss_message'] = 'Choose a valid grant to revoke.';
                    wp_safe_redirect($this->admin_users_page_url($redirect_args));
                    exit;
                }

                $result = StitchSense_Platform_Client::request('DELETE', 'admin/entitlements/' . rawurlencode($grant_id));
                if (is_wp_error($result)) {
                    $redirect_args['ss_notice'] = 'error';
                    $redirect_args['ss_message'] = $this->platform_admin_error_message($result);
                } else {
                    $redirect_args['ss_notice'] = 'success';
                    $redirect_args['ss_message'] = 'Manual access grant revoked.';
                }

                wp_safe_redirect($this->admin_users_page_url($redirect_args));
                exit;
            }
        }

        private function load_platform_user_admin_context($wp_user_id) {
            if (!class_exists('StitchSense_Platform_Client')) {
                return new WP_Error('stitchsense_platform_client_missing', 'The StitchSense platform client is not available.');
            }

            $wp_user = get_user_by('id', (int) $wp_user_id);
            if (!($wp_user instanceof WP_User) || empty($wp_user->ID)) {
                return new WP_Error('stitchsense_platform_user_missing', 'The selected WordPress user could not be found.');
            }

            $platform_user = StitchSense_Platform_Client::request_for_user($wp_user, 'GET', 'me');
            if (is_wp_error($platform_user)) {
                return $platform_user;
            }

            $entitlement = StitchSense_Platform_Client::request_for_user($wp_user, 'GET', 'me/entitlements');
            if (is_wp_error($entitlement)) {
                return $entitlement;
            }

            $all_grants = StitchSense_Platform_Client::request('GET', 'admin/entitlements');
            if (is_wp_error($all_grants)) {
                return $all_grants;
            }

            $platform_id = sanitize_text_field((string) ($platform_user['user']['id'] ?? ''));
            $grants = array_values(array_filter((array) ($all_grants['grants'] ?? []), function ($grant) use ($platform_id) {
                return is_array($grant) && (string) ($grant['user_id'] ?? '') === $platform_id;
            }));

            return [
                'wp_user' => $wp_user,
                'platform_user' => $platform_user['user'] ?? [],
                'entitlement' => $entitlement['entitlement'] ?? [],
                'grants' => $grants,
            ];
        }

        private function entitlement_access_label($entitlement) {
            $source = is_array($entitlement) ? (string) ($entitlement['accessSource'] ?? '') : '';
            switch ($source) {
                case 'manual_lifetime':
                    return 'Lifetime Pro';
                case 'manual_trial':
                    return 'Extended trial';
                case 'courtesy_access':
                    return 'Courtesy access';
                case 'stripe':
                    return 'Stripe subscription';
                case 'apple':
                    return 'Apple subscription';
                case 'google':
                    return 'Google subscription';
                case 'standard_trial':
                    return 'Standard trial';
                case 'none':
                    return 'No active access';
                default:
                    return $source !== '' ? $source : 'Not available';
            }
        }

        private function entitlement_plan_label($plan) {
            switch ((string) $plan) {
                case 'pro_annual':
                    return 'Annual Pro';
                case 'pro_monthly':
                    return 'Monthly Pro';
                case 'pro':
                    return 'Pro';
                case 'trial':
                    return 'Free trial';
                case 'none':
                    return 'No plan';
                default:
                    return (string) $plan !== '' ? (string) $plan : 'Unknown';
            }
        }

        private function entitlement_status_badge($status) {
            $status = (string) $status;
            $label = $status !== '' ? ucfirst($status) : 'Unknown';
            $background = '#f6f7f7';
            $color = '#3c434a';
            if (in_array($status, ['active', 'trialing'], true)) {
                $background = '#edfaef';
                $color = '#008a20';
            } elseif ($status === 'expired') {
                $background = '#fcf0f1';
                $color = '#b32d2e';
            }
            return '<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:' . esc_attr($background) . ';color:' . esc_attr($color) . ';font-weight:700;">' . esc_html($label) . '</span>';
        }

        private function entitlement_end_label($entitlement) {
            if (!is_array($entitlement)) {
                return '—';
            }

            $trial_ends_at = (string) ($entitlement['trialEndsAt'] ?? '');
            if ($trial_ends_at === '') {
                return 'Never';
            }

            $timestamp = strtotime($trial_ends_at);
            if ($timestamp === false) {
                return $trial_ends_at;
            }

            return gmdate('Y-m-d H:i', $timestamp) . ' UTC';
        }

        private function load_platform_access_snapshots_bulk() {
            if (!class_exists('StitchSense_Platform_Client')) {
                return [];
            }
            $response = StitchSense_Platform_Client::request('GET', 'admin/users/access');
            if (is_wp_error($response)) {
                return ['_error' => $this->platform_admin_error_message($response)];
            }
            $snapshots = [];
            foreach ((array) ($response['users'] ?? []) as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $wp_user_id = (int) ($entry['wpUserId'] ?? 0);
                if ($wp_user_id <= 0) {
                    continue;
                }
                $entitlement = is_array($entry['entitlement'] ?? null) ? $entry['entitlement'] : [];
                $subscription = is_array($entry['subscription'] ?? null) ? $entry['subscription'] : [];
                $snapshots[$wp_user_id] = [
                    'label' => $this->entitlement_access_label($entitlement),
                    'plan' => (string) ($entitlement['plan'] ?? 'unknown'),
                    'planLabel' => $this->entitlement_plan_label((string) ($entitlement['plan'] ?? 'unknown')),
                    'status' => (string) ($entitlement['status'] ?? 'unknown'),
                    'source' => (string) ($entitlement['accessSource'] ?? 'unknown'),
                    'ends' => $this->entitlement_end_label($entitlement),
                    'subscriptionStatus' => (string) ($subscription['status'] ?? ''),
                    'platformUserId' => (string) ($entry['platformUserId'] ?? ''),
                    'error' => '',
                ];
            }
            return $snapshots;
        }

        private function load_platform_access_snapshot(WP_User $wp_user) {
            if (!class_exists('StitchSense_Platform_Client')) {
                return [
                    'label' => 'Unavailable',
                    'plan' => '—',
                    'status' => '—',
                    'ends' => '—',
                    'error' => 'Platform client unavailable',
                ];
            }

            $entitlement_response = StitchSense_Platform_Client::request_for_user($wp_user, 'GET', 'me/entitlements');
            if (is_wp_error($entitlement_response)) {
                return [
                    'label' => 'Unavailable',
                    'plan' => '—',
                    'status' => '—',
                    'ends' => '—',
                    'error' => $this->platform_admin_error_message($entitlement_response),
                ];
            }

            $entitlement = is_array($entitlement_response['entitlement'] ?? null) ? $entitlement_response['entitlement'] : [];
            return [
                'label' => $this->entitlement_access_label($entitlement),
                'plan' => (string) ($entitlement['plan'] ?? 'unknown'),
                'status' => (string) ($entitlement['status'] ?? 'unknown'),
                'ends' => $this->entitlement_end_label($entitlement),
                'error' => '',
            ];
        }

        public function render_users_admin_page() {
            if (!current_user_can('manage_options')) {
                return;
            }
            $rows = StitchSense_Library::instance()->admin_list_users(200);
            $all_users = get_users([
                'orderby' => 'display_name',
                'order' => 'ASC',
                'fields' => ['ID', 'display_name', 'user_email', 'user_login'],
                'number' => 500,
            ]);
            $selected_user_id = isset($_GET['manage_user_id']) ? (int) $_GET['manage_user_id'] : 0;
            $selected_wp_user = $selected_user_id > 0 ? get_user_by('id', $selected_user_id) : false;
            $platform_status = class_exists('StitchSense_Platform_Client') ? StitchSense_Platform_Client::settings_status() : ['ready' => false, 'enabled' => false, 'api_base_url' => '', 'has_secret' => false];
            $selected_context = null;
            $selected_context_error = '';
            $access_snapshots = [];
            $access_snapshot_error = '';
            $library_rows_by_user = [];

            foreach ($rows as $row) {
                $library_rows_by_user[(int) ($row['wp_user_id'] ?? 0)] = $row;
            }

            if ($selected_user_id > 0 && !empty($platform_status['ready'])) {
                $selected_context = $this->load_platform_user_admin_context($selected_user_id);
                if (is_wp_error($selected_context)) {
                    $selected_context_error = $this->platform_admin_error_message($selected_context);
                    $selected_context = null;
                }
            }

            if (!empty($platform_status['ready'])) {
                $access_snapshots = $this->load_platform_access_snapshots_bulk();
                if (isset($access_snapshots['_error'])) {
                    $access_snapshot_error = (string) $access_snapshots['_error'];
                    $access_snapshots = [];
                }
            }
            ?>
            <div class="wrap ss-admin-wrap ss-admin-table-wrap">
                <h1>StitchSense Users</h1>
                <p class="ss-admin-intro">Library usage summary by WordPress user, plus manual platform access controls for beta testers, friends, and internal accounts.</p>

                <?php if (!empty($_GET['ss_message'])) : ?>
                    <div class="notice notice-<?php echo (!empty($_GET['ss_notice']) && $_GET['ss_notice'] === 'success') ? 'success' : 'error'; ?> is-dismissible">
                        <p><?php echo esc_html(wp_unslash((string) $_GET['ss_message'])); ?></p>
                    </div>
                <?php endif; ?>

                <div class="ss-admin-card">
                    <h2>Platform Access Controls</h2>
                    <?php if (empty($platform_status['ready'])) : ?>
                        <p>The shared StitchSense Platform API is not ready yet. Enable it under Pattern Helper AI settings, then add the Platform API base URL and WordPress bridge secret.</p>
                    <?php else : ?>
                        <p>Choose any WordPress user to view their linked platform account and manually grant or revoke lifetime, timed trial, or courtesy access.</p>
                        <p class="ss-help">Current API: <code><?php echo esc_html($platform_status['api_base_url'] ?: 'Not configured'); ?></code></p>
                        <form method="get" action="">
                            <input type="hidden" name="page" value="stitchsense-users-admin">
                            <div class="ss-setting-row">
                                <label for="stitchsense_manage_user">Manage a WordPress user</label>
                                <select id="stitchsense_manage_user" name="manage_user_id">
                                    <option value="">Choose a user...</option>
                                    <?php foreach ($all_users as $user_option) : ?>
                                        <?php $label = trim(($user_option->display_name ?: $user_option->user_login) . ' — ' . $user_option->user_email . ' (#' . $user_option->ID . ')'); ?>
                                        <option value="<?php echo esc_attr((string) $user_option->ID); ?>" <?php selected($selected_user_id, (int) $user_option->ID); ?>>
                                            <?php echo esc_html($label); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                                <p class="ss-help">This works even if the user has no library activity yet.</p>
                            </div>
                            <p class="submit-btn-wrapper">
                                <?php submit_button('Open Access Controls', 'secondary', '', false); ?>
                            </p>
                        </form>
                    <?php endif; ?>
                </div>

                <?php if ($selected_context_error !== '') : ?>
                    <div class="notice notice-error"><p><?php echo esc_html($selected_context_error); ?></p></div>
                <?php endif; ?>
                <?php if ($access_snapshot_error !== '') : ?>
                    <div class="notice notice-warning"><p>Could not load the subscription status snapshot: <?php echo esc_html($access_snapshot_error); ?></p></div>
                <?php endif; ?>

                <?php if ($selected_wp_user instanceof WP_User) : ?>
                    <div class="ss-admin-card" id="stitchsense-manage-access">
                        <h2>Manage Platform Access: <?php echo esc_html($selected_wp_user->display_name ?: $selected_wp_user->user_login); ?></h2>
                        <div class="ss-setting-row">
                            <label>WordPress account</label>
                            <div>
                                <strong><?php echo esc_html($selected_wp_user->display_name ?: $selected_wp_user->user_login); ?></strong>
                                <div><?php echo esc_html($selected_wp_user->user_email); ?> (#<?php echo esc_html((string) $selected_wp_user->ID); ?>)</div>
                            </div>
                        </div>

                        <?php if (empty($platform_status['ready'])) : ?>
                            <div class="notice notice-warning inline">
                                <p>The Platform API is not ready yet, so access controls cannot be changed for this user. Enable the platform bridge first in Pattern Helper AI settings.</p>
                            </div>
                        <?php elseif (!is_array($selected_context)) : ?>
                            <div class="notice notice-warning inline">
                                <p><?php echo esc_html($selected_context_error !== '' ? $selected_context_error : 'The selected user could not be linked to the StitchSense platform yet.'); ?></p>
                            </div>
                        <?php endif; ?>

                <?php if (is_array($selected_context)) : ?>
                    <?php
                    $selected_wp_user = $selected_context['wp_user'];
                    $selected_platform_user = is_array($selected_context['platform_user']) ? $selected_context['platform_user'] : [];
                    $selected_entitlement = is_array($selected_context['entitlement']) ? $selected_context['entitlement'] : [];
                    $selected_grants = is_array($selected_context['grants']) ? $selected_context['grants'] : [];
                    ?>
                        <div class="ss-setting-row">
                            <label>Platform account</label>
                            <div>
                                <strong><?php echo esc_html((string) ($selected_platform_user['display_name'] ?? $selected_platform_user['email'] ?? 'Unknown')); ?></strong>
                                <div><?php echo esc_html((string) ($selected_platform_user['email'] ?? '')); ?></div>
                                <div><code><?php echo esc_html((string) ($selected_platform_user['id'] ?? '')); ?></code></div>
                            </div>
                        </div>
                        <div class="ss-setting-row">
                            <label>Effective access</label>
                            <div>
                                <strong><?php echo esc_html($this->entitlement_access_label($selected_entitlement)); ?></strong>
                                <div>Plan: <?php echo esc_html((string) ($selected_entitlement['plan'] ?? 'unknown')); ?> · Status: <?php echo esc_html((string) ($selected_entitlement['status'] ?? 'unknown')); ?></div>
                                <?php if (!empty($selected_entitlement['trialEndsAt'])) : ?>
                                    <div>Ends: <?php echo esc_html((string) $selected_entitlement['trialEndsAt']); ?></div>
                                <?php endif; ?>
                            </div>
                        </div>

                        <form method="post" action="">
                            <?php wp_nonce_field('stitchsense_platform_entitlement_admin'); ?>
                            <input type="hidden" name="stitchsense_platform_admin_action" value="grant_entitlement">
                            <input type="hidden" name="manage_user_id" value="<?php echo esc_attr((string) $selected_wp_user->ID); ?>">
                            <div class="ss-setting-row">
                                <label for="entitlement_preset">Grant access</label>
                                <select id="entitlement_preset" name="entitlement_preset">
                                    <option value="lifetime_pro">Lifetime Pro</option>
                                    <option value="extended_trial_3m">Extended trial — 3 months</option>
                                    <option value="extended_trial_6m">Extended trial — 6 months</option>
                                    <option value="courtesy_access">Courtesy access — until revoked</option>
                                    <option value="custom_trial">Custom trial expiry</option>
                                    <option value="custom_courtesy">Custom courtesy expiry</option>
                                </select>
                            </div>
                            <div class="ss-setting-row">
                                <label for="custom_expires_at">Custom expiry</label>
                                <input type="datetime-local" id="custom_expires_at" name="custom_expires_at" value="">
                                <p class="ss-help">Only used for the custom presets above.</p>
                            </div>
                            <div class="ss-setting-row">
                                <label for="entitlement_reason">Reason / note</label>
                                <input type="text" id="entitlement_reason" name="entitlement_reason" value="" class="regular-text" placeholder="e.g. Beta tester, internal admin, friend account">
                            </div>
                            <p class="submit-btn-wrapper">
                                <?php submit_button('Grant / Update Access', 'primary', '', false); ?>
                            </p>
                        </form>

                        <h3>Manual grants</h3>
                        <table class="widefat striped">
                            <thead><tr><th>Type</th><th>Starts</th><th>Expires</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
                            <tbody>
                            <?php if (empty($selected_grants)) : ?>
                                <tr><td colspan="6">No manual grants found for this user.</td></tr>
                            <?php else : foreach ($selected_grants as $grant) : ?>
                                <?php
                                $is_revoked = !empty($grant['revoked_at']);
                                $is_expired = !empty($grant['expires_at']) && strtotime((string) $grant['expires_at']) < time();
                                ?>
                                <tr>
                                    <td><?php echo esc_html((string) ($grant['type'] ?? '')); ?></td>
                                    <td><?php echo esc_html((string) ($grant['starts_at'] ?? '')); ?></td>
                                    <td><?php echo esc_html((string) ($grant['expires_at'] ?? 'Never')); ?></td>
                                    <td><?php echo esc_html((string) ($grant['reason'] ?? '')); ?></td>
                                    <td>
                                        <?php
                                        if ($is_revoked) {
                                            echo 'Revoked';
                                        } elseif ($is_expired) {
                                            echo 'Expired';
                                        } else {
                                            echo 'Active';
                                        }
                                        ?>
                                    </td>
                                    <td>
                                        <?php if (!$is_revoked) : ?>
                                            <form method="post" action="" style="display:inline;">
                                                <?php wp_nonce_field('stitchsense_platform_entitlement_admin'); ?>
                                                <input type="hidden" name="stitchsense_platform_admin_action" value="revoke_entitlement">
                                                <input type="hidden" name="manage_user_id" value="<?php echo esc_attr((string) $selected_wp_user->ID); ?>">
                                                <input type="hidden" name="grant_id" value="<?php echo esc_attr((string) ($grant['id'] ?? '')); ?>">
                                                <?php submit_button('Revoke', 'secondary', '', false); ?>
                                            </form>
                                        <?php else : ?>
                                            —
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; endif; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                    </div>
                <?php endif; ?>

                <div class="ss-admin-card ss-admin-table-card">
                    <h2>Users & Subscription Status</h2>
                    <p class="ss-help">Shows the effective access source for each WordPress user linked to the StitchSense platform. Stripe rows update from webhooks and from app account refreshes.</p>
                    <table class="widefat striped">
                        <thead><tr><th>User</th><th>Email</th><th>Subscription</th><th>Plan</th><th>Status</th><th>Ends / renews</th><th>Patterns</th><th>Chats</th><th>Rewrites</th><th>Last Activity</th><th>Platform Access</th></tr></thead>
                        <tbody>
                        <?php if (empty($all_users)) : ?>
                            <tr><td colspan="11">No WordPress users found.</td></tr>
                        <?php else : foreach ($all_users as $user) :
                            $row = $library_rows_by_user[(int) $user->ID] ?? [];
                            $snapshot = isset($access_snapshots[(int) $user->ID]) ? $access_snapshots[(int) $user->ID] : null;
                            ?>
                            <tr>
                                <td><strong><?php echo esc_html($user->display_name ?: $user->user_login); ?></strong><br><small>#<?php echo esc_html((string) $user->ID); ?></small></td>
                                <td><?php echo esc_html($user->user_email); ?></td>
                                <td>
                                    <?php
                                    if (empty($platform_status['ready'])) {
                                        echo 'Platform API not ready';
                                    } elseif (is_array($snapshot)) {
                                        echo esc_html($snapshot['label']);
                                        if (!empty($snapshot['platformUserId'])) {
                                            echo '<br><small><code>' . esc_html(substr((string) $snapshot['platformUserId'], 0, 8)) . '...</code></small>';
                                        }
                                    } else {
                                        echo 'Not linked yet';
                                    }
                                    ?>
                                </td>
                                <td>
                                    <?php
                                    echo is_array($snapshot) ? esc_html((string) $snapshot['planLabel']) : '—';
                                    ?>
                                </td>
                                <td>
                                    <?php
                                    echo is_array($snapshot) ? $this->entitlement_status_badge((string) $snapshot['status']) : '—';
                                    ?>
                                </td>
                                <td><?php echo is_array($snapshot) ? esc_html((string) $snapshot['ends']) : '—'; ?></td>
                                <td><?php echo esc_html($row['pattern_count'] ?? 0); ?></td>
                                <td><?php echo esc_html($row['chat_count'] ?? 0); ?></td>
                                <td><?php echo esc_html($row['rewrite_count'] ?? 0); ?></td>
                                <td><?php echo esc_html($row['last_activity'] ?? ''); ?></td>
                                <td>
                                    <a class="button button-secondary" href="<?php echo esc_url($this->admin_users_page_url(['manage_user_id' => (int) $user->ID]) . '#stitchsense-manage-access'); ?>">
                                        Manage access
                                    </a>
                                </td>
                            </tr>
                        <?php endforeach; endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <?php
        }

        public function render_migration_export_page() {
            if (!current_user_can('manage_options')) {
                return;
            }

            $selectedUserId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
            $exportPayload = null;
            $exportError = '';

            if ($selectedUserId > 0) {
                $exportPayload = StitchSense_Library::instance()->admin_export_payload_for_user($selectedUserId);
                if (is_wp_error($exportPayload)) {
                    $exportError = $exportPayload->get_error_message();
                    $exportPayload = null;
                }
            }

            $users = get_users([
                'orderby' => 'display_name',
                'order' => 'ASC',
                'fields' => ['ID', 'display_name', 'user_email', 'user_login'],
                'number' => 500,
            ]);
            ?>
            <div class="wrap ss-admin-wrap">
                <h1>Migration Export</h1>
                <p class="ss-admin-intro">Export a WordPress user's StitchSense library, chat history, rewrite history, and settings in the JSON format expected by the mobile platform importer.</p>

                <div class="ss-admin-card">
                    <h2>Select User</h2>
                    <form method="get" action="">
                        <input type="hidden" name="page" value="stitchsense-migration-export">
                        <div class="ss-setting-row">
                            <label for="stitchsense_migration_user">WordPress user</label>
                            <select id="stitchsense_migration_user" name="user_id">
                                <option value="">Choose a user...</option>
                                <?php foreach ($users as $user) : ?>
                                    <?php $label = trim(($user->display_name ?: $user->user_login) . ' — ' . $user->user_email . ' (#' . $user->ID . ')'); ?>
                                    <option value="<?php echo esc_attr((string) $user->ID); ?>" <?php selected($selectedUserId, (int) $user->ID); ?>>
                                        <?php echo esc_html($label); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <p class="ss-help">Choose the WordPress account whose existing StitchSense data you want to migrate into the mobile platform.</p>
                        </div>
                        <p class="submit-btn-wrapper">
                            <?php submit_button('Load Export Data', 'primary', '', false); ?>
                        </p>
                    </form>
                </div>

                <?php if ($exportError !== '') : ?>
                    <div class="notice notice-error"><p><?php echo esc_html($exportError); ?></p></div>
                <?php endif; ?>

                <?php if (is_array($exportPayload)) : ?>
                    <?php
                    $json = wp_json_encode($exportPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
                    $fileName = 'stitchsense-user-export-' . $selectedUserId . '.json';
                    ?>
                    <div class="ss-admin-card">
                        <h2>Export Ready</h2>
                        <p>Copy this JSON into a file on your Mac, or download it directly and feed it into the migration importer.</p>
                        <p>
                            <a class="button button-primary" download="<?php echo esc_attr($fileName); ?>" href="data:application/json;charset=utf-8,<?php echo rawurlencode($json); ?>">Download JSON Export</a>
                        </p>
                        <div class="ss-setting-row">
                            <label for="stitchsense_migration_export_json">JSON payload</label>
                            <textarea id="stitchsense_migration_export_json" class="large-text code" rows="24" readonly><?php echo esc_textarea($json); ?></textarea>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
            <?php
        }

        private static function findModelName($modelId) {
            if (empty($modelId)) return null;
            foreach (self::OPENROUTER_VISION_MODELS as $tier => $models) {
                foreach ($models as $m) {
                    if ($m['id'] === $modelId) return $m['name'];
                }
            }
            return $modelId;
        }

        private static function renderModelSelect($name, $currentValue) {
            $searchId = $name . '_search';
            $searchPlaceholder = ($name === 'stitchsense_chat_model') ? 'Type to search chat models…' : 'Type to search vision models…';
            $html = '<input type="text" id="' . esc_attr($searchId) . '" class="ss-model-search" placeholder="' . esc_attr($searchPlaceholder) . '" autocomplete="off">';
            $html .= '<select name="' . esc_attr($name) . '" id="' . esc_attr($name) . '" class="ss-model-select" data-search="' . esc_attr($searchId) . '">';
            $html .= '<option value=""' . selected($currentValue, '', false) . '>— Default —</option>';

            $html .= '<optgroup label="Free Models">';
            foreach (self::OPENROUTER_VISION_MODELS['free'] as $model) {
                $html .= '<option value="' . esc_attr($model['id']) . '"' . selected($currentValue, $model['id'], false) . '>'
                       . esc_html($model['name'])
                       . '</option>';
            }
            $html .= '</optgroup>';

            $html .= '<optgroup label="Paid Models (API costs apply)">';
            foreach (self::OPENROUTER_VISION_MODELS['paid'] as $model) {
                $html .= '<option value="' . esc_attr($model['id']) . '"' . selected($currentValue, $model['id'], false) . '>'
                       . esc_html($model['name'])
                       . '</option>';
            }
            $html .= '</optgroup>';

            $html .= '</select>';
            return $html;
        }

        public function register_assets() {
            wp_register_style(
                'stitchsense-filepond',
                'https://unpkg.com/filepond/dist/filepond.min.css',
                [],
                '4.31.4'
            );

            wp_register_script(
                'stitchsense-filepond',
                'https://unpkg.com/filepond/dist/filepond.min.js',
                [],
                '4.31.4',
                true
            );

            wp_register_style(
                'stitchsense-hub-pro-v5qs-fonts',
                'https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;500;600;700&display=swap',
                [],
                null
            );

            wp_register_style(
                'stitchsense-hub-pro-v5qs',
                plugin_dir_url(__FILE__) . 'assets/stitchsense-hub-pro.css',
                ['stitchsense-filepond', 'stitchsense-hub-pro-v5qs-fonts'],
                self::VERSION
            );

            wp_register_script(
                'stitchsense-pdfjs',
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
                [],
                '3.11.174',
                true
            );

            wp_register_script(
                'stitchsense-hub-pro-v5qs',
                plugin_dir_url(__FILE__) . 'assets/stitchsense-hub-pro.js',
                ['stitchsense-filepond', 'stitchsense-pdfjs'],
                self::VERSION,
                true
            );

            $current_user = wp_get_current_user();
            $is_logged_in = is_user_logged_in();
            wp_localize_script('stitchsense-hub-pro-v5qs', 'StitchSenseHubPro', [
                'endpoint' => '',
                'chatAjaxEndpoint' => esc_url_raw(site_url('/wp-admin/admin-ajax.php')),
                'chatAdminPostEndpoint' => esc_url_raw(site_url('/wp-admin/admin-post.php')),
                'chatProxyAction' => 'stitchsense_chat_proxy',
                'pluginChatProxyEndpoint' => '',
                'restChatEndpoint' => esc_url_raw(site_url('/wp-json/stitchsense/v1/chat-proxy')), 
                'directChatEndpoint' => '',
                'pluginUploadProxyEndpoint' => '',
                'uploadEndpoint' => '',
                'restUploadEndpoint' => esc_url_raw(rest_url('stitchsense/v1/upload-proxy')),
                'directUploadEndpoint' => '',
                'secret' => '',
                'version' => self::VERSION,
                'logo' => plugin_dir_url(__FILE__) . 'assets/stitchsense-logo_new.png',
                'imageEndpoint' => esc_url_raw(site_url('/wp-admin/admin-ajax.php')),
                'pluginImageProxyEndpoint' => '',
                'restImageEndpoint' => esc_url_raw(site_url('/wp-json/stitchsense/v1/image-analysis')),
                'imageProxyAction' => 'stitchsense_image_analysis_proxy',
                'wpRestNonce' => wp_create_nonce('wp_rest'),
                'restNonceEndpoint' => esc_url_raw(rest_url('stitchsense/v1/nonce')),
                'restNonceAjaxAction' => 'stitchsense_rest_nonce',
                'chatModel' => get_option('stitchsense_chat_model', ''),
                'visionModel' => get_option('stitchsense_vision_model', ''),
                'isUserLoggedIn' => $is_logged_in,
                'currentUserId' => get_current_user_id(),
                'currentUserName' => $is_logged_in ? $current_user->display_name : '',
                'currentUserAvatar' => $is_logged_in ? get_avatar_url(get_current_user_id(), ['size' => 64]) : '',
                'loginUrl' => esc_url_raw(wp_login_url(get_permalink())),
                'registerUrl' => esc_url_raw(wp_registration_url()),
                'accountUrl' => esc_url_raw(admin_url('profile.php')),
                'logoutUrl' => esc_url_raw(wp_logout_url(get_permalink())),
                'restUrl' => esc_url_raw(rest_url('stitchsense/v1/')),
                'ravelryStatusEndpoint' => esc_url_raw(rest_url('stitchsense/v1/ravelry/status')),
                'ravelryConnectEndpoint' => esc_url_raw(rest_url('stitchsense/v1/ravelry/connect-url')),
            ]);
        }



        public function register_rest_routes() {
            $lib = StitchSense_Library::instance();
            $ravelry = StitchSense_Ravelry::instance();

            register_rest_route('stitchsense/v1', '/nonce', [
                'methods' => 'GET',
                'callback' => [$this, 'rest_nonce'],
                'permission_callback' => '__return_true',
            ]);

            register_rest_route('stitchsense/v1', '/image-analysis', [
                'methods' => 'POST',
                'callback' => [$this, 'image_analysis_proxy'],
                'permission_callback' => [$this, 'require_logged_in_rest_user'],
            ]);

            register_rest_route('stitchsense/v1', '/chat-proxy', [
                'methods' => 'POST',
                'callback' => [$this, 'chat_proxy'],
                'permission_callback' => [$this, 'require_logged_in_rest_user'],
            ]);

            register_rest_route('stitchsense/v1', '/platform-login', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_login_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-register', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_register_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-password-reset/request', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_password_reset_request_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-password-reset/confirm', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_password_reset_confirm_bridge'],
                'permission_callback' => '__return_true',
            ]);

            register_rest_route('stitchsense/v1', '/platform-export', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_export_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/status', [
                'methods' => 'GET',
                'callback' => [$this, 'platform_ravelry_status_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/connect-url', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_ravelry_connect_url_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/username', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_ravelry_username_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/disconnect', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_ravelry_disconnect_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/search', [
                'methods' => 'GET',
                'callback' => [$this, 'platform_ravelry_search_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/pattern', [
                'methods' => 'GET',
                'callback' => [$this, 'platform_ravelry_pattern_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/saved', [
                'methods' => 'GET',
                'callback' => [$this, 'platform_ravelry_saved_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-ravelry/import', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_ravelry_import_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-chat-proxy', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_chat_proxy_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-image-proxy', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_image_proxy_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-upload-proxy', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_upload_proxy_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-library/patterns/(?P<id>[a-f0-9-]+)', [
                'methods' => 'DELETE',
                'callback' => [$this, 'platform_library_delete_pattern_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-delete-data', [
                'methods' => 'POST',
                'callback' => [$this, 'platform_delete_user_data_bridge'],
                'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/platform-promotions', [
                'methods' => 'GET',
                'callback' => [$this, 'platform_promotions_bridge'],
                'permission_callback' => '__return_true',
            ]);

            // v7.6.0 — Pattern Library routes
            $auth = function () { return is_user_logged_in(); };

            register_rest_route('stitchsense/v1', '/diagnostics', [
                'methods' => 'GET',
                'callback' => [$this, 'diagnostics'],
                'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/diagnostics/chat-test', [
                'methods' => 'POST',
                'callback' => [$this, 'diagnostics_chat_test'],
                'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/library/patterns', [
                'methods' => 'GET', 'callback' => [$lib, 'list_patterns'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/patterns', [
                'methods' => 'POST', 'callback' => [$lib, 'save_pattern'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/pattern-file', [
                'methods' => 'POST', 'callback' => [$lib, 'save_pattern_file'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/patterns/(?P<id>[a-f0-9-]+)', [
                'methods' => 'GET', 'callback' => [$lib, 'get_pattern'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/patterns/(?P<id>[a-f0-9-]+)', [
                'methods' => 'PUT', 'callback' => [$lib, 'update_pattern'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/patterns/(?P<id>[a-f0-9-]+)', [
                'methods' => 'DELETE', 'callback' => [$lib, 'delete_pattern'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/patterns/(?P<id>[a-f0-9-]+)/summary/refresh', [
                'methods' => 'POST', 'callback' => [$this, 'platform_pattern_summary_refresh'], 'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/library/patterns/(?P<id>[a-f0-9-]+)/chats', [
                'methods' => 'GET', 'callback' => [$lib, 'list_chat_sessions'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/chats', [
                'methods' => 'POST', 'callback' => [$lib, 'create_chat_session'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/chats/(?P<id>[a-f0-9-]+)', [
                'methods' => 'GET', 'callback' => [$lib, 'get_chat_session'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/chats/(?P<id>[a-f0-9-]+)', [
                'methods' => 'DELETE', 'callback' => [$lib, 'delete_chat_session'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/chats/(?P<id>[a-f0-9-]+)/messages', [
                'methods' => 'POST', 'callback' => [$lib, 'append_chat_message'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/chats/(?P<id>[a-f0-9-]+)/messages', [
                'methods' => 'PUT', 'callback' => [$lib, 'append_chat_messages'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/chats/(?P<id>[a-f0-9-]+)/messages', [
                'methods' => 'GET', 'callback' => [$lib, 'list_chat_messages'], 'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/library/patterns/(?P<id>[a-f0-9-]+)/rewrites', [
                'methods' => 'GET', 'callback' => [$lib, 'list_rewrites'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/rewrites', [
                'methods' => 'POST', 'callback' => [$lib, 'save_rewrite'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/rewrites/(?P<id>[a-f0-9-]+)', [
                'methods' => 'GET', 'callback' => [$lib, 'get_rewrite'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/library/rewrites/(?P<id>[a-f0-9-]+)', [
                'methods' => 'DELETE', 'callback' => [$lib, 'delete_rewrite'], 'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/user/settings', [
                'methods' => 'GET', 'callback' => [$lib, 'get_settings'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/user/settings', [
                'methods' => 'PUT', 'callback' => [$lib, 'update_settings'], 'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/user/connections', [
                'methods' => 'GET', 'callback' => [$lib, 'list_connections'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/user/connections/(?P<id>[a-f0-9-]+)', [
                'methods' => 'DELETE', 'callback' => [$lib, 'delete_connection'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/user/export', [
                'methods' => 'GET', 'callback' => [$lib, 'export_user_data'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/admin/export-user-data', [
                'methods' => 'GET',
                'callback' => [$lib, 'admin_export_user_data'],
                'permission_callback' => function () {
                    return current_user_can('manage_options');
                },
            ]);
            register_rest_route('stitchsense/v1', '/user/delete-data', [
                'methods' => 'POST', 'callback' => [$lib, 'delete_user_data'], 'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/projects', [
                'methods' => 'GET', 'callback' => [$this, 'platform_projects_list'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/projects', [
                'methods' => 'POST', 'callback' => [$this, 'platform_projects_create'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/projects/(?P<id>[a-f0-9-]+)', [
                'methods' => 'GET', 'callback' => [$this, 'platform_projects_get'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/projects/(?P<id>[a-f0-9-]+)', [
                'methods' => 'PUT', 'callback' => [$this, 'platform_projects_update'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/projects/(?P<id>[a-f0-9-]+)', [
                'methods' => 'DELETE', 'callback' => [$this, 'platform_projects_delete'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/projects/(?P<id>[a-f0-9-]+)/sync-validation', [
                'methods' => 'GET', 'callback' => [$this, 'platform_projects_sync_validation'], 'permission_callback' => $auth,
            ]);

            register_rest_route('stitchsense/v1', '/ravelry/status', [
                'methods' => 'GET', 'callback' => [$ravelry, 'status'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/diagnostics', [
                'methods' => 'GET', 'callback' => [$ravelry, 'diagnostics'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/connect-url', [
                'methods' => 'POST', 'callback' => [$ravelry, 'connect_url'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/username', [
                'methods' => 'POST', 'callback' => [$ravelry, 'save_username'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/callback', [
                'methods' => 'GET', 'callback' => [$ravelry, 'callback'], 'permission_callback' => '__return_true',
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/disconnect', [
                'methods' => 'POST', 'callback' => [$ravelry, 'disconnect'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/sync', [
                'methods' => 'POST', 'callback' => [$ravelry, 'sync'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/search', [
                'methods' => 'GET', 'callback' => [$ravelry, 'search'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/pattern', [
                'methods' => 'GET', 'callback' => [$ravelry, 'pattern'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/saved', [
                'methods' => 'GET', 'callback' => [$ravelry, 'saved'], 'permission_callback' => $auth,
            ]);
            register_rest_route('stitchsense/v1', '/ravelry/import', [
                'methods' => 'POST', 'callback' => [$ravelry, 'import'], 'permission_callback' => $auth,
            ]);
        }

        public function rest_nonce(WP_REST_Request $request) {
            nocache_headers();
            return new WP_REST_Response([
                'success' => true,
                'nonce' => wp_create_nonce('wp_rest'),
                'logged_in' => is_user_logged_in(),
                'user_id' => get_current_user_id(),
            ], 200);
        }

        public function ajax_rest_nonce() {
            nocache_headers();
            wp_send_json([
                'success' => true,
                'nonce' => wp_create_nonce('wp_rest'),
                'logged_in' => is_user_logged_in(),
                'user_id' => get_current_user_id(),
            ]);
        }

        public function require_logged_in_rest_user() {
            if (!is_user_logged_in()) {
                return new WP_Error(
                    'stitchsense_auth_required',
                    'You must be signed in to use StitchSense assistant tools.',
                    ['status' => 401]
                );
            }
            return true;
        }

        private function platform_bridge_secret() {
            if (defined('STITCHSENSE_PLATFORM_BRIDGE_SECRET') && STITCHSENSE_PLATFORM_BRIDGE_SECRET) {
                return (string) STITCHSENSE_PLATFORM_BRIDGE_SECRET;
            }
            return (string) get_option('stitchsense_platform_bridge_secret', '');
        }

        private function validate_platform_bridge_request(WP_REST_Request $request) {
            $expected = $this->platform_bridge_secret();
            if ($expected === '') {
                return new WP_REST_Response(['error' => 'WordPress platform bridge is not configured.'], 503);
            }

            $supplied = $request->get_header('x-stitchsense-wordpress-secret');
            if (!is_string($supplied) || $supplied === '' || !hash_equals($expected, $supplied)) {
                return new WP_REST_Response(['error' => 'Invalid WordPress bridge secret.'], 401);
            }

            return null;
        }

        private function platform_bridge_user_id(WP_REST_Request $request) {
            $body = $request->get_json_params();
            $uid = (int) ($request->get_param('wpUserId') ?? 0);
            if ($uid <= 0 && is_array($body)) {
                $uid = (int) ($body['wpUserId'] ?? 0);
            }
            if ($uid <= 0) {
                $email = sanitize_email((string) ($request->get_param('email') ?? ''));
                if ($email === '' && is_array($body)) {
                    $email = sanitize_email((string) ($body['email'] ?? ''));
                }
                if ($email !== '') {
                    $user = get_user_by('email', $email);
                    $uid = $user instanceof WP_User ? (int) $user->ID : 0;
                }
            }

            return $uid;
        }

        private function with_platform_bridge_user(WP_REST_Request $request, callable $callback) {
            $bridgeError = $this->validate_platform_bridge_request($request);
            if ($bridgeError instanceof WP_REST_Response) {
                return $bridgeError;
            }

            $uid = $this->platform_bridge_user_id($request);
            if ($uid <= 0) {
                return new WP_REST_Response(['error' => 'A valid wpUserId or email is required.'], 400);
            }

            $previous_user_id = get_current_user_id();
            wp_set_current_user($uid);

            try {
                return $callback($uid);
            } finally {
                wp_set_current_user($previous_user_id);
            }
        }

        public function platform_login_bridge(WP_REST_Request $request) {
            $expected = $this->platform_bridge_secret();
            if ($expected === '') {
                return new WP_REST_Response(['error' => 'WordPress platform bridge is not configured.'], 503);
            }

            $supplied = $request->get_header('x-stitchsense-wordpress-secret');
            if (!is_string($supplied) || $supplied === '' || !hash_equals($expected, $supplied)) {
                return new WP_REST_Response(['error' => 'Invalid WordPress bridge secret.'], 401);
            }

            $body = $request->get_json_params();
            $identifier = is_array($body) ? (string) ($body['identifier'] ?? $body['email'] ?? $body['username'] ?? '') : '';
            $identifier = sanitize_text_field(wp_unslash($identifier));
            $password = is_array($body) ? (string) ($body['password'] ?? '') : '';

            if ($identifier === '' || $password === '') {
                return new WP_REST_Response(['error' => 'Email/username and password are required.'], 400);
            }

            $user = wp_authenticate($identifier, $password);
            if (is_wp_error($user) || !($user instanceof WP_User) || empty($user->ID)) {
                return new WP_REST_Response(['error' => 'Invalid WordPress email/username or password.'], 401);
            }

            return new WP_REST_Response([
                'wpUserId' => (int) $user->ID,
                'email' => $user->user_email,
                'displayName' => $user->display_name ?: $user->user_login,
                'siteUrl' => home_url('/'),
                'roles' => array_values((array) $user->roles),
            ], 200);
        }

        public function platform_register_bridge(WP_REST_Request $request) {
            $expected = $this->platform_bridge_secret();
            if ($expected === '') {
                return new WP_REST_Response(['error' => 'WordPress platform bridge is not configured.'], 503);
            }

            $supplied = $request->get_header('x-stitchsense-wordpress-secret');
            if (!is_string($supplied) || $supplied === '' || !hash_equals($expected, $supplied)) {
                return new WP_REST_Response(['error' => 'Invalid WordPress bridge secret.'], 401);
            }

            $body = $request->get_json_params();
            $email = is_array($body) ? sanitize_email((string) ($body['email'] ?? '')) : '';
            $username = is_array($body) ? sanitize_user((string) ($body['username'] ?? ''), true) : '';
            $password = is_array($body) ? (string) ($body['password'] ?? '') : '';
            $display_name = is_array($body) ? sanitize_text_field((string) ($body['displayName'] ?? '')) : '';

            if ($email === '' || !is_email($email)) {
                return new WP_REST_Response(['error' => 'A valid email address is required.'], 400);
            }

            if ($username === '' || strlen($username) < 3) {
                return new WP_REST_Response(['error' => 'A username with at least 3 characters is required.'], 400);
            }

            if ($password === '' || strlen($password) < 8) {
                return new WP_REST_Response(['error' => 'A password with at least 8 characters is required.'], 400);
            }

            if (username_exists($username)) {
                return new WP_REST_Response(['error' => 'That username is already in use.'], 409);
            }

            if (email_exists($email)) {
                return new WP_REST_Response(['error' => 'That email address is already registered.'], 409);
            }

            $user_id = wp_insert_user([
                'user_login' => $username,
                'user_pass' => $password,
                'user_email' => $email,
                'display_name' => $display_name !== '' ? $display_name : $username,
                'nickname' => $display_name !== '' ? $display_name : $username,
                'role' => 'subscriber',
            ]);

            if (is_wp_error($user_id) || empty($user_id)) {
                $message = is_wp_error($user_id)
                    ? $user_id->get_error_message()
                    : 'WordPress could not create the account.';
                return new WP_REST_Response(['error' => $message], 500);
            }

            $user = get_user_by('id', (int) $user_id);
            if (!($user instanceof WP_User) || empty($user->ID)) {
                return new WP_REST_Response(['error' => 'WordPress created the account but could not load it back.'], 500);
            }

            return new WP_REST_Response([
                'wpUserId' => (int) $user->ID,
                'email' => $user->user_email,
                'displayName' => $user->display_name ?: $user->user_login,
                'siteUrl' => home_url('/'),
                'roles' => array_values((array) $user->roles),
            ], 201);
        }

        private function platform_password_reset_key($email) {
            return 'stitchsense_password_reset_' . hash('sha256', strtolower(trim((string) $email)));
        }

        public function platform_password_reset_request_bridge(WP_REST_Request $request) {
            $expected = $this->platform_bridge_secret();
            $supplied = $request->get_header('x-stitchsense-wordpress-secret');
            if ($expected === '' || !is_string($supplied) || !hash_equals($expected, $supplied)) {
                return new WP_REST_Response(['error' => 'Invalid WordPress bridge secret.'], 401);
            }

            $body = $request->get_json_params();
            $email = is_array($body) ? sanitize_email((string) ($body['email'] ?? '')) : '';
            $user = $email !== '' ? get_user_by('email', $email) : false;

            // Always return the same response so callers cannot discover registered accounts.
            if (!($user instanceof WP_User)) {
                return new WP_REST_Response(['ok' => true], 200);
            }

            $code = (string) random_int(100000, 999999);
            $record = [
                'user_id' => (int) $user->ID,
                'code_hash' => wp_hash_password($code),
                'attempts' => 0,
                'created_at' => time(),
            ];
            set_transient($this->platform_password_reset_key($email), $record, 15 * MINUTE_IN_SECONDS);

            $reset_link = 'stitchsense://forgot-password?email=' . rawurlencode($email);
            $subject = 'Your StitchSense password reset code';
            $message = "We received a request to reset your StitchSense password.\n\n";
            $message .= "Your one-time code is: {$code}\n\n";
            $message .= "Reset your password: {$reset_link}\n\n";
            $message .= "This code expires in 15 minutes. If you did not request this, you can ignore this email.";
            wp_mail($email, $subject, $message);

            return new WP_REST_Response(['ok' => true], 200);
        }

        public function platform_password_reset_confirm_bridge(WP_REST_Request $request) {
            $expected = $this->platform_bridge_secret();
            $supplied = $request->get_header('x-stitchsense-wordpress-secret');
            if ($expected === '' || !is_string($supplied) || !hash_equals($expected, $supplied)) {
                return new WP_REST_Response(['error' => 'Invalid WordPress bridge secret.'], 401);
            }

            $body = $request->get_json_params();
            $email = is_array($body) ? sanitize_email((string) ($body['email'] ?? '')) : '';
            $code = is_array($body) ? preg_replace('/\D+/', '', (string) ($body['code'] ?? '')) : '';
            $password = is_array($body) ? (string) ($body['password'] ?? '') : '';
            if ($email === '' || strlen($code) !== 6 || strlen($password) < 8) {
                return new WP_REST_Response(['error' => 'The code or new password is invalid.'], 400);
            }

            $key = $this->platform_password_reset_key($email);
            $record = get_transient($key);
            if (!is_array($record) || empty($record['code_hash']) || empty($record['user_id'])) {
                return new WP_REST_Response(['error' => 'That code is invalid or has expired.'], 400);
            }

            $attempts = (int) ($record['attempts'] ?? 0) + 1;
            if ($attempts > 5) {
                delete_transient($key);
                return new WP_REST_Response(['error' => 'Too many attempts. Request a new code.'], 429);
            }
            $record['attempts'] = $attempts;
            set_transient($key, $record, 15 * MINUTE_IN_SECONDS);

            if (!wp_check_password($code, (string) $record['code_hash'])) {
                return new WP_REST_Response(['error' => 'That code is invalid or has expired.'], 400);
            }

            $user = get_user_by('id', (int) $record['user_id']);
            if (!($user instanceof WP_User) || strtolower($user->user_email) !== strtolower($email)) {
                delete_transient($key);
                return new WP_REST_Response(['error' => 'That code is invalid or has expired.'], 400);
            }

            wp_set_password($password, (int) $user->ID);
            delete_transient($key);
            return new WP_REST_Response([
                'ok' => true,
                'wpUserId' => (int) $user->ID,
                'email' => $user->user_email,
            ], 200);
        }

        public function platform_export_bridge(WP_REST_Request $request) {
            $bridgeError = $this->validate_platform_bridge_request($request);
            if ($bridgeError instanceof WP_REST_Response) {
                return $bridgeError;
            }

            $uid = $this->platform_bridge_user_id($request);
            if ($uid <= 0) {
                return new WP_REST_Response(['error' => 'A valid wpUserId or email is required.'], 400);
            }

            $payload = StitchSense_Library::instance()->bridge_export_payload_for_user($uid);
            if (is_wp_error($payload)) {
                return new WP_REST_Response(['error' => $payload->get_error_message()], 404);
            }

            return new WP_REST_Response($payload, 200);
        }

        public function platform_ravelry_status_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->status($request);
            });
        }

        public function platform_ravelry_connect_url_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->connect_url($request);
            });
        }

        public function platform_ravelry_username_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->save_username($request);
            });
        }

        public function platform_ravelry_disconnect_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->disconnect($request);
            });
        }

        public function platform_ravelry_search_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->search($request);
            });
        }

        public function platform_ravelry_pattern_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->pattern($request);
            });
        }

        public function platform_ravelry_saved_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->saved($request);
            });
        }

        public function platform_ravelry_import_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return StitchSense_Ravelry::instance()->import($request);
            });
        }

        public function platform_chat_proxy_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                return $this->chat_proxy($request);
            });
        }

        public function platform_image_proxy_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                $payload = $request->get_json_params();
                if (!is_array($payload)) {
                    $payload = json_decode($request->get_body(), true);
                }

                if (!is_array($payload)) {
                    return new WP_REST_Response([
                        'success' => false,
                        'error' => 'Invalid Stitch Vision payload received by WordPress.',
                    ], 400);
                }

                $image_data_uri = isset($payload['image_data_uri']) ? (string) $payload['image_data_uri'] : '';
                if ($image_data_uri === '') {
                    return new WP_REST_Response([
                        'success' => false,
                        'error' => 'No image data was supplied for analysis.',
                    ], 400);
                }

                $workflow_payload = [
                    'question' => sanitize_text_field((string) ($payload['question'] ?? 'What stitch or issue is visible?')),
                    'session_id' => sanitize_text_field((string) ($payload['session_id'] ?? '')),
                    'skill_level' => sanitize_text_field((string) ($payload['skill_level'] ?? 'beginner')),
                    'project_id' => sanitize_text_field((string) ($payload['project_id'] ?? '')),
                    'original_filename' => sanitize_file_name((string) ($payload['original_filename'] ?? 'vision-upload.jpg')),
                    'original_size_bytes' => intval($payload['original_size_bytes'] ?? 0),
                    'optimised_size_bytes' => intval($payload['optimised_size_bytes'] ?? 0),
                    'image_was_optimised' => sanitize_text_field((string) ($payload['image_was_optimised'] ?? 'false')),
                    'optimised_width' => intval($payload['optimised_width'] ?? 0),
                    'optimised_height' => intval($payload['optimised_height'] ?? 0),
                    'mime_type' => sanitize_text_field((string) ($payload['mime_type'] ?? 'image/jpeg')),
                    'image_data_uri' => $image_data_uri,
                    'tool_mode' => sanitize_text_field((string) ($payload['tool_mode'] ?? 'stitch_image_analysis')),
                    'model' => sanitize_text_field((string) ($payload['model'] ?? get_option('stitchsense_vision_model', ''))),
                ];

                $result = StitchSense_Workflow_Client::post_json('image', $workflow_payload, 120);
                return new WP_REST_Response($result['payload'], intval($result['status'] ?? 200) ?: 200);
            });
        }

        public function platform_upload_proxy_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                if (!function_exists('stitchsense_v7437_upload_proxy')) {
                    return new WP_REST_Response([
                        'success' => false,
                        'error' => 'StitchSense upload proxy is not available in this plugin build.',
                    ], 503);
                }

                return stitchsense_v7437_upload_proxy($request);
            });
        }

        public function platform_library_delete_pattern_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                $request->set_param('platform_bridge_local', '1');
                return StitchSense_Library::instance()->delete_pattern($request);
            });
        }

        public function platform_delete_user_data_bridge(WP_REST_Request $request) {
            return $this->with_platform_bridge_user($request, function() use ($request) {
                $body = $request->get_json_params();
                if (!is_array($body)) {
                    $body = [];
                }
                if (($body['confirm'] ?? '') !== 'DELETE') {
                    $request->set_body(wp_json_encode(['confirm' => 'DELETE']));
                }
                $request->set_param('platform_bridge_local', '1');
                return StitchSense_Library::instance()->delete_user_data($request);
            });
        }

        public function platform_promotions_bridge(WP_REST_Request $request) {
            $bridgeError = $this->validate_platform_bridge_request($request);
            if ($bridgeError) {
                return $bridgeError;
            }
            $uid = $this->platform_bridge_user_id($request);
            return new WP_REST_Response($this->active_mobile_promotions_payload($uid));
        }

        private function platform_api_response($result, $success_status = 200) {
            if (is_wp_error($result)) {
                $data = $result->get_error_data();
                $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 502;
                return new WP_REST_Response([
                    'success' => false,
                    'error' => $result->get_error_message(),
                    'payload' => is_array($data) && isset($data['payload']) ? $data['payload'] : null,
                ], $status ?: 502);
            }

            return new WP_REST_Response(is_array($result) ? $result : [], $success_status);
        }

        private function project_request_body(WP_REST_Request $request) {
            $body = $request->get_json_params();
            return is_array($body) ? $body : [];
        }

        public function platform_projects_list(WP_REST_Request $request) {
            $params = [];
            foreach (['search', 'status', 'patternId'] as $key) {
                $value = sanitize_text_field((string) ($request->get_param($key) ?? ''));
                if ($value !== '') {
                    $params[$key] = $value;
                }
            }
            $path = 'projects';
            if (!empty($params)) {
                $path .= '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
            }

            return $this->platform_api_response(StitchSense_Platform_Client::request('GET', $path));
        }

        public function platform_projects_create(WP_REST_Request $request) {
            return $this->platform_api_response(
                StitchSense_Platform_Client::request('POST', 'projects', $this->project_request_body($request)),
                201
            );
        }

        public function platform_projects_get(WP_REST_Request $request) {
            $id = sanitize_text_field((string) $request->get_param('id'));
            return $this->platform_api_response(StitchSense_Platform_Client::request('GET', 'projects/' . rawurlencode($id)));
        }

        public function platform_projects_update(WP_REST_Request $request) {
            $id = sanitize_text_field((string) $request->get_param('id'));
            return $this->platform_api_response(
                StitchSense_Platform_Client::request('PUT', 'projects/' . rawurlencode($id), $this->project_request_body($request))
            );
        }

        public function platform_projects_delete(WP_REST_Request $request) {
            $id = sanitize_text_field((string) $request->get_param('id'));
            return $this->platform_api_response(
                StitchSense_Platform_Client::request('DELETE', 'projects/' . rawurlencode($id)),
                200
            );
        }

        public function platform_projects_sync_validation(WP_REST_Request $request) {
            $id = sanitize_text_field((string) $request->get_param('id'));
            return $this->platform_api_response(StitchSense_Platform_Client::request('GET', 'projects/' . rawurlencode($id) . '/sync-validation'));
        }

        public function platform_pattern_summary_refresh(WP_REST_Request $request) {
            $id = sanitize_text_field((string) $request->get_param('id'));
            $body = $request->get_json_params();
            if (!is_array($body)) {
                $body = [];
            }
            $payload = [
                'skillLevel' => sanitize_text_field((string) ($body['skillLevel'] ?? $body['skill_level'] ?? 'beginner')),
            ];

            return $this->platform_api_response(
                StitchSense_Platform_Client::request('POST', 'patterns/' . rawurlencode($id) . '/summary/refresh', $payload)
            );
        }

        private function chat_proxy_response($payload, $status = 200) {
            if (defined('REST_REQUEST') && REST_REQUEST) {
                return new WP_REST_Response($payload, $status);
            }

            status_header($status);
            wp_send_json($payload);
        }

        public function diagnostics(WP_REST_Request $request) {
            $ravelry = StitchSense_Ravelry::instance();
            $ravelry_status = $ravelry->status($request);
            $ravelry_data = $ravelry_status instanceof WP_REST_Response ? $ravelry_status->get_data() : [];
            $ravelry_settings = StitchSense_Ravelry::settings();

            return new WP_REST_Response([
                'success' => true,
                'plugin_version' => self::VERSION,
                'wordpress' => [
                    'rest_url' => esc_url_raw(rest_url('stitchsense/v1/')),
                    'site_url' => esc_url_raw(site_url('/')),
                    'home_url' => esc_url_raw(home_url('/')),
                    'is_ssl' => is_ssl(),
                    'current_user_id' => get_current_user_id(),
                ],
                'workflow' => StitchSense_Workflow_Client::diagnostics(),
                'ravelry' => [
                    'configured' => !empty($ravelry_data['configured']),
                    'connected' => !empty($ravelry_data['connected']),
                    'username' => sanitize_text_field($ravelry_data['username'] ?? ''),
                    'api_ok' => !empty($ravelry_data['api_ok']),
                    'api_error' => sanitize_text_field($ravelry_data['api_error'] ?? ''),
                    'api_warning' => sanitize_text_field($ravelry_data['api_warning'] ?? ''),
                    'callback_url' => esc_url_raw($ravelry_data['callback_url'] ?? ''),
                    'basic_configured' => !empty($ravelry_settings['basic_username']) && !empty($ravelry_settings['basic_password']),
                ],
            ]);
        }

        public function diagnostics_chat_test(WP_REST_Request $request) {
            $payload = [
                'action' => 'chat',
                'question' => 'Diagnostic test: reply with the word OK.',
                'tool_mode' => 'diagnostic',
                'session_id' => 'diagnostic_' . time(),
                'history' => [],
                'answer_mode' => 'general',
                'pattern_available' => false,
            ];
            $result = StitchSense_Workflow_Client::post_json('chat', $payload, 60);
            $response_payload = is_array($result['payload'] ?? null) ? $result['payload'] : [];
            return new WP_REST_Response([
                'success' => empty($response_payload['success']) ? false : (bool) $response_payload['success'],
                'http_status' => intval($result['status'] ?? 0),
                'workflow' => StitchSense_Workflow_Client::diagnostics(),
                'response' => [
                    'success' => $response_payload['success'] ?? null,
                    'error' => sanitize_text_field($response_payload['error'] ?? $response_payload['message'] ?? ''),
                    'answer_excerpt' => !empty($response_payload['answer']) ? substr(wp_strip_all_tags((string) $response_payload['answer']), 0, 160) : '',
                    'keys' => array_keys($response_payload),
                ],
            ], intval($result['status'] ?? 200) ?: 200);
        }

        public function chat_proxy($request = null) {
            try {
                if ($request instanceof WP_REST_Request) {
                    $payload = $request->get_json_params();
                    if (!is_array($payload)) {
                        $raw_body = $request->get_body();
                        $payload = json_decode($raw_body, true);
                    }
                } else {
                    // Admin AJAX/admin-post may arrive as JSON, form-encoded payload, or raw POST fields.
                    if (isset($_POST['payload'])) {
                        $payload = json_decode(wp_unslash($_POST['payload']), true);
                    } else {
                        $raw_body = file_get_contents('php://input');
                        $payload = json_decode($raw_body, true);
                        if (!is_array($payload) && !empty($_POST)) {
                            $payload = [];
                            foreach ($_POST as $key => $value) {
                                if ($key === 'action') { continue; }
                                $payload[$key] = is_string($value) ? sanitize_text_field(wp_unslash($value)) : $value;
                            }
                        }
                    }
                }

                if (!is_array($payload)) {
                    return $this->chat_proxy_response([
                        'success' => false,
                        'error' => 'Invalid StitchSense chat payload received by WordPress.'
                    ], 400);
                }

                $result = StitchSense_Workflow_Client::post_json('chat', $payload, 300);
                return $this->chat_proxy_response($result['payload'], $result['status']);
            } catch (Throwable $e) {
                return $this->chat_proxy_response([
                    'success' => false,
                    'error' => 'WordPress chat proxy error: ' . $e->getMessage(),
                ], 500);
            }
        }

        private function image_proxy_response($payload, $status = 200) {
            if (defined('REST_REQUEST') && REST_REQUEST) {
                return new WP_REST_Response($payload, $status);
            }

            status_header($status);
            wp_send_json($payload);
        }

        public function image_analysis_proxy($request = null) {
            $max_bytes = 50 * 1024 * 1024;

            try {
                if ($request instanceof WP_REST_Request) {
                    $payload = $request->get_json_params();
                    if (!is_array($payload)) {
                        $payload = json_decode($request->get_body(), true);
                    }

                    if (is_array($payload) && !empty($payload['image_data_uri'])) {
                        $image_data_uri = (string) $payload['image_data_uri'];
                        $workflow_payload = [
                            'question' => sanitize_text_field((string) ($payload['question'] ?? 'What stitch or issue is visible?')),
                            'session_id' => sanitize_text_field((string) ($payload['session_id'] ?? '')),
                            'skill_level' => sanitize_text_field((string) ($payload['skill_level'] ?? 'beginner')),
                            'project_id' => sanitize_text_field((string) ($payload['project_id'] ?? '')),
                            'original_filename' => sanitize_file_name((string) ($payload['original_filename'] ?? 'vision-upload.jpg')),
                            'original_size_bytes' => intval($payload['original_size_bytes'] ?? 0),
                            'optimised_size_bytes' => intval($payload['optimised_size_bytes'] ?? 0),
                            'image_was_optimised' => sanitize_text_field((string) ($payload['image_was_optimised'] ?? 'false')),
                            'optimised_width' => intval($payload['optimised_width'] ?? 0),
                            'optimised_height' => intval($payload['optimised_height'] ?? 0),
                            'mime_type' => sanitize_text_field((string) ($payload['mime_type'] ?? 'image/jpeg')),
                            'image_data_uri' => $image_data_uri,
                            'tool_mode' => sanitize_text_field((string) ($payload['tool_mode'] ?? 'stitch_image_analysis')),
                            'model' => sanitize_text_field((string) ($payload['model'] ?? get_option('stitchsense_vision_model', ''))),
                        ];

                        $result = StitchSense_Workflow_Client::post_json('image', $workflow_payload, 120);
                        return $this->image_proxy_response($result['payload'], $result['status']);
                    }
                }

                if (empty($_FILES['image']) || !isset($_FILES['image']['tmp_name'])) {
                    return $this->image_proxy_response(['success' => false, 'error' => 'No image was received by WordPress.'], 400);
                }

                $file = $_FILES['image'];
                if (!empty($file['error'])) {
                    return $this->image_proxy_response(['success' => false, 'error' => 'Image upload failed before analysis. Upload error code: ' . intval($file['error'])], 400);
                }
                if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
                    return $this->image_proxy_response(['success' => false, 'error' => 'Invalid image upload received by WordPress.'], 400);
                }
                if (!empty($file['size']) && intval($file['size']) > $max_bytes) {
                    return $this->image_proxy_response(['success' => false, 'error' => 'Image is over 50 MB.'], 413);
                }

                $check = wp_check_filetype_and_ext($file['tmp_name'], $file['name']);
                $mime = !empty($check['type']) ? $check['type'] : (!empty($file['type']) ? $file['type'] : 'application/octet-stream');
                $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
                if (!in_array($mime, $allowed, true)) {
                    return $this->image_proxy_response(['success' => false, 'error' => 'Please upload a JPG, PNG, WebP or HEIC image. Detected type: ' . $mime], 400);
                }

                $bytes = file_get_contents($file['tmp_name']);
                if ($bytes === false || $bytes === '') {
                    return $this->image_proxy_response(['success' => false, 'error' => 'WordPress could not read the optimised image file.'], 400);
                }

                // Send JSON/base64 to n8n instead of multipart. This avoids binary webhook edge-cases
                // and makes failures much easier to debug.
                $payload = [
                    'question' => isset($_POST['question']) ? sanitize_text_field(wp_unslash($_POST['question'])) : 'What stitch or issue is visible?',
                    'session_id' => isset($_POST['session_id']) ? sanitize_text_field(wp_unslash($_POST['session_id'])) : '',
                    'skill_level' => isset($_POST['skill_level']) ? sanitize_text_field(wp_unslash($_POST['skill_level'])) : 'beginner',
                    'project_id' => isset($_POST['project_id']) ? sanitize_text_field(wp_unslash($_POST['project_id'])) : '',
                    'original_filename' => isset($_POST['original_filename']) ? sanitize_file_name(wp_unslash($_POST['original_filename'])) : sanitize_file_name($file['name']),
                    'original_size_bytes' => isset($_POST['original_size_bytes']) ? intval($_POST['original_size_bytes']) : intval($file['size']),
                    'optimised_size_bytes' => isset($_POST['optimised_size_bytes']) ? intval($_POST['optimised_size_bytes']) : intval($file['size']),
                    'image_was_optimised' => isset($_POST['image_was_optimised']) ? sanitize_text_field(wp_unslash($_POST['image_was_optimised'])) : 'false',
                    'optimised_width' => isset($_POST['optimised_width']) ? intval($_POST['optimised_width']) : 0,
                    'optimised_height' => isset($_POST['optimised_height']) ? intval($_POST['optimised_height']) : 0,
                    'mime_type' => $mime,
                    'image_data_uri' => 'data:' . $mime . ';base64,' . base64_encode($bytes),
                    'tool_mode' => 'stitch_image_analysis',
                    'model' => get_option('stitchsense_vision_model', ''),
                ];

                $result = StitchSense_Workflow_Client::post_json('image', $payload, 120);
                return $this->image_proxy_response($result['payload'], $result['status']);
            } catch (Throwable $e) {
                return $this->image_proxy_response(['success' => false, 'error' => 'WordPress image proxy error: ' . $e->getMessage()], 500);
            }
        }

        public function render_shortcode($atts = []) {
            wp_enqueue_style('stitchsense-filepond');
            wp_enqueue_style('stitchsense-hub-pro-v5qs-fonts');
            wp_enqueue_style('stitchsense-hub-pro-v5qs');
            wp_enqueue_script('stitchsense-filepond');
            wp_enqueue_script('stitchsense-pdfjs');
            wp_enqueue_script('stitchsense-hub-pro-v5qs');

            $uid = 'stitchsense-hub-' . wp_generate_uuid4();
            $logo_url = esc_url(plugin_dir_url(__FILE__) . 'assets/stitchsense-logo_new.png');

            ob_start();
            ?>
            <section id="<?php echo esc_attr($uid); ?>" class="ss-hub" data-stitchsense-hub>
                <div class="ss-shell">
                    <header class="ss-topbar">
                        <div class="ss-brand">
                            <img src="<?php echo $logo_url; ?>" alt="StitchSense" class="ss-logo" loading="eager" />
                            <div class="ss-brand-copy">
                                <span class="ss-eyebrow">UK knitting & crochet assistant</span>
                                <h2>StitchSense AI Assistant Hub</h2>
                            </div>
                        </div>
                        <div class="ss-actions">
                            <select class="ss-skill" data-ss-skill aria-label="Choose skill level">
                                <option value="beginner">Beginner</option>
                                <option value="intermediate">Intermediate</option>
                                <option value="advanced">Advanced</option>
                            </select>
                            <button type="button" class="ss-reset" data-ss-reset>Reset</button>
                        </div>
                    </header>

                    <nav class="ss-tabs" aria-label="StitchSense tools">
                        <button type="button" class="ss-tab is-active" data-ss-tab="tools">Quick Tools</button>
                        <button type="button" class="ss-tab" data-ss-tab="chat">Pattern Chat</button>
                        <button type="button" class="ss-tab" data-ss-tab="rework">AI Rework</button>
                        <button type="button" class="ss-tab" data-ss-tab="library">My Library</button>
                        <button type="button" class="ss-tab" data-ss-tab="projects">Projects</button>
                        <button type="button" class="ss-tab" data-ss-tab="dictionary">Stitch Dictionary</button>
                        <button type="button" class="ss-tab" data-ss-tab="gauge">Gauge Calculator</button>
                        <button type="button" class="ss-tab" data-ss-tab="camera">Stitch Vision</button>
                    </nav>

                    <div class="ss-panels">
                        <div class="ss-panel" data-ss-panel="chat">
                            <div class="ss-chat-layout">
                                <aside class="ss-prompt-rail">
                                    <div class="ss-section-kicker"></div>
                                    <h3>Quick starts</h3>
                                    <p class="ss-mini-copy">Suggestions adapt from your recent chat, with useful defaults when the conversation is new.</p>
                                    <div class="ss-quick-list" data-ss-quick-starts></div>
                                </aside>
                                <main class="ss-chat-card">
                                    <div class="ss-messages" data-ss-messages aria-live="polite"></div>
                                    <div class="ss-thinking" data-ss-thinking hidden>StitchSense is thinking…</div>
	                                    <div class="ss-composer">
	                                        <textarea data-ss-question maxlength="1200" rows="3" placeholder="Paste a tricky pattern line or ask a question..."></textarea>
	                                        <div class="ss-composer-actions ss-v73-actions">
	                                            <div class="ss-send-upload-row">
	                                                <button type="button" data-ss-send aria-label="Ask StitchSense" class="ss-standard-btn ss-go-btn">Go!</button>
                                                <button type="button" class="ss-standard-btn ss-plus-btn" data-ss-upload-canvas-toggle aria-label="Open upload panel">+</button>
                                            </div>
	                                            <button type="button" class="ss-view-pattern-btn" data-ss-view-pattern hidden>View Pattern</button>
	                                        </div>
	                                    </div>
	                                    <div class="ss-followup-prompts" data-ss-followup-prompts aria-label="Suggested next questions"></div>
	                                    <div class="ss-upload-canvas" data-ss-upload-canvas hidden aria-live="polite">
                                        <div class="ss-chat-upload-overlay">
                                            <button type="button" class="ss-upload-canvas-close" data-ss-upload-canvas-close aria-label="Close upload panel">×</button>
                                            <div class="ss-file-drop ss-chat-file-drop" data-ss-file-drop role="button" tabindex="0" aria-label="Upload a pattern file">
                                                <input type="file" data-ss-file-input style="display:none!important;visibility:hidden!important;opacity:0!important;position:absolute!important;left:-999999px!important;width:0!important;height:0!important;" accept=".pdf,.docx,.txt,.rtf,.odt,.md,.html,.htm,.epub,.csv,.xlsx,.json,.xml,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/rtf,application/rtf,application/vnd.oasis.opendocument.text,text/markdown,text/html,application/epub+zip,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,application/xml,text/xml,image/jpeg,image/png,image/webp,image/gif,image/tiff">
                                                <div class="ss-chat-upload-cloud" aria-hidden="true">☁</div>
                                                <h4 data-ss-file-title>Drag &amp; drop to upload file</h4>
                                                <p><strong>OR</strong></p>
                                                <span class="ss-upload-browse-btn">Browse File</span>
                                                <small data-ss-file-subtitle>PDF, DOCX, TXT, RTF, ODT, MD, HTML, EPUB, CSV, XLSX, JSON, XML and common image formats.</small>
                                            </div>
                                            <input type="hidden" data-ss-upload-project-name value="">
                                            <input type="hidden" data-ss-upload-craft value="">
                                            <div class="ss-upload-progress" data-ss-upload-progress hidden>
                                                <span data-ss-upload-progress-label>Uploading…</span>
                                                <div class="ss-upload-progress-track"><i data-ss-upload-progress-bar></i></div>
                                            </div>
                                            <div class="ss-upload-result" data-ss-upload-result></div>
                                            <button type="button" class="ss-upload-submit ss-chat-upload-submit" data-ss-upload-submit disabled>Upload Pattern</button>
                                        </div>
                                    </div>
                                    <div class="ss-pattern-viewer" data-ss-pattern-viewer hidden aria-hidden="true">
                                        <div class="ss-pattern-viewer-backdrop" data-ss-pattern-viewer-backdrop></div>
                                        <div class="ss-pattern-viewer-dialog" role="dialog" aria-modal="true" aria-label="Uploaded pattern viewer">
                                            <div class="ss-pattern-viewer-head">
                                                <strong data-ss-pattern-viewer-title>Uploaded pattern</strong>
                                                <button type="button" data-ss-pattern-viewer-close aria-label="Close pattern viewer">×</button>
                                            </div>
                                            <div class="ss-pattern-viewer-toolbar" data-ss-pattern-toolbar>
                                                <button type="button" data-ss-pdf-prev aria-label="Previous page">‹</button>
                                                <span><b data-ss-pdf-page>1</b> / <b data-ss-pdf-pages>1</b></span>
                                                <button type="button" data-ss-pdf-next aria-label="Next page">›</button>
                                                <button type="button" data-ss-pdf-zoom-out aria-label="Zoom out">−</button>
                                                <button type="button" data-ss-pdf-zoom-in aria-label="Zoom in">+</button>
                                                <button type="button" data-ss-pdf-fit aria-label="Fit to width">Fit</button>
                                            </div>
                                            <div class="ss-pattern-viewer-stage" data-ss-pdf-stage>
                                                <canvas data-ss-pdf-canvas></canvas>
                                            </div>
                                            <div class="ss-pattern-viewer-fallback" data-ss-pattern-viewer-fallback hidden>Pattern preview is not available in this browser.</div>
                                        </div>
                                    </div>

                                </main>
                            </div>
</div>
                        <div class="ss-panel" data-ss-panel="library">
                            <div class="ss-library-page">
                                <div class="ss-library-hero" data-ss-library-hero>
                                    <div class="ss-library-hero-copy">
                                        <div class="ss-section-kicker">My Library</div>
                                        <h3>Your pattern collection</h3>
                                        <p>All your uploaded patterns, rewrites, and chat histories — saved, searchable, and ready to pick up where you left off.</p>
	                                    </div>
	                                    <div class="ss-library-hero-actions">
	                                        <button type="button" class="ss-standard-btn ss-go-btn ss-library-upload-btn" data-ss-open-upload-pattern data-ss-upload-origin="library">Upload New</button>
	                                        <button type="button" class="ss-secondary ss-library-ravelry-connect-btn" data-ss-ravelry-connect-header hidden>Connect Ravelry</button>
	                                        <button type="button" class="ss-secondary ss-library-ravelry-search-btn" data-ss-ravelry-open-search hidden>Search Ravelry</button>
	                                        <button type="button" class="ss-secondary ss-library-ravelry-import-btn" data-ss-ravelry-open-saved hidden>Import My Patterns</button>
	                                    </div>
                                </div>
                                <div class="ss-library-toolbar">
                                    <input type="text" class="ss-library-search" data-ss-library-search placeholder="Search patterns..." aria-label="Search patterns">
                                    <div class="ss-library-filters">
                                        <button type="button" class="ss-chip is-active" data-ss-library-craft="all">All</button>
                                        <button type="button" class="ss-chip" data-ss-library-craft="knitting">Knitting</button>
                                        <button type="button" class="ss-chip" data-ss-library-craft="crochet">Crochet</button>
                                        <select class="ss-library-sort" data-ss-library-sort aria-label="Sort patterns">
                                            <option value="recent">Most Recent</option>
                                            <option value="oldest">Oldest</option>
                                            <option value="title">Title A–Z</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="ss-library-grid" data-ss-library-grid></div>
                                <div class="ss-library-empty" data-ss-library-empty hidden>
                                    <div class="ss-library-empty-icon">📚</div>
                                    <h4>No patterns yet</h4>
                                    <p>Upload your first pattern to get started. It'll appear here along with all your chats and rewrites.</p>
                                    <button type="button" class="ss-standard-btn ss-go-btn" data-ss-open-upload-pattern data-ss-upload-origin="library">Upload a Pattern</button>
                                </div>
                                <div class="ss-library-loading" data-ss-library-loading hidden>
                                    <div class="ss-library-loading-spinner"></div>
                                    <span>Loading your library…</span>
                                </div>
                                <div class="ss-library-error" data-ss-library-error hidden>
                                    <p>Could not load your library. Please try again.</p>
                                    <button type="button" class="ss-secondary" data-ss-library-retry>Retry</button>
                                </div>
                                <div class="ss-library-auth" data-ss-library-auth hidden>
                                    <div class="ss-library-auth-card">
                                        <span class="ss-library-auth-icon">🔐</span>
                                        <h3>Sign in to save your patterns</h3>
                                        <p>Create a free account to build your pattern library, save chat histories, and keep your rewrites safe across devices.</p>
                                        <a href="<?php echo esc_url(wp_login_url(get_permalink())); ?>" class="ss-standard-btn ss-go-btn">Log In</a>
                                        <a href="<?php echo esc_url(wp_registration_url()); ?>" class="ss-library-auth-link">Create an account</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="ss-panel" data-ss-panel="projects">
                            <div class="ss-projects-page">
                                <div class="ss-library-hero ss-projects-hero">
                                    <div class="ss-library-hero-copy">
                                        <div class="ss-section-kicker">Projects</div>
                                        <h3>Track active makes</h3>
                                        <p>Start a project from a saved pattern, update progress, and keep your web and mobile project lists in sync.</p>
                                    </div>
                                    <div class="ss-library-hero-actions">
                                        <button type="button" class="ss-standard-btn ss-go-btn" data-ss-projects-new>New Project</button>
                                        <button type="button" class="ss-secondary" data-ss-projects-refresh>Refresh</button>
                                    </div>
                                </div>
                                <div class="ss-projects-toolbar">
                                    <input type="text" class="ss-library-search" data-ss-projects-search placeholder="Search projects..." aria-label="Search projects">
                                    <select class="ss-library-sort" data-ss-projects-status aria-label="Filter projects by status">
                                        <option value="">All active statuses</option>
                                        <option value="planned">Planned</option>
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                        <option value="completed">Completed</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                                <form class="ss-projects-form" data-ss-projects-form hidden>
                                    <div class="ss-projects-form-grid">
                                        <label>Saved pattern<select data-ss-project-pattern required><option value="">Choose a pattern...</option></select></label>
                                        <label>Project title<input type="text" data-ss-project-title maxlength="160" placeholder="Optional custom title"></label>
                                        <label>Status<select data-ss-project-status><option value="planned">Planned</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
                                        <label>Progress<input type="number" data-ss-project-progress min="0" max="100" step="1" value="0"></label>
                                        <label>Stage<input type="text" data-ss-project-stage maxlength="120" placeholder="Ribbing, sleeve 1, finishing..."></label>
                                        <label>Recipient<input type="text" data-ss-project-recipient maxlength="160" placeholder="Optional"></label>
                                    </div>
                                    <label>Notes<textarea data-ss-project-notes rows="3" placeholder="Yarn, fit notes, reminders..."></textarea></label>
                                    <div class="ss-projects-form-actions">
                                        <button type="submit" class="ss-standard-btn ss-go-btn">Save Project</button>
                                        <button type="button" class="ss-secondary" data-ss-projects-cancel>Cancel</button>
                                    </div>
                                    <p data-ss-projects-form-status></p>
                                </form>
                                <div class="ss-projects-grid" data-ss-projects-grid></div>
                                <div class="ss-library-empty" data-ss-projects-empty hidden>
                                    <h4>No projects yet</h4>
                                    <p>Create a project from a saved pattern to track progress across web and mobile.</p>
                                    <button type="button" class="ss-standard-btn ss-go-btn" data-ss-projects-new>New Project</button>
                                </div>
                                <div class="ss-library-loading" data-ss-projects-loading hidden>
                                    <div class="ss-library-loading-spinner"></div>
                                    <span>Loading your projects...</span>
                                </div>
                                <div class="ss-library-error" data-ss-projects-error hidden>
                                    <p>Could not load your projects. Please try again.</p>
                                    <button type="button" class="ss-secondary" data-ss-projects-retry>Retry</button>
                                </div>
                                <div class="ss-library-auth" data-ss-projects-auth hidden>
                                    <div class="ss-library-auth-card">
                                        <span class="ss-library-auth-icon">🔐</span>
                                        <h3>Sign in to sync projects</h3>
                                        <p>Projects use your shared StitchSense account so the same makes appear on web and mobile.</p>
                                        <a href="<?php echo esc_url(wp_login_url(get_permalink())); ?>" class="ss-standard-btn ss-go-btn">Log In</a>
                                        <a href="<?php echo esc_url(wp_registration_url()); ?>" class="ss-library-auth-link">Create an account</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="ss-panel" data-ss-panel="dictionary">
                            <div class="ss-dict-page">
                                <div class="ss-dict-hero">
                                    <div class="ss-dict-hero-icon">🧶</div>
                                    <div>
                                        <div class="ss-section-kicker">Reference library</div>
                                        <h3>Stitch Dictionary</h3>
                                        <p>Your complete guide to knitting and crochet stitches, abbreviations and UK/US terms.</p>
                                    </div>
                                </div>

                                <div class="ss-dict-layout">
                                    <aside class="ss-dict-sidebar" aria-label="Stitch dictionary filters">
                                        <div class="ss-dict-toggle" role="tablist" aria-label="Dictionary type">
                                            <button type="button" class="is-active" data-ss-dict-type="all">All</button>
                                            <button type="button" data-ss-dict-type="crochet">Crochet</button>
                                            <button type="button" data-ss-dict-type="knitting">Knitting</button>
                                        </div>

                                        <label class="ss-dict-field">
                                            <span>Search stitches</span>
                                            <input type="search" class="ss-search" data-ss-stitch-search placeholder="Search name, abbreviation, UK/US term..." />
                                        </label>

                                        <label class="ss-dict-field">
                                            <span>Filter by category</span>
                                            <select class="ss-dict-select" data-ss-dict-category>
                                                <option value="all">All Categories</option>
                                            </select>
                                        </label>

                                        <div class="ss-dict-tip">
                                            <b>Tip</b>
                                            <p>Search any name or abbreviation you know. Try “dc”, “treble”, “yarn over” or “increase”.</p>
                                        </div>

                                        <div class="ss-dict-category-list" data-ss-dict-category-list></div>
                                        <div class="ss-dict-total"><span>Total Stitches</span><b data-ss-dict-total>0</b></div>
                                    </aside>

                                    <section class="ss-dict-results" aria-live="polite">
                                        <div class="ss-dict-results-head">
                                            <div>
                                                <h4 data-ss-dict-heading>All Stitches</h4>
                                                <p data-ss-dict-subheading>Browse or search the full StitchSense library.</p>
                                            </div>
                                            <div class="ss-dict-sort-wrap">
                                                <label for="ss-dict-sort">Sort by:</label>
                                                <select id="ss-dict-sort" class="ss-dict-select" data-ss-dict-sort>
                                                    <option value="az">A - Z</option>
                                                    <option value="za">Z - A</option>
                                                    <option value="difficulty">Difficulty</option>
                                                    <option value="category">Category</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="ss-dictionary" data-ss-dictionary></div>
                                    </section>
                                </div>
                            </div>
                        </div>


                        <div class="ss-panel" data-ss-panel="camera">
                            <div class="ss-feature-page ss-camera-page">
                                <section class="ss-feature-hero">
                                    <div class="ss-section-kicker">Stitch Vision</div>
                                    <h3>Photo help for stitches</h3>
                                    <p>Upload a clear close-up of your knitting or crochet. Phone photos up to 50 MB are accepted and optimised before analysis, so users do not have to resize them manually.</p>
                                </section>
                                <section class="ss-camera-grid ss-camera-workspace">
                                    <div class="ss-tool-card ss-camera-upload-card">
                                        <h3>Upload photo</h3>
                                        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-ss-stitch-photo>
                                        <p class="ss-mini-copy">JPG, PNG, WebP or HEIC/HEIF. Maximum 50 MB. Large phone images are resized automatically before sending.</p>
                                        <div class="ss-camera-preview" data-ss-stitch-photo-preview>Preview appears here.</div>
                                        <label>What would you like help with?<textarea rows="3" data-ss-stitch-photo-question placeholder="e.g. Is this twisted? What stitch is this? Does my tension look even?"></textarea></label>
                                        <button type="button" class="ss-standard-btn ss-go-btn" data-ss-analyse-stitch-photo>Analyse photo</button>
                                    </div>
                                    <div class="ss-tool-card ss-camera-analysis-card ss-feature-result">
                                        <h3>Image analysis</h3>
                                        <div data-ss-stitch-camera-result class="ss-feature-empty">Upload a photo to start. If the image endpoint is not configured yet, I’ll tell you clearly.</div>
                                    </div>
                                </section>
                                <section class="ss-tool-card ss-wide ss-camera-tips-card ss-camera-tips-bottom">
                                    <h3>Pro tips</h3>
                                    <ul>
                                        <li>Use bright, even lighting.</li>
                                        <li>Lay the fabric flat.</li>
                                        <li>Keep the camera close, but not blurry.</li>
                                        <li>Include several stitches, not just one.</li>
                                        <li>Avoid heavy shadows and busy backgrounds.</li>
                                    </ul>
                                    <p class="ss-mini-copy">Privacy note: photos are only sent for analysis when an image-analysis endpoint is configured.</p>
                                </section>
                            </div>
                        </div>

                        <div class="ss-panel" data-ss-panel="gauge">
                            <div class="ss-gauge-calculator ss-gauge-calculator-v735" data-ss-gauge-calculator>
                                <div class="ss-gauge-hero-v735">
                                    <div>
                                        <div class="ss-section-kicker">Stage 2.1 tool</div>
                                        <h3>Gauge Calculator</h3>
                                        <p>Check whether your swatch or motif matches the pattern tension. Fill in what you know — the important fields are highlighted. Some patterns give stitch/row gauge, while others only give a finished block size. This tool now handles both.</p>
                                    </div>
                                    <button type="button" class="ss-gauge-pattern-btn" data-ss-use-pattern-gauge>Use uploaded pattern gauge</button>
                                </div>

                                <div class="ss-gauge-mode-tabs ss-gauge-mode-tabs-v7412" role="tablist" aria-label="Gauge calculator mode">
                                    <button type="button" class="is-active" data-ss-gauge-tab="simple" aria-pressed="true">Simple Mode</button>
                                    <button type="button" data-ss-gauge-tab="advanced" aria-pressed="false">Advanced Mode</button>
                                </div>
                                <div class="ss-gauge-mode-note-v7311" data-ss-gauge-mode-note>Use stitch/row gauge when the pattern gives stitches per 10 cm or 4 inches. If the pattern gives a finished block or motif size, use the block-size fields below.</div>

                                <div class="ss-gauge-flow-v735">
                                    <section class="ss-gauge-card-v735 ss-gauge-card-main">
                                        <div class="ss-gauge-card-head">
                                            <span>01</span>
                                            <div><h4>Pattern gauge</h4><p data-ss-gauge-pattern-help>Target tension from the pattern.</p></div>
                                        </div>
                                        <div class="ss-gauge-mini-grid">
                                            <label class="ss-gauge-important">Target stitches <em>important</em><input type="number" step="0.1" min="0" data-ss-target-stitches placeholder="e.g. 20"></label>
                                            <label>Target rows / rounds<input type="number" step="0.1" min="0" data-ss-target-rows placeholder="e.g. 28"></label>
                                            <label>Measured over<select data-ss-gauge-unit><option value="10cm">10 cm</option><option value="4in">4 inches</option><option value="custom">Custom cm</option></select></label>
                                            <label class="ss-custom-measure" hidden>Custom cm<input type="number" step="0.1" min="0.1" data-ss-gauge-custom-measure value="10"></label>
                                        </div>
                                    </section>

                                    <section class="ss-gauge-card-v735 ss-gauge-card-main">
                                        <div class="ss-gauge-card-head">
                                            <span>02</span>
                                            <div><h4>Your swatch</h4><p data-ss-gauge-swatch-help>Count stitches and rows across the same measurement.</p></div>
                                        </div>
                                        <div class="ss-gauge-mini-grid">
                                            <label class="ss-gauge-important">Your stitches <em>important</em><input type="number" step="0.1" min="0" data-ss-actual-stitches placeholder="e.g. 22"></label>
                                            <label>Your rows / rounds<input type="number" step="0.1" min="0" data-ss-actual-rows placeholder="e.g. 30"></label>
                                            <label>Craft type<select data-ss-gauge-craft><option value="unsure">Unsure</option><option value="knitting">Knitting</option><option value="crochet">Crochet</option></select></label>
                                            <label>Project type<select data-ss-project-type><option value="unknown">Unknown</option><option value="garment">Garment / fitted item</option><option value="blanket_scarf">Scarf / blanket / flat item</option><option value="toy_amigurumi">Toy / amigurumi</option><option value="motif">Motif / block</option></select></label>
                                            <label>Current needle/hook<input type="text" data-ss-current-tool-size placeholder="e.g. 4 mm"></label>
                                        </div>
                                    </section>

                                    <details class="ss-gauge-advanced-v735">
                                        <summary data-ss-advanced-summary>Optional size check</summary>
                                        <div class="ss-gauge-mini-grid">
                                            <label>Pattern needle/hook<input type="text" data-ss-pattern-tool-size placeholder="e.g. 4 mm"></label>
                                            <label>Pattern stitch count<input type="number" step="1" min="0" data-ss-pattern-stitch-count placeholder="e.g. 120"></label>
                                            <label>Pattern row count<input type="number" step="1" min="0" data-ss-pattern-row-count placeholder="e.g. 160"></label>
                                            <label>Pattern block / motif width cm<input type="number" step="0.1" min="0" data-ss-pattern-width-cm placeholder="e.g. 44.5"></label>
                                            <label>Pattern block / motif height cm<input type="number" step="0.1" min="0" data-ss-pattern-height-cm placeholder="e.g. 47"></label>
                                            <label>Your block / motif width cm<input type="number" step="0.1" min="0" data-ss-actual-width-cm placeholder="e.g. 46"></label>
                                            <label>Your block / motif height cm<input type="number" step="0.1" min="0" data-ss-actual-height-cm placeholder="e.g. 48"></label>
                                            <label>Yarn / weight notes<input type="text" data-ss-yarn-weight placeholder="e.g. Fishermen's Wool, 2 strands held together"></label>
                                            <label>Good tolerance %<input type="number" step="0.5" min="0" data-ss-gauge-good-tolerance value="3"></label>
                                            <label>Noticeable tolerance %<input type="number" step="0.5" min="1" data-ss-gauge-noticeable-tolerance value="8"></label>
                                            <label>Major tolerance %<input type="number" step="0.5" min="2" data-ss-gauge-major-tolerance value="15"></label>
                                        </div>
                                    </details>

                                    <section class="ss-gauge-result-shell-v735">
                                        <div class="ss-gauge-actions-v735">
                                            <button type="button" class="ss-standard-btn ss-go-btn" data-ss-calc-gauge>Check my gauge</button>
                                            <button type="button" class="ss-secondary" data-ss-reset-gauge>Reset</button>
                                        </div>
                                        <div class="ss-result ss-gauge-result" data-ss-gauge-result>Start with the target stitches and your swatch stitches. I’ll do the maths without the migraine.</div>
                                        <button type="button" class="ss-secondary" data-ss-explain-gauge hidden>Ask StitchSense to explain this</button>
                                    </section>
                                </div>

                                <div class="ss-tool-card ss-gauge-reference-card ss-gauge-reference-card-v735">
                                    <h4>Needle & hook reference</h4>
                                    <p>UK/EU metric sizing first, with US equivalents for reference only.</p>
                                    <div class="ss-gauge-list" data-ss-gauge-list></div>
                                </div>
                            </div>
                        </div>

                        <div class="ss-panel" data-ss-panel="rework">
                            <div class="ss-rework-page">
                                <div class="ss-chat-layout ss-rework-layout">
                                    <aside class="ss-prompt-rail ss-rework-rail">
                                        <div class="ss-section-kicker">AI Rework</div>
                                        <h3>Rewrite your pattern</h3>
                                        <p class="ss-mini-copy">Describe your change in plain English — yarn conversion, custom size, stitch swap, or a different construction method — and get a mathematically recalculated pattern.</p>
                                        <div class="ss-rework-side-cards">
                                            <div class="ss-rework-side-card">
                                                <span class="ss-rework-side-icon">🧶</span>
                                                <div>
                                                    <strong>Yarn weight</strong>
                                                    <p>DK → Aran, 4-ply → chunky, or any weight conversion.</p>
                                                </div>
                                            </div>
                                            <div class="ss-rework-side-card">
                                                <span class="ss-rework-side-icon">📏</span>
                                                <div>
                                                    <strong>Custom size</strong>
                                                    <p>Adjust the finished measurements to fit your body.</p>
                                                </div>
                                            </div>
                                            <div class="ss-rework-side-card">
                                                <span class="ss-rework-side-icon">🔀</span>
                                                <div>
                                                    <strong>Stitch pattern</strong>
                                                    <p>Swap stockinette for cables, ribbing, lace or texture.</p>
                                                </div>
                                            </div>
                                            <div class="ss-rework-side-card">
                                                <span class="ss-rework-side-icon">🔧</span>
                                                <div>
                                                    <strong>Construction</strong>
                                                    <p>Convert seamed to seamless, flat to round, or bottom-up to top-down.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </aside>
                                    <main class="ss-chat-card ss-rework-main">
                                        <div class="ss-rework-intro" data-ss-rework-intro>
                                            <div class="ss-rework-intro-card">
                                                <div class="ss-rework-intro-icon">🔄</div>
                                                <h3>AI Pattern Rewriting</h3>
                                                <p>Describe what you want to change about your uploaded pattern. The system will ask any clarifying questions then produce a fully rewritten, stitch-count-accurate pattern that preserves the original design intent.</p>
                                                <div class="ss-rework-pattern-summary" data-ss-rework-pattern-summary hidden></div>
                                                <button type="button" class="ss-secondary ss-rework-upload-trigger" data-ss-open-upload-pattern data-ss-upload-origin="rework">Upload a Pattern</button>
                                            </div>
                                            <div class="ss-rework-examples">
                                                <span class="ss-section-kicker">Try asking for</span>
                                                <button type="button" class="ss-chip" data-ss-rework-prompt="Rewrite this pattern for Aran weight yarn, keeping the same chest measurement.">Use Aran instead of DK</button>
                                                <button type="button" class="ss-chip" data-ss-rework-prompt="Rewrite this sweater for a 122 cm bust and 91 cm waist with 5 cm longer sleeves.">Custom size & measurements</button>
                                                <button type="button" class="ss-chip" data-ss-rework-prompt="Replace the stockinette body with a 6-stitch cable panel repeat, keeping the same silhouette.">Stitch pattern substitution</button>
                                                <button type="button" class="ss-chip" data-ss-rework-prompt="Rewrite this bottom-up seamed cardigan as a top-down raglan worked in one piece.">Construction conversion</button>
                                                <button type="button" class="ss-chip" data-ss-rework-prompt="Rewrite this wool sweater for 100% cotton, same measurements and drape.">Fibre substitution</button>
                                            </div>
                                            <div class="ss-rework-status" data-ss-rework-status>
                                                <span class="ss-rework-status-dot"></span>
                                                <span data-ss-rework-status-text>Ready to start. Describe your desired change above.</span>
                                            </div>
                                        </div>

                                        <div class="ss-rework-result" data-ss-rework-result hidden>
                                            <div class="ss-rework-result-head">
                                                <div class="ss-rework-result-title-bar">
                                                    <h3 data-ss-rework-result-title>Rewritten pattern</h3>
                                                    <span class="ss-rework-result-badge" data-ss-rework-result-badge>AI-generated</span>
                                                </div>
                                                <div class="ss-rework-changes" data-ss-rework-changes></div>
                                            </div>
                                            <div class="ss-rework-result-body" data-ss-rework-result-body></div>
                                            <div class="ss-rework-actions">
                                                <button type="button" class="ss-secondary" data-ss-rework-copy>Copy to clipboard</button>
                                                <button type="button" class="ss-secondary" data-ss-rework-download>Download as TXT</button>
                                                <button type="button" class="ss-secondary" data-ss-rework-refine>Refine this rewrite</button>
                                                <button type="button" class="ss-secondary" data-ss-rework-compare>Compare with original</button>
                                            </div>
                                            <div class="ss-rework-disclaimer">
                                                This is an AI-generated rewrite. Swatch, verify your gauge, and count your rows carefully before casting on.
                                            </div>
                                        </div>

                                        <div class="ss-rework-compare-view" data-ss-rework-compare-view hidden>
                                            <div class="ss-rework-compare-head">
                                                <h4>Before &amp; After Comparison</h4>
                                                <button type="button" class="ss-rework-compare-close" data-ss-rework-compare-close>×</button>
                                            </div>
                                            <div class="ss-rework-compare-panels">
                                                <div class="ss-rework-compare-panel">
                                                    <strong>Original</strong>
                                                    <div data-ss-rework-compare-original></div>
                                                </div>
                                                <div class="ss-rework-compare-panel">
                                                    <strong>Rewritten</strong>
                                                    <div data-ss-rework-compare-rewritten></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="ss-thinking" data-ss-rework-thinking hidden>StitchSense is rewriting your pattern… this may take a minute.</div>
                                        <div class="ss-composer ss-rework-composer">
                                            <textarea data-ss-rework-question maxlength="2000" rows="3" placeholder="Describe your desired change, e.g. &quot;Rewrite this DK cardigan for Aran, keeping a 106 cm chest&quot;"></textarea>
                                            <div class="ss-composer-actions ss-v73-actions">
                                                <button type="button" data-ss-rework-send aria-label="Start rewriting" class="ss-standard-btn ss-go-btn">Rewrite</button>
                                                <button type="button" class="ss-standard-btn ss-rework-reset-btn" data-ss-rework-reset aria-label="Reset">Reset</button>
                                            </div>
                                        </div>
                                    </main>
                                </div>
                            </div>
                        </div>

                        <div class="ss-panel is-active" data-ss-panel="tools">
                            <div class="ss-quicktools-page">
                                <section class="ss-quicktools-hero">
                                    <div class="ss-quicktools-hero-copy">
                                        <div class="ss-section-kicker">Quick Tools</div>
                                        <h3>Fast help when your project gets fiddly</h3>
                                        <p>Jump straight to the most useful StitchSense tools, run quick checks, or build a better question without hunting around the app.</p>
                                    </div>
                                    <div class="ss-quicktools-hero-badge">
                                        <span>Smart shortcuts</span>
                                        <b>Pattern-aware</b>
                                    </div>
                                </section>

                                <div class="ss-quicktools-grid">
                                    <article class="ss-quick-action-card ss-primary-action">
                                        <div class="ss-quick-icon">📄</div>
                                        <div>
                                            <span class="ss-section-kicker">Uploaded pattern</span>
                                            <h4>Review my pattern</h4>
                                            <p>Upload a PDF pattern and StitchSense will analyse it, summarise it, flag possible issues and keep it ready for pattern-aware help.</p>
                                        </div>
                                        <div class="ss-quick-card-actions">
                                            <button type="button" class="ss-secondary ss-upload-pattern-shortcut" data-ss-open-upload-pattern>Upload Pattern</button>
                                        </div>
                                    </article>

                                    <article class="ss-quick-action-card">
                                        <div class="ss-quick-icon">📏</div>
                                        <div>
                                            <span class="ss-section-kicker">Tension & fit</span>
                                            <h4>Fix my gauge</h4>
                                            <p>Use the full calculator when stitch counts, rows, finished size or hook/needle changes matter.</p>
                                        </div>
                                        <button type="button" class="ss-secondary ss-jump-btn" data-ss-open-panel="gauge">Open Gauge Calculator</button>
                                    </article>

                                    <article class="ss-quick-action-card">
                                        <div class="ss-quick-icon">📸</div>
                                        <div>
                                            <span class="ss-section-kicker">Photo help</span>
                                            <h4>Identify a stitch</h4>
                                            <p>Upload a photo when you are unsure what stitch, texture or mistake you are looking at.</p>
                                        </div>
                                        <button type="button" class="ss-secondary ss-jump-btn" data-ss-open-panel="camera">Open Stitch Vision</button>
                                    </article>

                                    <article class="ss-quick-action-card">
                                        <div class="ss-quick-icon">🧶</div>
                                        <div>
                                            <span class="ss-section-kicker">Reference</span>
                                            <h4>Decode a term</h4>
                                            <p>Look up UK/US crochet terms, abbreviations, knitting stitches and common techniques.</p>
                                        </div>
                                        <button type="button" class="ss-secondary ss-jump-btn" data-ss-open-panel="dictionary">Open Stitch Dictionary</button>
                                    </article>

                                    <article class="ss-quick-action-card">
                                        <div class="ss-quick-icon">🔄</div>
                                        <div>
                                            <span class="ss-section-kicker">Pattern adaption</span>
                                            <h4>Rewrite my pattern</h4>
                                            <p>Convert yarn weights, resize for your measurements, swap stitch patterns or change construction — a guided conversational rewrite.</p>
                                        </div>
                                        <button type="button" class="ss-secondary ss-jump-btn" data-ss-open-panel="rework">Open AI Rework</button>
                                    </article>
                                </div>

                                <section class="ss-quicktools-mini">
                                    <div class="ss-quicktools-section-head">
                                        <span class="ss-section-kicker">Mini calculators</span>
                                        <h4>Useful checks without leaving this screen</h4>
                                    </div>

                                    <div class="ss-quicktools-mini-grid">
                                        <div class="ss-tool-card ss-mini-tool-card">
                                            <div class="ss-tool-headline"><span>🧵</span><div><h3>Yarn Quantity Estimator</h3><p>Planning a wider scarf, blanket or panel? Enter the original yarn amount and width, then the new width. StitchSense estimates the extra yarn to buy before you run short at the worst possible moment.</p></div></div>
                                            <div class="ss-mini-fields">
                                                <label>Pattern metres<input type="number" step="1" data-ss-yarn-metres value="800"></label>
                                                <label>Original width cm<input type="number" step="0.1" data-ss-yarn-old-width value="50"></label>
                                                <label>New width cm<input type="number" step="0.1" data-ss-yarn-new-width value="60"></label>
                                            </div>
                                            <button type="button" class="ss-secondary" data-ss-calc-yarn>Estimate yarn</button>
                                            <div class="ss-result" data-ss-yarn-result></div>
                                        </div>

                                        <div class="ss-tool-card ss-mini-tool-card">
                                            <div class="ss-tool-headline"><span>🪡</span><div><h3>Needle/Hook Direction</h3><p>Compare your swatch stitches with the pattern tension. If your stitches are too tight or too loose, this gives the usual needle or hook direction to try next.</p></div></div>
                                            <div class="ss-mini-fields two">
                                                <label>Your sts / 10 cm<input type="number" step="0.1" data-ss-your-sts value="20"></label>
                                                <label>Pattern sts / 10 cm<input type="number" step="0.1" data-ss-pattern-sts value="22"></label>
                                            </div>
                                            <button type="button" class="ss-secondary" data-ss-calc-adjustment>Get guidance</button>
                                            <div class="ss-result" data-ss-adjustment-result></div>
                                        </div>

                                        <div class="ss-tool-card ss-mini-tool-card">
                                            <div class="ss-tool-headline"><span>👕</span><div><h3>Ease Helper</h3><p>Enter your body measurement and the finished garment measurement. The result shows how much ease you have, so you can spot whether the fit will be close, relaxed or oversized.</p></div></div>
                                            <div class="ss-mini-fields two">
                                                <label>Body cm<input type="number" step="0.1" data-ss-body-measure value="96"></label>
                                                <label>Garment cm<input type="number" step="0.1" data-ss-garment-measure value="104"></label>
                                            </div>
                                            <button type="button" class="ss-secondary" data-ss-calc-ease>Calculate ease</button>
                                            <div class="ss-result" data-ss-ease-result></div>
                                        </div>
                                    </div>
                                </section>


                                <section class="ss-quicktools-prompt-strip">
                                    <div class="ss-quicktools-section-head">
                                        <span class="ss-section-kicker">Useful panic buttons</span>
                                        <h4>Ask a sharper question in one click</h4>
                                    </div>
                                    <div class="ss-quick-prompt-grid">
                                        <button type="button" class="ss-secondary" data-ss-prompt="My stitch count has changed. Help me troubleshoot where I may have gained or lost stitches.">Stitch count rescue</button>
                                        <button type="button" class="ss-secondary" data-ss-prompt="Check this repeat maths for me and explain how many stitches I should have before and after the repeat:">Repeat maths check</button>
                                        <button type="button" class="ss-secondary" data-ss-prompt="Help me choose the best size from this pattern based on my body measurement, finished measurement and intended ease.">Choose my size</button>
                                        <button type="button" class="ss-secondary" data-ss-prompt="Explain the potential issues detected in my uploaded pattern and tell me what to check before I start.">Explain issue flags</button>
                                    </div>
                                </section>

                                <section class="ss-quicktools-helper-row">
                                    <div class="ss-tool-card ss-needle-hook-reference-card ss-needle-hook-reference-card-vertical">
                                        <div class="ss-tool-headline"><span>🪡</span><div><h3>Needle & hook reference</h3><p>Metric first, with common UK and US equivalents. Handy when patterns, yarn bands and online tutorials do not speak the same language.</p></div></div>
                                        <div class="ss-gauge-list ss-gauge-list-vertical" data-ss-gauge-list></div>
                                    </div>

                                    <div class="ss-tool-card ss-project-ready-card">
                                        <div class="ss-tool-headline"><span>✅</span><div><h3>Project Ready Check</h3><p>A proper pre-flight checklist before you start. Tick each item as you confirm it, then use the readiness score to spot what still needs checking.</p></div></div>
                                        <div class="ss-ready-meter" data-ss-ready-meter>
                                            <div><b data-ss-ready-count>0 / 12 complete</b><span data-ss-ready-status>Needs preparation</span></div>
                                            <div class="ss-ready-track"><span data-ss-ready-bar></span></div>
                                        </div>
                                        <div class="ss-checklist ss-project-ready-checklist" data-ss-ready-checklist>
                                            <label><input type="checkbox"> Yarn weight confirmed</label>
                                            <label><input type="checkbox"> Yarn quantity confirmed</label>
                                            <label><input type="checkbox"> Needle/hook size checked in mm</label>
                                            <label><input type="checkbox"> Gauge swatch completed</label>
                                            <label><input type="checkbox"> Finished measurements checked</label>
                                            <label><input type="checkbox"> Abbreviations understood</label>
                                            <label><input type="checkbox"> UK vs US terminology confirmed</label>
                                            <label><input type="checkbox"> Pattern read through once</label>
                                            <label><input type="checkbox"> Special stitches practised</label>
                                            <label><input type="checkbox"> Stitch markers ready</label>
                                            <label><input type="checkbox"> Blocking requirements checked</label>
                                            <label><input type="checkbox"> Difficulty matches skill level</label>
                                        </div>
                                    </div>

                                    <div class="ss-tool-card ss-question-builder-card">
                                        <div class="ss-tool-headline"><span>💬</span><div><h3>Helpful Question Builder</h3><p>Click a prompt to open Pattern Chat with a sharper question already drafted. Less waffle in, better answer out.</p></div></div>
                                        <div class="ss-question-builder-groups">
                                            <div class="ss-question-group"><h4>Pattern Chat</h4><div class="ss-prompt-buttons">
                                                <button type="button" class="ss-secondary" data-ss-prompt="Explain this row in plain English and tell me exactly what to do first:">Explain this row</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Explain this round in plain English and flag anything I should watch:">Explain this round</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Explain this repeat and help me understand how many times to work it:">Explain this repeat</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Explain this abbreviation and show me how it is worked:">Explain abbreviation</button>
                                            </div></div>
                                            <div class="ss-question-group"><h4>Sizing Help</h4><div class="ss-prompt-buttons">
                                                <button type="button" class="ss-secondary" data-ss-prompt="Help me choose the best size from this pattern based on my body measurement, finished measurement and intended ease.">Choose my size</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Compare two sizes in this pattern and explain which is likely to fit better:">Compare sizes</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Check the finished measurements and explain the ease in plain English:">Check ease</button>
                                            </div></div>
                                            <div class="ss-question-group"><h4>Yarn Help</h4><div class="ss-prompt-buttons">
                                                <button type="button" class="ss-secondary" data-ss-prompt="I want to substitute this yarn. Tell me what to check for weight, fibre, gauge and yardage:">Yarn substitution</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Will I have enough yarn? Here is the pattern yarn amount and the yarn I own:">Yarn quantity check</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Convert this yarn requirement into the number of balls or skeins I need:">Convert to skeins</button>
                                            </div></div>
                                            <div class="ss-question-group"><h4>Troubleshooting</h4><div class="ss-prompt-buttons">
                                                <button type="button" class="ss-secondary" data-ss-prompt="My stitch count has changed. Help me find where I may have gained or lost stitches:">Stitch count rescue</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Check this pattern instruction for possible issues and explain what I should verify:">Find pattern issues</button>
                                                <button type="button" class="ss-secondary" data-ss-prompt="Explain this instruction in plain English and tell me what to do first:">Plain English</button>
                                            </div></div>
                                            <div class="ss-popular-question-chips"><h4>Popular questions</h4><div>
                                                <button type="button" class="ss-chip" data-ss-prompt="How much yarn do I need for this project?">How much yarn?</button>
                                                <button type="button" class="ss-chip" data-ss-prompt="Can I use a different yarn for this pattern?">Can I swap yarn?</button>
                                                <button type="button" class="ss-chip" data-ss-prompt="Do I need to match gauge exactly for this project?">Does gauge matter?</button>
                                                <button type="button" class="ss-chip" data-ss-prompt="What does this abbreviation mean?">Abbreviation help</button>
                                                <button type="button" class="ss-chip" data-ss-prompt="How do I fix a missed increase or decrease?">Fix a mistake</button>
                                            </div></div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </div></section>
            <?php
            return ob_get_clean();
        }
    }



    /**
     * v7.4.37 hard proxy routes.
     * Registered outside the class route table so they still exist if another cached class definition is present.
     */
    if (!function_exists('stitchsense_v7437_json_response')) {
        function stitchsense_v7437_json_response($payload, $status = 200) {
            return new WP_REST_Response($payload, $status);
        }
    }

    if (!function_exists('stitchsense_v7437_require_logged_in_rest_user')) {
        function stitchsense_v7437_require_logged_in_rest_user() {
            if (!is_user_logged_in()) {
                return new WP_Error(
                    'stitchsense_auth_required',
                    'You must be signed in to use StitchSense assistant tools.',
                    ['status' => 401]
                );
            }
            return true;
        }
    }

    if (!function_exists('stitchsense_v7437_read_json_payload')) {
        function stitchsense_v7437_read_json_payload($request) {
            if ($request instanceof WP_REST_Request) {
                $payload = $request->get_json_params();
                if (is_array($payload)) return $payload;
                $raw = $request->get_body();
                $decoded = json_decode($raw, true);
                return is_array($decoded) ? $decoded : [];
            }
            $raw = file_get_contents('php://input');
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }
    }

    if (!function_exists('stitchsense_v7437_n8n_post_json_text')) {
        function stitchsense_v7437_n8n_post_json_text($endpoint, $payload, $timeout = 300) {
            $type = (strpos((string) $endpoint, 'upload') !== false) ? 'upload' : 'chat';
            $result = StitchSense_Workflow_Client::post_json($type, $payload, $timeout);
            return ['__error' => empty($result['success']), 'status' => $result['status'], 'payload' => $result['payload']];
        }
    }

    if (!function_exists('stitchsense_v7437_n8n_post_upload_form')) {
        function stitchsense_v7437_n8n_post_upload_form($endpoint, $payload, $timeout = 300) {
            $result = StitchSense_Workflow_Client::post_form('upload', $payload, $timeout);
            return ['__error' => empty($result['success']), 'status' => $result['status'], 'payload' => $result['payload']];
        }
    }

    if (!function_exists('stitchsense_v7437_upload_payload_local_path')) {
        function stitchsense_v7437_upload_payload_local_path($payload) {
            $uploads = wp_upload_dir();
            if (!empty($uploads['error']) || empty($uploads['basedir'])) return '';

            $base_dir = wp_normalize_path(realpath($uploads['basedir']));
            if (!$base_dir) return '';

            $candidates = [];
            if (!empty($payload['wp_upload_relative_path'])) {
                $candidates[] = trailingslashit($uploads['basedir']) . ltrim((string) $payload['wp_upload_relative_path'], '/');
            }
            if (!empty($payload['file_url']) && !empty($uploads['baseurl'])) {
                $file_url = (string) $payload['file_url'];
                $base_url = (string) $uploads['baseurl'];
                if (strpos($file_url, $base_url) === 0) {
                    $relative = ltrim(substr($file_url, strlen($base_url)), '/');
                    $candidates[] = trailingslashit($uploads['basedir']) . $relative;
                }
            }

            foreach ($candidates as $candidate) {
                $real = realpath($candidate);
                if (!$real || !is_readable($real)) continue;
                $normal = wp_normalize_path($real);
                if (strpos($normal, $base_dir . '/') !== 0) continue;
                return $normal;
            }

            return '';
        }
    }

    if (!function_exists('stitchsense_v7437_upload_payload_remote_temp_path')) {
        function stitchsense_v7437_upload_payload_remote_temp_path($payload) {
            $file_url = isset($payload['file_url']) ? esc_url_raw((string) $payload['file_url']) : '';
            if ($file_url === '') return '';

            $parts = wp_parse_url($file_url);
            $scheme = isset($parts['scheme']) ? strtolower((string) $parts['scheme']) : '';
            if (!in_array($scheme, ['http', 'https'], true)) {
                return new WP_Error('stitchsense_invalid_upload_file_url', 'The mobile upload bridge received an invalid file URL.', ['status' => 400]);
            }

            require_once ABSPATH . 'wp-admin/includes/file.php';
            $timeout = 300;
            add_filter('http_request_timeout', function () use ($timeout) { return $timeout; }, 1000);
            $tmp = download_url($file_url, $timeout);
            if (is_wp_error($tmp)) {
                $host = isset($parts['host']) ? (string) $parts['host'] : '';
                $path = isset($parts['path']) ? (string) $parts['path'] : '';
                return new WP_Error(
                    'stitchsense_upload_file_download_failed',
                    'WordPress could not download the temporary mobile upload file from ' . $host . $path . ': ' . $tmp->get_error_message(),
                    ['status' => 502]
                );
            }

            if (!is_string($tmp) || !is_readable($tmp)) {
                return new WP_Error('stitchsense_upload_file_unreadable', 'WordPress downloaded the temporary mobile upload file but could not read it.', ['status' => 502]);
            }

            return $tmp;
        }
    }

    if (!function_exists('stitchsense_v7437_n8n_post_upload_multipart')) {
        function stitchsense_v7437_n8n_post_upload_multipart($endpoint, $payload, $file_path, $timeout = 300) {
            if (!function_exists('curl_init') || !class_exists('CURLFile')) {
                return ['__error' => true, 'status' => 501, 'payload' => [
                    'success' => false,
                    'error' => 'Server cannot forward saved pattern files because PHP cURL file upload support is unavailable.',
                ]];
            }

            $result = StitchSense_Workflow_Client::post_upload_multipart('upload', $payload, $file_path, $timeout);
            return ['__error' => empty($result['success']), 'status' => $result['status'], 'payload' => $result['payload']];
        }
    }

    if (!function_exists('stitchsense_v7437_chat_proxy')) {
        function stitchsense_v7437_chat_proxy($request) {
            $payload = stitchsense_v7437_read_json_payload($request);
            if (!$payload) {
                return stitchsense_v7437_json_response(['success' => false, 'error' => 'Invalid StitchSense chat payload.'], 400);
            }
            $result = stitchsense_v7437_n8n_post_json_text('chat', $payload, 300);
            return stitchsense_v7437_json_response($result['payload'], $result['status']);
        }
    }

    if (!function_exists('stitchsense_v7437_upload_proxy')) {
        function stitchsense_v7437_upload_proxy($request) {
            $payload = stitchsense_v7437_read_json_payload($request);
            if (!$payload || (empty($payload['file_data_uri']) && empty($payload['file_url']))) {
                return stitchsense_v7437_json_response(['success' => false, 'error' => 'No pattern file was received.'], 400);
            }
            if (empty($payload['file_data_uri'])) {
                $file_path = stitchsense_v7437_upload_payload_local_path($payload);
                if ($file_path) {
                    $multipart = stitchsense_v7437_n8n_post_upload_multipart('upload', $payload, $file_path, 300);
                    if (!empty($multipart['payload']) && (int) $multipart['status'] !== 501) {
                        return stitchsense_v7437_json_response($multipart['payload'], $multipart['status']);
                    }
                }
                $remote_temp_path = stitchsense_v7437_upload_payload_remote_temp_path($payload);
                if (is_wp_error($remote_temp_path)) {
                    $status_data = $remote_temp_path->get_error_data();
                    $status = is_array($status_data) && isset($status_data['status']) ? (int) $status_data['status'] : 502;
                    return stitchsense_v7437_json_response([
                        'success' => false,
                        'error' => $remote_temp_path->get_error_message(),
                    ], $status ?: 502);
                }
                if ($remote_temp_path) {
                    try {
                        $multipart = stitchsense_v7437_n8n_post_upload_multipart('upload', $payload, $remote_temp_path, 300);
                        if (!empty($multipart['payload']) && (int) $multipart['status'] !== 501) {
                            return stitchsense_v7437_json_response($multipart['payload'], $multipart['status']);
                        }
                    } finally {
                        @unlink($remote_temp_path);
                    }
                }
            }
            $result = stitchsense_v7437_n8n_post_upload_form('upload', $payload, 300);
            return stitchsense_v7437_json_response($result['payload'], $result['status']);
        }
    }

    add_action('rest_api_init', function () {
        register_rest_route('stitchsense/v1', '/chat-proxy', [
            'methods' => 'POST',
            'callback' => 'stitchsense_v7437_chat_proxy',
            'permission_callback' => 'stitchsense_v7437_require_logged_in_rest_user',
        ]);
        register_rest_route('stitchsense/v1', '/upload-proxy', [
            'methods' => 'POST',
            'callback' => 'stitchsense_v7437_upload_proxy',
            'permission_callback' => 'stitchsense_v7437_require_logged_in_rest_user',
        ]);
    }, 1);

    StitchSense_Assistant_Hub_Pro_V5::instance();
}
