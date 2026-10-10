# StitchSense Release Candidate Evidence Template

Use one copy of this template per signed production candidate. Do not paste secrets, tokens, private environment values, uploaded file contents, customer data, or store-console credentials into the evidence record.

## Candidate Identity

| Field | Value |
|---|---|
| Candidate date |  |
| Git commit SHA |  |
| Git tag |  |
| Backend image digest |  |
| iOS EAS build ID / artifact URL |  |
| Android EAS build ID / artifact URL |  |
| App version |  |
| iOS build number |  |
| Android versionCode |  |
| API base URL |  |
| EAS channel |  |
| RevenueCat entitlement ID |  |

## Pre-Build Gates

Record command output summaries and links to CI runs.

- [ ] CI backend build/tests/audit passed.
- [ ] CI Expo lint/typecheck/tests/Doctor/audit passed.
- [ ] CI PHP syntax passed.
- [ ] CI secret scan passed.
- [ ] CI production image build passed after all required gates.
- [ ] `npm run check:release-config` passed with real EAS public RevenueCat keys configured.
- [ ] Backend production `/ready` passed.
- [ ] Staging smoke check passed with `scripts/smoke-api.sh`.
- [ ] Database migration plan reviewed.
- [ ] Rollback material identified.
- [ ] Store submission checklist reviewed.
- [ ] Store console setup checklist reviewed.
- [ ] Privacy and data safety worksheet reviewed.
- [ ] Backup/restore evidence reviewed.
- [ ] Support readiness reviewed.
- [ ] Support macro library reviewed.
- [ ] EAS environment setup checklist reviewed.
- [ ] Review/test account protocol reviewed.
- [ ] Crash reporting plan reviewed.
- [ ] Environment configuration matrix reviewed.
- [ ] Security signoff checklist reviewed.
- [ ] Migration rollback rehearsal reviewed.

## Store And Billing Configuration

Record screenshots or console links separately; keep this file free of secret values.

- [ ] App Store Connect monthly product configured.
- [ ] App Store Connect annual product configured.
- [ ] Google Play monthly product configured.
- [ ] Google Play annual product configured.
- [ ] Public mobile lifetime product intentionally omitted.
- [ ] RevenueCat offerings expose monthly and annual packages.
- [ ] RevenueCat offerings do not expose a public lifetime package.
- [ ] RevenueCat webhook target and authorization are configured.
- [ ] Manual developer/support/beta lifetime access evidence is recorded separately from RevenueCat store products.
- [ ] App Store Connect banking/tax/agreements ready.
- [ ] Google Play payments profile ready.
- [ ] Store listing assets/copy are recorded in `docs/STORE_SUBMISSION_CHECKLIST.md`.
- [ ] Store-console readiness is recorded in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`.
- [ ] Privacy labels/Data Safety answers are recorded in `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`.
- [ ] Store review notes are recorded in `docs/STORE_REVIEW_NOTES.md`.
- [ ] Review/test account handling is recorded in `docs/REVIEW_TEST_ACCOUNT_PROTOCOL.md`.
- [ ] RevenueCat store testing is recorded in `docs/REVENUECAT_STORE_TEST_MATRIX.md`.
- [ ] Legal publication status is recorded in `docs/LEGAL_PUBLICATION_CHECKLIST.md`.

## Acceptance Matrix

Use `docs/DEVICE_ACCEPTANCE_MATRIX.md` for the detailed physical-device, offline, and accessibility pass. Use `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md` and `docs/PERFORMANCE_ACCEPTANCE_PLAN.md` for focused accessibility and performance evidence. Summarise the final result here.

| Flow | iOS Result | Android Result | Evidence |
|---|---|---|---|
| Fresh install and onboarding |  |  |  |
| Login and session restoration |  |  |  |
| Library sync |  |  |  |
| Pattern upload and indexed chat |  |  |  |
| Pattern rewrite |  |  |  |
| Project create/update/delete |  |  |  |
| Stitch Vision image analysis |  |  |  |
| Stash create/update/delete |  |  |  |
| Purchase monthly |  |  |  |
| Purchase annual |  |  |  |
| Restore purchase after reinstall |  |  |  |
| Cancel and paid-through access |  |  |  |
| Expiry/downgrade |  |  |  |
| Offline/timeout recovery |  |  |  |
| Account deletion guidance |  |  |  |

## Data And Sync Evidence

Use `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md` for detailed count, ownership, signed URL, object-storage, Ravelry, and pattern-context checks.

- [ ] Representative WordPress-to-mobile counts reconciled.
- [ ] Mobile upload-to-web open validated.
- [ ] Web upload-to-mobile open validated.
- [ ] Pattern A/B contamination matrix passed.
- [ ] Paid Ravelry metadata-only guard passed.
- [ ] Deleted-record resurrection regression passed.

## Monitoring During Rollout

Record dashboard links or screenshots for the rollout window. Use `docs/POST_RELEASE_MONITORING_CHECKLIST.md` for the staged rollout ladder and first-hour/first-day detail.

| Field | Value |
|---|---|
| Current rollout step | Internal / 5% / 25% / 50% / 100% |
| Minimum observation window satisfied | Yes / No |
| Widening decision | Hold / Continue / Roll back |
| Decision evidence location |  |

- [ ] API `/health` and `/ready` stable.
- [ ] API 5xx rate inside threshold.
- [ ] Auth failure rate inside threshold.
- [ ] Workflow `http_error`, `workflow_error`, and `exception` outcomes inside threshold.
- [ ] RevenueCat webhook failures inside threshold.
- [ ] Monitoring dashboard reviewed.
- [ ] Crash-free sessions inside threshold.
- [ ] Support contacts/reviews monitored.
- [ ] `docs/POST_RELEASE_MONITORING_CHECKLIST.md` updated for this rollout.
- [ ] `docs/RELEASE_DECISION_LOG.md` updated for this candidate.

## Decision

| Field | Value |
|---|---|
| Release decision | Hold / Continue / Roll back |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
