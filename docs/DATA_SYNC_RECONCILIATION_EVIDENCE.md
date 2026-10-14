# StitchSense Data And Sync Reconciliation Evidence

Evidence recorded against `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`. Counts only: no customer content, file names, secrets, tokens, or email addresses. Test-account identities are held privately by the owner.

## Run 1: staging WordPress library import (2026-10-13)

### Inputs

| Input | Value / evidence |
| --- | --- |
| Git commit SHA | `main` at `9d34099` (includes PR #75 and PR #78). Confirm the staging host checkout matches before sign-off. |
| API environment | Staging, `https://staging-stitchsense.zu-auto.co.uk` (container `stitchsense-api-staging`) |
| WordPress environment | Staging, `https://staging.catlowyarns.co.uk`. Plugin storage mode `wordpress` (no external Postgres connection). |
| Database snapshot / backup ID | `/opt/stitchsense-staging/backups/staging-before-wp-import-20261013-2224.dump` (taken before import) |
| Object-storage bucket | `stitchsense-patterns-staging` |
| Mobile build ID | Not exercised in this run |
| Test users | User A (WordPress user 1, admin) and User B (WordPress user 4). Private evidence only. |

### Isolation preflight

| Check | Result |
| --- | --- |
| Staging API `WORDPRESS_SITE_URL`, `N8N_*_URL`, bucket, database name | All staging values; database `stitchsense_staging` |
| Bridge secret differs from production (SHA-256 fingerprint) | Different |
| `postgres` / `minio` hostnames resolve only to staging containers | Yes, despite the API also joining `my-main-net` (proxy network: Nginx Proxy Manager and the production API only) |
| Staging WordPress workflow endpoints and Platform API URL | Staging values (checked in WordPress admin) |
| Live `catlowyarns.co.uk` file links in export | 0 |

### Import method

Each user signed in through the staging API `POST /auth/wordpress-login`, which runs the WordPress library sync. `POST /sync/wordpress` was then run a second time to prove idempotency. The legacy `migration:wordpress` script was deliberately not used because it assigns new IDs on every run and would duplicate records alongside the sync. Legacy file ownership was recorded with `build-wordpress-file-owners.js --apply` (5 files, 0 conflicts).

### Count reconciliation

| Resource | WordPress count | API DB count | Mobile count | Exceptions |
| --- | ---: | ---: | ---: | --- |
| Linked accounts | 2 | 2 | Not checked | None |
| Patterns | 23 (A 14, B 9) | 23 (A 14, B 9) | Not checked | None. Pattern parity matched 23 of 23, nothing missing or extra. Second sync created no duplicates. |
| Pattern files | 19 with a file, 4 Ravelry entries with details only | 19 downloadable via signed links (18 WordPress, 1 MinIO) | Not checked | None |
| Pattern chats | 3 (A 0, B 3) | 5 (A 3, B 2) | Not checked | E1, E2 |
| Pattern chat messages | 39 (A 0, B 39) | 42 (A 5, B 37) | Not checked | E1, E2 |
| Pattern rewrites | 4 (A 0, B 4) | 4 (A 0, B 4) | Not checked | None |
| Projects, counters, work logs, project photos | Platform only | 0 | Not checked | Integrity check passed, 0 orphans |
| Stash items, stash photos | Platform only | Not checked | Not checked | Outstanding |
| Deleted/tombstoned records | Not checked | Not checked | Not checked | Outstanding |

### Exceptions

| ID | Exception | Assessment | Action |
| --- | --- | --- | --- |
| E1 | User A has 3 chats (5 messages) in the API and 0 in WordPress | Owner requirement (2026-10-14): app chats must show on the web and web chats in the app. With the WordPress Platform API setting enabled, the plugin's web chat endpoints list, create, read, and append chats through the API, so both surfaces share one store. The WordPress count here is the legacy local store only. | Confirm in the browser that User A's app chats appear on the web and a web chat appears in the API (Run 2). Platform API must stay enabled in production for this to hold. |
| E2 | User B has 1 WordPress chat (2 messages) not imported | That chat references a pattern no longer in the WordPress export. The sync correctly refuses a chat whose pattern does not exist. Not an importer bug. | Accept, or clean up the orphaned chat in WordPress |
| E3 | Staging `N8N_IMAGE_URL` points at `staging-stitchsense-image-analysis`, which n8n reports as not registered | Stitch Vision still worked: the WordPress image proxy is tried first, and a 404 from the direct image webhook falls back to the chat webhook. The direct call wasted a request and recorded an error on each use. | Set `N8N_IMAGE_URL` to `staging-pattern-helper-chat` on the staging host (matches `.env.staging.example`) |
| E4 | `my-main-net` is attached to `stitchsense-api-staging` but not declared in `docker-compose.staging.yml` | Proxy reachability would be lost when the container is recreated. Name resolution was verified safe. | Fixed in `docker-compose.staging.yml` (`reverse_proxy` network, as in production) |
| E5 | A chat could be started on, or receive messages for, a pattern that had been deleted, and the AI request still carried the deleted pattern's context | Found while reviewing the stale-ID scenario. `POST /chats` checked ownership but not deletion, and the chat message routes did not check the bound pattern. | Fixed: `POST /chats`, `POST /chats/:id/messages`, and `PUT /chats/:id/messages` now return 404 for deleted patterns, with a regression test |

### Object storage and file access

| Check | Result |
| --- | --- |
| Every active DB file reference has an object | Pass: 19 of 19 owner downloads returned the PDF |
| Signed URLs require owner access | Pass: every file link was signed (WordPress) or presigned (MinIO) |
| Raw WordPress upload URLs without a signature | Pass: 3 of 3 sampled returned HTTP 403 |
| Cross-user access to patterns, files, thumbnails, chats, rewrites | Pass: 138 requests (B to A 84, A to B 54), 0 leaks |
| Orphan objects quarantined before deletion | Not checked |
| Deleted account replay after restore | Not checked |

### Pattern context matrix

| Scenario | Result |
| --- | --- |
| Pattern A chat cannot read Pattern B content | Pass at API guard level: sending another pattern's ID into a pattern chat returned 409 before any workflow call |
| Another user cannot start a chat, post into a chat, or rewrite with someone else's pattern | Pass: 404 on 3 patterns for chat and rewrite, and on posting into another user's chat session |
| Metadata-only paid Ravelry pattern blocks AI content operations | Pass: rewrite refused with 409 on all 4 Ravelry entries with details only |
| Stored-source Ravelry pattern allows AI content operations | Not checked (needs a real AI call) |
| Deleted pattern cannot be opened through stale IDs | Not checked |
| App relaunch and reinstall | Not checked (device) |

### Outstanding for Workstream 5

- Web upload appears in the mobile Library, and mobile upload appears on the web, including a large PDF.
- Mobile delete followed by re-sync must not resurrect the record. Web delete/update follows the agreed rule.
- Deleted pattern opened through a stale ID.
- Stash counts and stash image owner scoping.
- Mobile counts column, and the relaunch/reinstall matrix on a device.
- Close exceptions E1 and E3 on staging, and confirm the E5 fix on staging after deployment.

### Decision

| Field | Value |
| --- | --- |
| Reconciliation decision | Continue (import and API-level checks passed; device and bidirectional checks outstanding) |
| Decision owner |  |
| Decision time |  |
| Exceptions accepted |  |
| Follow-up issues | E1 to E5 |
