CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id UUID NOT NULL REFERENCES user_patterns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    craft_type TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('planned', 'active', 'paused', 'completed', 'archived')),
    stage_label TEXT NOT NULL DEFAULT 'Getting started',
    progress_mode TEXT NOT NULL DEFAULT 'percent'
        CHECK (progress_mode IN ('percent', 'rows', 'rounds', 'motifs', 'sections')),
    progress_value NUMERIC(10,2),
    progress_percent INT NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    recipient TEXT,
    is_gift BOOLEAN NOT NULL DEFAULT FALSE,
    deadline_at TIMESTAMPTZ,
    notes TEXT,
    cover_image_url TEXT,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    last_worked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
    ON projects(user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_pattern
    ON projects(pattern_id, updated_at DESC)
    WHERE deleted_at IS NULL;
