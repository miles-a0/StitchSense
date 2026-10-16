# StitchSense Operations Rehearsal Log

Use one section per rehearsal. Do not paste secret values, raw customer data, full environment files, uploaded files, store credentials, or private webhook payloads into this log.

## Rehearsal Summary

| Field | Value |
| --- | --- |
| Rehearsal date |  |
| Environment | Staging / Production-like isolated restore / Production |
| Operator |  |
| Git commit SHA |  |
| Backend image digest |  |
| Database backup artifact |  |
| Object-storage backup artifact |  |
| Incident / change reference |  |

## Deployment Rehearsal

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Confirm source branch and CI status |  |  |
| Identify rollback image/source snapshot |  |  |
| Run database migration plan review |  |  |
| Deploy API container |  |  |
| Run `/health` and `/ready` smoke checks |  |  |
| Run guarded `/metrics` smoke check when configured |  |  |
| Confirm logs have request IDs and no secret values |  |  |

## Rollback Rehearsal

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Preserve API logs and container state |  |  |
| Restore previous image or source snapshot |  |  |
| Recreate API container |  |  |
| Verify `/health`, `/ready`, and public API readiness |  |  |
| Verify login, entitlement, library, upload, and AI chat smoke paths |  |  |
| Record rollback duration and user-visible impact |  |  |

## Restore Rehearsal

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Restore PostgreSQL dump into isolated database only |  |  |
| Validate dump with `pg_restore --list` |  |  |
| Compare representative table counts |  |  |
| Point isolated API/staging process at restored database |  |  |
| Run API smoke checks against isolated restore |  |  |
| Check deleted-account replay requirements |  |  |
| Destroy isolated restore after validation |  |  |

## Secret Rotation Rehearsal

| Integration | Result | Evidence / notes |
| --- | --- | --- |
| WordPress bridge shared secret |  |  |
| RevenueCat webhook authorization |  |  |
| n8n workflow shared secrets |  |  |
| Metrics shared secret |  |  |
| Storage credentials |  |  |

## Incident Response Rehearsal

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Classify incident type |  |  |
| Preserve evidence |  |  |
| Contain affected integration or feature |  |  |
| Recover service |  |  |
| Validate user-facing critical flows |  |  |
| Create follow-up prevention task |  |  |

## Decision

| Field | Value |
| --- | --- |
| Rehearsal decision | Pass / Hold |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |

## 2026-10-16 production release (PRs #75, #78, #79, #81, #82, #83)

| Field | Value |
| --- | --- |
| Environment | Production |
| Operator | Owner, guided step by step |
| Git commit SHA | `73c0fed` (main, CI green) |
| Backend image | New `sha256:6ee738de…`; previous `sha256:29956ac3…` tagged `stitchsense-api:pre-release-20261016` |
| Database backup artifact | `/opt/stitchsense-mobile/backups/20261016-release-pr75-83/stitchsense_mobile_before_release.dump` (1.5 MB, 20 table-data entries listed by `pg_restore --list`) |
| Source snapshot | `backend-source-before-release.tgz` in the same owner-only folder |
| WordPress plugin | 7.7.43 to 7.7.44 on the live site; Platform API enabled (`https://stitchsense.zu-auto.co.uk`) |

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Confirm source branch and CI status | Pass | `main` at `73c0fed`, all six CI checks green |
| Identify rollback image/source snapshot | Pass | Image tag, database dump, and source archive created before any change |
| Run database migration plan review | Pass | No new migrations since the previous release; `npm run migrate` reported all 10 already applied |
| Copy source | Pass | `rsync` dry run first: only API code, tests, and example files changed, nothing deleted, env files excluded |
| Deploy API container | Pass | Built, then recreated; `running healthy restarts=0`, on `backend_default` and `my-main-net` |
| Run `/health` and `/ready` smoke checks | Pass | Local and public `/ready` report database and storage true; no error-level log lines |
| Confirm the new code is running | Pass | Chat deleted-pattern guard, archived-pattern sync, and signed storage links present in the container; public `/files/signed` without a signature returns 403 |
| Plugin order | Note | Plugin 7.7.44 was uploaded before the API. Safe for this release: its only change forwards `isArchived`, which the previous API already accepted |
| Rollback | Pass (unplanned) | The rollback block was run once before the deploy: retagging the previous image and recreating the container kept production healthy on the old version, then the deploy was repeated |
| App and website smoke checks | Pass | Installed app and Expo Go against production: sign-in, library, pattern PDF, pattern chat; live website library, PDF, and the same chat |
