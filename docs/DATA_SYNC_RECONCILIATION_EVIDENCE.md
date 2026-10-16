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
| Stash items, stash photos | Platform only | Not checked in Run 1 | Not checked | See Run 3 |
| Deleted/tombstoned records | Not checked in Run 1 | Not checked in Run 1 | Not checked | See Runs 2 and 3 |

## Exceptions (all runs)

| ID | Exception | Assessment | Status |
| --- | --- | --- | --- |
| E1 | User A has 3 chats (5 messages) in the API and 0 in WordPress | Owner requirement (2026-10-14): app chats must show on the web and web chats in the app. With the WordPress Platform API setting enabled, the plugin's web chat endpoints list, create, read, and append chats through the API, so both surfaces share one store. The WordPress count is the legacy local store only. | Closed: confirmed in the browser and the app (Run 2). Platform API must stay enabled in production WordPress. |
| E2 | User B has 1 WordPress chat (2 messages) not imported | That chat references a pattern no longer in the WordPress export. The sync correctly refuses a chat whose pattern does not exist. Not an importer bug. | Open: accept, or clean up the orphaned chat in WordPress |
| E3 | Staging `N8N_IMAGE_URL` pointed at `staging-stitchsense-image-analysis`, which n8n reports as not registered | Stitch Vision still worked through the WordPress image proxy and the chat-webhook fallback, but each direct call wasted a request and recorded an error. | Closed: set to `staging-pattern-helper-chat` on the staging host (Run 2) |
| E4 | `my-main-net` was attached to `stitchsense-api-staging` by hand through an untracked override file | Proxy reachability would be lost when the container was recreated. Name resolution was verified safe. | Closed: declared in `docker-compose.staging.yml` (PR #79); override file moved to backups |
| E5 | A chat could be started on, or receive messages for, a deleted pattern, and the AI request still carried the deleted pattern's context | `POST /chats` checked ownership but not deletion, and the chat message routes did not check the bound pattern. | Closed: fixed with a regression test (PR #79), confirmed on staging (Run 2) |
| E6 | After deleting a pattern through the API, staging WordPress still exported it and the reconciliation reported it as missing | WordPress deletes by archiving (`is_archived`) and its export includes archived patterns. The sync ignored the flag, so archived patterns could be imported as active on first sync, and a deleted pattern stayed deleted only because WordPress stamped the archive slightly earlier than the API delete. Zone-less WordPress timestamps were read in the host's time zone. | Closed: archived patterns are never imported, retire the matching platform pattern unless it was changed after the archive, and are left out of counts; zone-less timestamps are read as UTC. Regression test (PR #79), confirmed on staging (Run 2). |
| E7 | Renaming a WordPress-imported pattern in the app or on the website would be undone by the next sync | Platform edits do not update the legacy WordPress copy, and the sync copied every field from that older copy over the platform pattern without comparing timestamps. Found by code review before the rename check. | Fixed: the sync only overwrites a pattern when the WordPress copy is newer. Regression test added. Closed: rename in the app and summary edit on the website survived re-sync on staging (Run 4). |
| E8 | "Archive" on the website fails while the Platform API setting is enabled | The plugin forwards website pattern updates to the API but dropped `is_archived`, so an archive became an empty update and returned "No valid fields to update." Found by code review before the website checks. | Fixed in plugin 7.7.44 (forwards `isArchived`). Closed: website archive and delete passed on staging (Run 4). |

## Object storage and file access (all runs)

| Check | Result |
| --- | --- |
| Every active DB file reference has an object | Pass: 19 of 19 owner downloads returned the PDF (Run 1) |
| Signed URLs require owner access | Pass: every file link was signed (WordPress) or presigned (MinIO) (Run 1) |
| Raw WordPress upload URLs without a signature | Pass: 3 of 3 sampled returned HTTP 403 (Run 1) |
| Cross-user access to patterns, files, thumbnails, chats, rewrites | Pass: 138 requests (B to A 84, A to B 54), 0 leaks (Run 1) |
| Stash photo owner scoping | Pass: owner opens photo and signed link; tampered link 403; other user cannot list, open, or delete the item (Run 3) |
| Orphan objects quarantined before deletion | Not checked |
| Deleted account replay after restore | Not checked (migration rollback rehearsal) |

## Pattern context matrix (all runs)

| Scenario | Result |
| --- | --- |
| Pattern A chat cannot read Pattern B content | Pass: API guard returned 409 before any workflow call (Run 1); on the device, chats on two patterns each answered about their own pattern (Run 3) |
| Another user cannot start a chat, post into a chat, or rewrite with someone else's pattern | Pass: 404 (Run 1) |
| Metadata-only paid Ravelry pattern blocks AI content operations | Pass: rewrite refused with 409 on all 4 Ravelry entries with details only (Run 1) |
| Stored-source Ravelry pattern allows AI content operations | Not checked separately (needs a real AI call on a Ravelry pattern with a stored PDF) |
| Deleted pattern cannot be opened through stale IDs | Pass: 404 on every route (Run 2) |
| App relaunch | Pass: still signed in with library intact after force-closing Expo Go (Run 3) |
| App reinstall | Not checked: Expo Go cannot reinstall the app. Sign out and back in restored the library (Run 3). Needs a staging build. |

## Run 2: fixes deployed to staging (2026-10-14)

| Check | Result |
| --- | --- |
| Staging deploy | Branch commit `c2ac06f`, then `1244ac7`; API on `stitchsense_staging` and `my-main-net`; `N8N_IMAGE_URL` set to `staging-pattern-helper-chat`; `/ready` healthy |
| Delete a pattern (User B, Ravelry entry with details only) | API returned 204 and archived the pattern in staging WordPress |
| Deleted pattern opened through its old ID | Pass: 404 on pattern, file link, file, rewrite, new chat, sending a message, and importing messages into its chat |
| Re-sync after delete | Pass after the E6 fix: pattern stays deleted (User B 9 to 8) and nothing is pending |
| User A re-sync after E6 fix | Pass: 14 patterns unchanged |
| App chats on the web, web chats in the app | Pass (closes E1) |

## Run 3: device checks with Expo Go against staging (2026-10-14)

Staging on `main` at `5016fe1` (PR #79). Expo started with `EXPO_PUBLIC_API_BASE_URL=https://staging-stitchsense.zu-auto.co.uk`.

| Check | Result |
| --- | --- |
| Mobile library count, User A | Pass: 14, matching WordPress and the API |
| Open patterns on the device | Pass: upload and Ravelry patterns open |
| Large PDF uploaded on the phone appears on the web | Pass: appears and opens for the owner, not visible to the other user |
| Web upload appears in the mobile library | Pass: appears and opens after refresh |
| Mobile delete, then web and re-sync | Pass: gone from the web, stays gone after sign-out and sign-in |
| Chats stay on their own pattern | Pass |
| Stash item with photo | Pass: 1 item with photo stored for User A only; owner scoping checks passed |
| Relaunch | Pass |

## Run 4: edits, website archive and delete (2026-10-16)

Staging API on `fix/sync-keeps-newer-platform-edits` (`ee7f7a3`), staging WordPress plugin 7.7.44. Expo started with both `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WORDPRESS_BASE_URL` set to staging.

| Check | Result |
| --- | --- |
| Rename an older WordPress pattern in the app | Pass: new name shows on the website |
| Edit a pattern summary on the website | Pass: edit shows in the app |
| Sign out and back in on the phone (re-sync) | Pass: rename and summary edit kept (closes E7) |
| Archive on the website | Pass: leaves the website library, shows as archived in the app (closes E8) |
| Delete on the website | Pass: gone from the website and the app, stays gone after re-sync |
| Reconciliation, User A | Pass: nothing pending; 4 WordPress patterns matched, 1 app-only upload, 9 patterns the owner deleted are archived in WordPress and stay deleted; 0 relational gaps |

## Outstanding for Workstream 5

- Reinstall check on a staging build of the app (Expo Go cannot reinstall).
- Stored-source Ravelry pattern AI operation, orphan object quarantine check.
- Migration rollback rehearsal (`docs/MIGRATION_ROLLBACK_REHEARSAL.md`), including deleted-account replay.
- Representative staging data: Runs 1 to 3 used the owner's two accounts. Customer-like data must be minimised or anonymised before use.
- Decide E2.
- App follow-ups: show the real reason when a username sign-in fails (the email fallback currently reports "Invalid request"), and ask for a password before sending an empty one.
- Final migration counts, exceptions, and approval before touching production data. Production must run the PR #79 sync fix before any production user's first app sign-in imports their WordPress library.

## Decision

| Field | Value |
| --- | --- |
| Reconciliation decision | Continue (staging import, reconciliation, bidirectional, and device checks passed; reinstall, rollback rehearsal, and final sign-off outstanding) |
| Decision owner |  |
| Decision time |  |
| Exceptions accepted |  |
| Follow-up issues | E2, app sign-in error messages |
