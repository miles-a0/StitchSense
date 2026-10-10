# StitchSense Release Decision Log

Use this for each production candidate and rollout decision. Link detailed evidence files rather than pasting private data into this log.

## Go / No-Go Checklist

| Gate | Required evidence | Result |
| --- | --- | --- |
| CI gates | Backend, Expo, PHP, secret scan, operations artifacts, production image |  |
| Release config | `npm run check:release-config` with real public EAS keys |  |
| Backend readiness | Public/private `/ready` and smoke script |  |
| Device acceptance | `docs/DEVICE_ACCEPTANCE_MATRIX.md` completed |  |
| Data/sync reconciliation | `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md` completed |  |
| Store submission | `docs/STORE_SUBMISSION_CHECKLIST.md` completed |  |
| Privacy/data safety | `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` approved |  |
| Backup/restore | `docs/BACKUP_RESTORE_EVIDENCE.md` passed |  |
| Operations rehearsal | `docs/OPERATIONS_REHEARSAL_LOG.md` passed |  |
| Monitoring | Dashboard, alerts, crash reporting, support rota ready |  |

## Decision Record

| Field | Value |
| --- | --- |
| Candidate version |  |
| Git commit / tag |  |
| Backend image digest |  |
| iOS build |  |
| Android build |  |
| Decision | Go / Hold / Roll back |
| Decision owner |  |
| Decision time |  |
| Reason |  |

## Follow-Up

| Issue | Severity | Owner | Required before rollout widens |
| --- | --- | --- | --- |
|  |  |  |  |
