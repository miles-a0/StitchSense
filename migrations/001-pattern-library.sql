-- StitchSense v7.6.0 — Pattern Library schema
-- Run against stitchsense-postgres (port 2303)

CREATE TABLE IF NOT EXISTS user_patterns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wp_user_id      BIGINT NOT NULL,
    title           TEXT NOT NULL DEFAULT 'Untitled',
    craft_type      TEXT,
    original_filename TEXT,
    file_url        TEXT,
    pattern_summary_html TEXT,
    pattern_summary_text TEXT,
    pattern_summary_structured JSONB DEFAULT '{}',
    detected_design_code TEXT,
    project_id      TEXT,
    file_id         TEXT,
    job_id          TEXT,
    metadata        JSONB DEFAULT '{}',
    source          TEXT DEFAULT 'upload',
    parent_pattern_id UUID REFERENCES user_patterns(id) ON DELETE SET NULL,
    is_archived     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_patterns_wp_user ON user_patterns(wp_user_id);
CREATE INDEX IF NOT EXISTS idx_user_patterns_parent  ON user_patterns(parent_pattern_id);
CREATE INDEX IF NOT EXISTS idx_user_patterns_project ON user_patterns(project_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wp_user_id      BIGINT NOT NULL,
    pattern_id      UUID REFERENCES user_patterns(id) ON DELETE CASCADE,
    title           TEXT DEFAULT 'Untitled chat',
    skill_level     TEXT DEFAULT 'beginner',
    is_archived     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_pattern ON chat_sessions(wp_user_id, pattern_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    kind            TEXT,
    tool_mode       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

CREATE TABLE IF NOT EXISTS rewrite_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wp_user_id      BIGINT NOT NULL,
    pattern_id      UUID REFERENCES user_patterns(id) ON DELETE CASCADE,
    rewrite_result  TEXT NOT NULL,
    rewrite_changes JSONB DEFAULT '[]',
    rewrite_warnings JSONB DEFAULT '[]',
    confidence_score INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewrite_sessions_pattern ON rewrite_sessions(pattern_id);

CREATE TABLE IF NOT EXISTS user_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wp_user_id      BIGINT NOT NULL,
    service         TEXT NOT NULL DEFAULT 'ravelry',
    access_token    TEXT,
    refresh_token   TEXT,
    token_expires   TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wp_user_id, service)
);

CREATE TABLE IF NOT EXISTS user_settings (
    wp_user_id      BIGINT PRIMARY KEY,
    default_skill   TEXT DEFAULT 'beginner',
    measurement_unit TEXT DEFAULT 'metric',
    language        TEXT DEFAULT 'uk',
    preferences     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='wp_user_id') THEN
        ALTER TABLE projects ADD COLUMN wp_user_id BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pattern_metadata' AND column_name='wp_user_id') THEN
        ALTER TABLE pattern_metadata ADD COLUMN wp_user_id BIGINT;
    END IF;
END $$;
