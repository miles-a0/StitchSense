CREATE UNIQUE INDEX IF NOT EXISTS idx_user_patterns_unique_ravelry_import
  ON user_patterns (user_id, (metadata->>'ravelry_id'))
  WHERE deleted_at IS NULL
    AND COALESCE(metadata->>'ravelry_id', '') <> '';
