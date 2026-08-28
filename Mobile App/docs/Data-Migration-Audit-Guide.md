# Data Migration Audit Guide

This guide is for auditing real WordPress export payloads before importing them into `stitchsense-api`.

## Purpose

The audit step answers a few important questions before any write happens:

- How many patterns, chats, messages, and rewrites are in the export?
- How many patterns still depend on `file_url` only?
- Are there broken references between chats/messages/rewrites and patterns?
- Are there duplicate `project_id` values that may cause merged or ambiguous records?

## Input

Use a WordPress export JSON generated from:

- `WordPress Admin -> StitchSense Pro -> Migration Export`
- or the bridge/admin export routes already added to the plugin

Example file:

- `/root/stitchsense-user-export-1.json`

## Run The Audit

From the backend project:

```bash
cd /opt/stitchsense-mobile/backend/stitchsense-api
npm run build
npm run audit:wordpress-export -- --input /root/stitchsense-user-export-1.json
npm run audit:platform-data -- --email user@example.com
```

If running inside the API container:

```bash
docker cp /root/stitchsense-user-export-1.json stitchsense-api:/tmp/stitchsense-user-export-1.json
docker exec -it stitchsense-api npm run audit:wordpress-export -- --input /tmp/stitchsense-user-export-1.json
docker exec -it stitchsense-api npm run audit:platform-data -- --email user@example.com
```

## What To Look For

Healthy results usually mean:

- counts match what the user expects in WordPress
- `Chats referencing missing patterns: 0`
- `Rewrites referencing missing patterns: 0`
- `Messages referencing missing sessions: 0`
- duplicate `project_id` count is low or understood

Possible warning signs:

- a large number of patterns missing `file_url`
- chat or rewrite records pointing at patterns that do not exist in the same export
- many duplicate `project_id` values
- user email or legacy WordPress user ID missing

## After The Audit

If the export looks healthy:

```bash
npm run migration:wordpress -- --input /root/stitchsense-user-export-1.json --email user@example.com --dry-run
npm run migration:wordpress -- --input /root/stitchsense-user-export-1.json --email user@example.com
```

Then verify:

```bash
curl -s https://stitchsense.zu-auto.co.uk/patterns \
  -H "authorization: Bearer YOUR_ACCESS_TOKEN"
npm run validate:pattern-files -- --email user@example.com --limit 20
```

And in the mobile app:

1. sign in
2. open `Library`
3. tap `Re-sync library`

## Platform Audit Commands

Audit the shared platform database:

```bash
npm run audit:platform-data -- --limit 20
npm run audit:platform-data -- --email user@example.com
```

Validate imported pattern file links:

```bash
npm run validate:pattern-files -- --limit 20
npm run validate:pattern-files -- --email user@example.com --limit 20
```

These checks help answer:

- did the import create the expected counts in `user_patterns`, `chat_sessions`, and `rewrite_sessions`?
- are imported records orphaned?
- do file URLs or signed object-storage links actually resolve?

## Suggested Audit Order For Production Users

1. admin account
2. stitchsense account
3. highest-activity beta testers
4. users with uploads + chat history + rewrites
5. users with Ravelry imports only

That sequence helps catch the tricky edge cases first.
