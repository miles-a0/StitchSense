ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS yarn_details TEXT,
  ADD COLUMN IF NOT EXISTS needle_hook_details TEXT;
