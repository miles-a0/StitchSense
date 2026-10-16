# StitchSense Migration Rollback Rehearsal

Use this before any production data migration or schema-changing release. Never rehearse restores over production.

## Migration Plan

| Field | Value |
| --- | --- |
| Migration / change name |  |
| Git commit SHA |  |
| Current schema version |  |
| Target schema version |  |
| Backup artifact |  |
| Rollback owner |  |

## Forward Rehearsal

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Fresh backup verified with `pg_restore --list` |  |  |
| Migration applied to staging or isolated restore |  |  |
| API build starts after migration |  |  |
| `/ready` passes |  |  |
| Key data/sync smoke checks pass |  |  |
| Old compatible app behaviour still works where required |  |  |

## Rollback Rehearsal

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Previous image/source identified |  |  |
| Database restore rehearsed in isolated environment |  |  |
| Old WordPress behaviour remains available |  |  |
| Deleted-account replay/check performed |  |  |
| Rollback duration recorded |  |  |
| User-visible impact assessed |  |  |

## Decision

| Field | Value |
| --- | --- |
| Migration decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |

## 2026-10-16 rehearsal: production backup restore and Platform API fallback

| Field | Value |
| --- | --- |
| Migration / change name | Release of PRs #75, #78, #79, #81–#83 (no schema change) |
| Git commit SHA | `73c0fed` |
| Current schema version | 10 migrations (`010_wordpress_pattern_file_owners.sql`) |
| Target schema version | Unchanged |
| Backup artifact | `/opt/stitchsense-mobile/backups/20261016-release-pr75-83/stitchsense_mobile_before_release.dump` |
| Rollback owner | Owner |

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Fresh backup verified with `pg_restore --list` | Pass | 20 table-data entries |
| Previous image/source identified | Pass | `stitchsense-api:pre-release-20261016` and `backend-source-before-release.tgz`; image rollback exercised during the release (see `docs/OPERATIONS_REHEARSAL_LOG.md`) |
| Database restore rehearsed in isolated environment | Pass | Restored into a throwaway `postgres:16-alpine` container with no network (`--network none`), then removed. Counts matched production for users (33), active patterns (37), deleted patterns (98), chat sessions (63), rewrites (6), linked accounts (33), projects (27), stash items (7), file owners (7), migrations (10). Chat messages 225 restored against 227 live: two smoke-test messages written after the backup. |
| Migrations against the restored copy | Pass | Current release image reported all migrations already applied, run in the restore container's isolated network namespace |
| Deleted-account replay/check performed | Pass | 1 account deletion recorded in production; 0 of those accounts present in the restored copy. After any real restore from an older backup, re-delete accounts listed in `user.account_deleted` audit events newer than the backup. |
| Old WordPress behaviour remains available | Pass (staging) | With Platform API unticked, the staging website loaded its own library and opened patterns. Changes made while Platform API was on are not in that copy (one extra pattern showed), so falling back shows the library as it was before Platform API changes. Setting re-ticked afterwards. |
| Rollback duration recorded | Pass | Database restore and checks: 8 seconds. Image rollback: one container recreate. |
| User-visible impact assessed | Pass | Image rollback keeps data. A database restore loses writes made after the backup and needs the deleted-account replay. Turning Platform API off shows website users their pre-platform library. |

| Field | Value |
| --- | --- |
| Migration decision | Continue |
| Decision owner | Owner |
| Decision time | 2026-10-16 |
| Follow-up issues | None |
