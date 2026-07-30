CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    stripe_customer_id TEXT UNIQUE,
    standard_trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS linked_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_subscription_id TEXT,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_end TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription
    ON subscriptions(provider, provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS manual_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('lifetime_pro', 'extended_trial', 'courtesy_access')),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    reason TEXT,
    granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    legacy_wp_user_id BIGINT,
    title TEXT NOT NULL DEFAULT 'Untitled',
    craft_type TEXT,
    original_filename TEXT,
    file_url TEXT,
    file_key TEXT,
    file_size BIGINT,
    file_mime_type TEXT,
    file_extension TEXT,
    storage_provider TEXT,
    source_url TEXT,
    pattern_summary_html TEXT,
    pattern_summary_text TEXT,
    pattern_summary_structured JSONB NOT NULL DEFAULT '{}',
    detected_design_code TEXT,
    project_id TEXT,
    file_id TEXT,
    job_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'upload',
    parent_pattern_id UUID REFERENCES user_patterns(id) ON DELETE SET NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_patterns_user_updated ON user_patterns(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_patterns_legacy_wp_user ON user_patterns(legacy_wp_user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES user_patterns(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled chat',
    skill_level TEXT NOT NULL DEFAULT 'beginner',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    kind TEXT,
    tool_mode TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);

CREATE TABLE IF NOT EXISTS rewrite_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES user_patterns(id) ON DELETE CASCADE,
    prompt TEXT,
    rewrite_result TEXT NOT NULL,
    rewrite_changes JSONB NOT NULL DEFAULT '[]',
    rewrite_warnings JSONB NOT NULL DEFAULT '[]',
    confidence_score INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, service)
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_skill TEXT NOT NULL DEFAULT 'beginner',
    measurement_unit TEXT NOT NULL DEFAULT 'metric',
    language TEXT NOT NULL DEFAULT 'uk',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
