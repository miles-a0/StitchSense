-- Owners of WordPress-hosted pattern files stored before per-user folders existed.
CREATE TABLE IF NOT EXISTS wordpress_pattern_file_owners (
    relative_path TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wordpress_pattern_file_owners_user
    ON wordpress_pattern_file_owners(user_id);
