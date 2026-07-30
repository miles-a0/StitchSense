CREATE TABLE IF NOT EXISTS stash_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('yarn', 'needle-hook', 'tool')),
    name TEXT NOT NULL,
    quantity TEXT,
    unit TEXT,
    brand TEXT,
    yarn_weight TEXT,
    fibre TEXT,
    colour TEXT,
    dye_lot TEXT,
    size TEXT,
    material TEXT,
    location TEXT,
    reserved_for TEXT,
    notes TEXT,
    image_file_key TEXT,
    image_mime_type TEXT,
    image_file_size BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stash_items_user_updated
    ON stash_items(user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stash_items_user_category
    ON stash_items(user_id, category, updated_at DESC)
    WHERE deleted_at IS NULL;
