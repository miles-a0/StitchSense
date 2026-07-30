# Data Migration Runbook

## Goal

Move existing StitchSense web data into the shared platform database without breaking the current WordPress plugin.

## Inputs

The importer expects a JSON export per user containing:

- `user.email`
- `user.display_name`
- `user.legacy_wp_user_id`
- `patterns`
- `chat_sessions`
- `chat_messages`
- `rewrite_sessions`

The shape intentionally matches the current WordPress fallback/library export concepts.

## Export From WordPress

Once the updated `stitchsense-assistant-hub-pro` plugin is installed on the live site, an administrator can export any user's current StitchSense data with:

```text
GET /wp-json/stitchsense/v1/admin/export-user-data?user_id=<wp-user-id>
```

or:

```text
GET /wp-json/stitchsense/v1/admin/export-user-data?email=user@example.com
```

This returns a JSON payload containing:

- `user`
- `patterns`
- `chat_sessions`
- `chat_messages`
- `rewrite_sessions`
- `settings`

Save that response to a file and feed it directly into the importer below.

## Dry Run

```bash
cd "Mobile App/backend/stitchsense-api"
npm run migration:wordpress -- --input /path/to/user-export.json --dry-run
```

## Import

```bash
cd "Mobile App/backend/stitchsense-api"
npm run migration:wordpress -- --input /path/to/user-export.json --email user@example.com
```

## Validation Checklist

- Confirm user exists in `users`.
- Confirm imported rows in `user_patterns`.
- Confirm imported `file_url` values open from admin/web.
- Confirm imported chat sessions and messages are linked to the right pattern.
- Confirm imported rewrites are linked to the right pattern.
- Confirm `/patterns`, `/patterns/:id/chats`, and `/patterns/:id/rewrites` return imported rows.

## Rollback Plan

Before running imports on production, take a PostgreSQL backup.

If one user's import needs to be rolled back:

```sql
BEGIN;
DELETE FROM rewrite_sessions WHERE user_id = '<user-id>';
DELETE FROM chat_messages
WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = '<user-id>');
DELETE FROM chat_sessions WHERE user_id = '<user-id>';
DELETE FROM user_patterns WHERE user_id = '<user-id>' AND source = 'wordpress_import';
INSERT INTO audit_events (target_user_id, event_type, metadata)
VALUES ('<user-id>', 'migration.wordpress_import.rolled_back', '{}');
COMMIT;
```

If a full migration needs to be rolled back, restore the PostgreSQL backup and leave the WordPress plugin untouched.
