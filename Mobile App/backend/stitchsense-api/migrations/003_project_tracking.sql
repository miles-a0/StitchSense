CREATE TABLE IF NOT EXISTS project_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    counter_type TEXT NOT NULL DEFAULT 'custom'
        CHECK (counter_type IN ('rows', 'rounds', 'repeats', 'sections', 'motifs', 'custom')),
    current_value INT NOT NULL DEFAULT 0,
    target_value INT,
    step_value INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_counters_project_sort
    ON project_counters(project_id, sort_order, created_at)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_work_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL DEFAULT 'note'
        CHECK (entry_type IN ('note', 'progress', 'session', 'milestone')),
    title TEXT NOT NULL DEFAULT 'Update',
    body TEXT,
    progress_percent INT CHECK (progress_percent >= 0 AND progress_percent <= 100),
    minutes_spent INT CHECK (minutes_spent IS NULL OR minutes_spent >= 0),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_work_log_project_created
    ON project_work_log(project_id, created_at DESC)
    WHERE deleted_at IS NULL;
