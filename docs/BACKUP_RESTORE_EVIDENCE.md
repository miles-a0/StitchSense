# StitchSense Backup And Restore Evidence

Use this for each backup/restore rehearsal or release candidate backup verification. Do not record secret connection strings, raw customer data, uploaded file contents, or private object keys.

## Backup Snapshot

| Field | Value |
| --- | --- |
| Backup date |  |
| Environment | Staging / Production |
| PostgreSQL version |  |
| Database backup artifact |  |
| Database backup size |  |
| Object-storage mirror artifact |  |
| Object count |  |
| Checksum evidence location |  |
| Operator |  |

## Backup Verification

| Check | Result | Evidence / notes |
| --- | --- | --- |
| `pg_restore --list` parses custom-format dump |  |  |
| Database table count snapshot captured |  |  |
| Object mirror count captured |  |  |
| Object checksum sample or full manifest verified |  |  |
| Backup stored in owner-only location |  |  |
| Off-server copy exists where required |  |  |

## Restore Validation

| Step | Result | Evidence / notes |
| --- | --- | --- |
| Isolated database created |  |  |
| Dump restored with `--no-owner --no-privileges` |  |  |
| Table counts compared |  |  |
| API smoke checks run against isolated restore |  |  |
| Deleted-account replay/check performed |  |  |
| Isolated restore destroyed |  |  |

## Decision

| Field | Value |
| --- | --- |
| Backup/restore decision | Pass / Hold |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
