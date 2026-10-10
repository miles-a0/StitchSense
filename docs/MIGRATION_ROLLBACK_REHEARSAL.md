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
