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
