CREATE TABLE IF NOT EXISTS project_pattern_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_id UUID NOT NULL REFERENCES user_patterns(id) ON DELETE CASCADE,
  mark_type TEXT NOT NULL CHECK (mark_type IN ('resume', 'bookmark', 'annotation')),
  label TEXT NOT NULL,
  page_number INTEGER,
  location_label TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_project_pattern_marks_project
  ON project_pattern_marks (project_id, sort_order ASC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_pattern_marks_pattern
  ON project_pattern_marks (pattern_id, created_at DESC)
  WHERE deleted_at IS NULL;
