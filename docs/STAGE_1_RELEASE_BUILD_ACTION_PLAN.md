# StitchSense Stage 1 Release Build Action Plan

This plan is the fastest safe route to a first App Store and Play Store release. Stage 1 is not the final version of StitchSense; it is the smallest production-worthy release that protects user data, preserves paid entitlement rules, passes store review, and gives real users a stable mobile path.

## Stage 1 Release Standard

Stage 1 can ship when:

- Core mobile journeys work on real iOS and Android devices.
- User data remains owner-scoped across auth, sync, uploads, files, chats, rewrites, projects, stash, Ravelry, and Stitch Vision.
- Entitlement-gated features remain gated.
- RevenueCat purchase, restore, cancellation, expiry, and webhook flows are validated with real store sandbox/internal testing.
- Backend, workflow, storage, and WordPress bridge configuration is production-safe.
- Legal, privacy, support, and store listing materials are published and internally consistent.
- Monitoring, rollback, and support handling are ready for a controlled launch.

## Working Rules

- Do not add new product scope until Stage 1 is submitted.
- Prefer small, reviewable fixes over broad rewrites.
- Keep the local development path lightweight for the older dev machine.
- Run heavy DB/storage/native/store checks in CI, staging, EAS, or real devices.
- Treat every unchecked item in this document as either a blocker or an explicit defer decision.

Checklist states: `[x]` evidence recorded and the gate is genuinely closed; `[d]` documented or prepared but not yet executed; `[ ]` not started.

## Track 0: Local Baseline And Branch Cleanup

Goal: make the current project state trustworthy before more launch work.

- [x] Fix local Node command resolution so project scripts use the intended Node 22 path without requiring broad machine upgrades. *(2026-10-06: `tools/run-with-node22.sh` now routes mobile/backend npm scripts through an installed NVM Node 22 without requiring a system-wide Node replacement.)*
- [x] Document the low-resource local command path for the older development machine. *(2026-10-06: `docs/EXPO_BUILD_AND_RELEASE_RUNBOOK.md` documents the lightweight local path and keeps native/heavy checks in CI, staging, EAS, or real-device passes.)*
- [x] Re-run local lightweight gates with Node 22 first in `PATH`. *(2026-10-06: wrapper-backed npm scripts pass locally without manually overriding `PATH`.)*
- [x] Review the dirty working tree and split changes into focused commits. *(2026-10-06: current local changes are grouped in `docs/RELEASE_HARDENING_CHANGESET_PLAN.md`; 2026-10-11: the changeset is committed in focused commits on `test/chat-history-route-coverage` (PR #67) and CI is green on all six jobs from a clean checkout, including the production image build.)*
- [x] Remove or defer unrelated experiments and generated noise. *(2026-10-07: ignored local artifacts such as `.kilo/`, `tools/codex-relay/`, backend `dist/`, app/backend `node_modules/`, Expo `.expo/`, generated `expo-env.d.ts`, and local `.env.vps` have zero matches in the tracked/non-ignored releasable file set.)*
- [ ] Push the release-hardening branch and confirm CI runs from a clean checkout. *(2026-10-08: `.github/workflows/ci.yml` defines backend, Expo, PHP, secret-scan, operations, and production-image gates; remote push and clean-checkout CI evidence remain.)*
- [ ] Enable branch protection/rulesets when the GitHub plan supports it. *(2026-10-08: `docs/BRANCH_PROTECTION_SETUP.md` lists required status-check names and desired ruleset settings; GitHub-side enforcement remains account/plan dependent.)*

Required local evidence:

- [x] `npm run check:mobile-artifacts`
- [x] `npm run check:capture-script`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] backend `npm run build`
- [x] `node tools/validate-production-artifacts.mjs`

## Track 1: Expo Build Readiness

Goal: produce signed iOS and Android release-candidate builds from a clean, reproducible state.

- [x] Align Expo SDK 57 patch dependencies reported by `npx expo install --check`. *(2026-10-06: Expo SDK 57 patch dependencies are aligned and `npx expo install --check` reports dependencies are up to date.)*
- [x] Re-run `npx expo-doctor` and record a clean result or documented accepted exception. *(2026-10-06: Expo Doctor passes 21/21 checks.)*
- [x] Confirm `app.json`, `app.config.js`, bundle ID, package name, app name, version, icons, splash, permissions, and privacy manifest. *(2026-10-06: Expo public config resolves with the expected bundle/package IDs, public HTTPS API defaults, permission copy, iOS privacy manifest, brand app icon, Android adaptive icon, favicon, and splash assets. `npm run check:mobile-artifacts` now validates the iOS icon is a 1024 x 1024 PNG without alpha.)*
- [ ] Configure EAS environments for preview and production.
- [ ] Add real public RevenueCat SDK keys to EAS environment variables.
- [ ] Run `npm run check:release-config` with production EAS values.
- [ ] Build internal/preview iOS and Android artifacts.
- [ ] Build production-candidate iOS and Android artifacts from a tagged green commit.
- [ ] Record build IDs, artifact URLs, version numbers, and config values in release evidence.

Exit gate:

- [ ] Both signed mobile builds install and launch on physical devices.

## Track 2: Backend, Data, And Sync

Goal: prove the production backend protects user data and syncs real launch data correctly.

- [ ] Confirm staging API, Postgres, object storage, WordPress bridge, n8n workflows, and secrets are separate from production. *(2026-10-08: expected environment separation is documented in `docs/ENVIRONMENT_CONFIGURATION_MATRIX.md`; live staging verification remains.)*
- [ ] Run backend integration tests in CI/staging with database and object storage enabled. *(2026-10-08: `.github/workflows/ci.yml` defines Postgres and MinIO-backed backend test gates; clean-checkout CI or staging execution remains.)*
- [ ] Run API smoke checks against staging. *(2026-10-08: `Mobile App/backend/scripts/smoke-api.sh` is available and documented in `docs/OPERATIONS_RUNBOOK.md`; staging execution evidence remains.)*
- [ ] Reconcile representative WordPress data in staging. *(2026-10-08: count and owner-scoped reconciliation tables are prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging evidence remains.)*
- [ ] Validate web upload to mobile open. *(2026-10-08: expected web-to-mobile flow evidence is prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging/device evidence remains.)*
- [ ] Validate mobile upload to web open. *(2026-10-08: expected mobile-to-web/API inventory evidence is prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging/device evidence remains.)*
- [ ] Validate create/update/delete and re-sync under the agreed web-as-master rules. *(2026-10-08: bidirectional sync evidence rows are prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging evidence remains.)*
- [ ] Confirm deleted web records are not resurrected by mobile sync. *(2026-10-08: deleted/tombstoned record and resurrection checks are prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging evidence remains.)*
- [ ] Confirm metadata-only paid Ravelry imports never produce fabricated pattern content. *(2026-10-08: Ravelry metadata-only guard checks are prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging evidence remains.)*
- [ ] Confirm pattern A/B context isolation across chat, rewrite, relaunch, project, and reinstall. *(2026-10-08: pattern-context matrix checks are prepared in `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`; staging/device evidence remains.)*
- [ ] Run migration rollback rehearsal against isolated data. *(2026-10-08: rehearsal steps are prepared in `docs/MIGRATION_ROLLBACK_REHEARSAL.md`; isolated restore execution remains.)*
- [ ] Take and verify a fresh pre-release backup. *(2026-10-08: backup and restore evidence tables are prepared in `docs/BACKUP_RESTORE_EVIDENCE.md`; fresh backup and verification remain.)*

Exit gate:

- [ ] No known data-loss, cross-user access, stale resurrection, or pattern-context contamination issue remains open.

## Track 3: RevenueCat And Store Billing

Goal: make subscriptions store-compliant and owner-safe.

Development-only RevenueCat Test Store smoke evidence is recorded in `docs/REVENUECAT_STORE_TEST_MATRIX.md`. Keep the real store tasks unchecked until App Store Connect sandbox/TestFlight and Google Play licence-tester/internal-track evidence exists.

Do not create public mobile lifetime products for Stage 1. Developer, support, beta, and comped lifetime accounts remain admin-granted manual entitlements through the WordPress/admin tools.

- [ ] Configure App Store Connect monthly product. *(2026-10-08: product setup requirements are tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md` and `docs/revenuecat-subscriptions-and-payouts.md`; console configuration evidence remains.)*
- [ ] Configure App Store Connect annual product. *(2026-10-08: product setup requirements are tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md` and `docs/revenuecat-subscriptions-and-payouts.md`; console configuration evidence remains.)*
- [ ] Configure Google Play monthly product. *(2026-10-08: product setup requirements are tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md` and `docs/revenuecat-subscriptions-and-payouts.md`; console configuration evidence remains.)*
- [ ] Configure Google Play annual product. *(2026-10-08: product setup requirements are tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md` and `docs/revenuecat-subscriptions-and-payouts.md`; console configuration evidence remains.)*
- [ ] Configure RevenueCat offerings and `pro` entitlement mapping. *(2026-10-08: target entitlement, offering, package, and product mapping steps are documented in `docs/revenuecat-subscriptions-and-payouts.md`; RevenueCat console evidence remains.)*
- [ ] Configure RevenueCat webhook URL and authorization secret. *(2026-10-08: webhook target and backend-only authorization rules are documented in `docs/revenuecat-subscriptions-and-payouts.md` and `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`; live RevenueCat/backend secret verification remains.)*
- [ ] Confirm Apple agreements, tax, and banking are ready. *(2026-10-08: App Store Connect paid-app agreement, tax, and banking requirements are tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`; private console evidence remains.)*
- [ ] Confirm Google Play payments profile is ready. *(2026-10-08: Play payments profile requirements are tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`; private console evidence remains.)*
- [ ] Test iOS sandbox monthly purchase. *(2026-10-08: iOS monthly purchase evidence row is prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; physical/TestFlight sandbox execution remains.)*
- [ ] Test iOS sandbox annual purchase. *(2026-10-08: iOS annual purchase evidence row is prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; physical/TestFlight sandbox execution remains.)*
- [ ] Test iOS restore after reinstall. *(2026-10-08: restore-after-reinstall evidence row is prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; physical/TestFlight execution remains.)*
- [ ] Test iOS cancellation and paid-through access. *(2026-10-08: cancellation/paid-through evidence is covered by the store billing matrix and subscription testing checklist; sandbox execution remains.)*
- [ ] Test Android internal-track monthly purchase. *(2026-10-08: Android monthly purchase evidence row is prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; Play internal-track execution remains.)*
- [ ] Test Android internal-track annual purchase. *(2026-10-08: Android annual purchase evidence row is prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; Play internal-track execution remains.)*
- [ ] Test Android restore after reinstall. *(2026-10-08: restore-after-reinstall evidence row is prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; Play internal-track execution remains.)*
- [ ] Test Android pending/cancelled/expired states where available. *(2026-10-08: pending, cancelled, expired, billing-issue, refund, and revocation evidence rows are prepared in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; Play/internal tester execution remains.)*
- [ ] Verify webhooks update only the owning StitchSense user. *(2026-10-08: RevenueCat user mapping rule requires `appUserID` to equal the StitchSense backend user ID in `docs/revenuecat-subscriptions-and-payouts.md`; webhook ownership evidence remains.)*
- [ ] Verify one user cannot gain another user's entitlement. *(2026-10-08: cross-user entitlement denial is an explicit row in `docs/REVENUECAT_STORE_TEST_MATRIX.md`; store/backend evidence remains.)*

Exit gate:

- [ ] Purchase, restore, expiry, cancellation, and cross-device entitlement refresh pass on real iOS and Android store builds.

## Track 4: Device Acceptance

Goal: prove Stage 1 feels stable on real devices without over-polishing.

- [ ] Fresh install and onboarding.
- [ ] Registration and login.
- [ ] Returning-user session restoration.
- [ ] Library sync.
- [ ] Pattern upload with medium PDF.
- [ ] Pattern upload with large PDF.
- [ ] Pattern viewer access and signed file download.
- [ ] Pattern chat scoped to selected pattern.
- [ ] Pattern rewrite scoped to selected pattern.
- [ ] Project create/update/delete.
- [ ] Stash create/update/delete.
- [ ] Stitch Vision photo library input.
- [ ] Stitch Vision camera capture.
- [ ] Ravelry connect/import/re-import.
- [ ] Offline or timeout recovery.
- [ ] Logout and reinstall.
- [ ] Small iPhone layout.
- [ ] Large iPhone layout.
- [ ] Representative Android phone layout.
- [x] Tablet decision: either complete tablet QA/assets or disable tablet support for Stage 1. *(2026-10-06: Stage 1 is phone-only; `expo.ios.supportsTablet` is set to `false` and tablet optimization is deferred.)*
- [ ] VoiceOver/TalkBack smoke pass.
- [ ] Dynamic text and obvious overflow pass.
- [ ] Reduced-motion and tap-target smoke pass.

Exit gate:

- [ ] No P0/P1 mobile defect remains open.

## Track 5: Store, Legal, And Support

Goal: avoid store rejection and launch without support chaos.

- [ ] Publish stable HTTPS privacy policy URL. *(2026-10-08: required content and consistency checks are tracked in `docs/LEGAL_PUBLICATION_CHECKLIST.md`; final public URL and legal/business approval remain.)*
- [ ] Publish stable HTTPS terms/subscription terms URL. *(2026-10-08: terms and subscription-terms publication requirements are tracked in `docs/LEGAL_PUBLICATION_CHECKLIST.md`; final public URLs and approval remain.)*
- [ ] Publish stable HTTPS support/contact URL. *(2026-10-08: support/contact publication is tracked in `docs/LEGAL_PUBLICATION_CHECKLIST.md` and launch handling is prepared in `docs/SUPPORT_READINESS_RUNBOOK.md`; final monitored public route remains.)*
- [ ] Complete Apple privacy labels. *(2026-10-08: draft label inputs are in `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` and iOS manifest alignment is in `docs/IOS_PRIVACY_MANIFEST_REVIEW.md`; App Store Connect submission and legal/business approval remain.)*
- [ ] Complete Google Data Safety form. *(2026-10-08: draft Google Data Safety answers are in `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`; Play Console submission and legal/business approval remain.)*
- [x] Finalise iOS 1024 x 1024 non-alpha icon. *(2026-10-06: `assets/images/app-icon.png` is configured as the Expo icon and validated as 1024 x 1024 without alpha.)*
- [ ] Finalise Android adaptive icon and feature graphic. *(2026-10-06: Android adaptive foreground/monochrome config is wired; Play feature graphic and visual approval still remain.)*
- [ ] Capture store screenshots from current launch UI.
- [x] Capture tablet screenshots if tablet support remains enabled. *(2026-10-06: Not required for Stage 1 because iOS tablet support is disabled.)*
- [ ] Finalise app descriptions, subtitle, keywords/tags, category, age rating, and review notes. *(2026-10-08: review-note wording is drafted in `docs/STORE_REVIEW_NOTES.md`; listing copy, keywords/tags, category, and age/content rating still need final console-ready owner approval.)*
- [ ] Prepare private review test account. *(2026-10-08: `docs/REVIEW_TEST_ACCOUNT_PROTOCOL.md` defines credential storage, synthetic-data boundaries, reviewer-access checks, and rotation/cleanup rules; actual private account provisioning and entitlement verification remain.)*
- [x] Prepare support macros for launch. *(2026-10-08: `docs/SUPPORT_MACRO_LIBRARY.md` contains launch starter macros for identity/login, patterns/AI, billing, privacy/deletion, crash/startup, and escalation handling. Final owner approval remains in the macro decision table.)*
- [x] Confirm account deletion and data deletion wording is consistent across app, policy, and review notes. *(2026-10-08: app prompts use `DELETE` for synced-data deletion and `DELETE_ACCOUNT` for full account deletion, account deletion warns that App Store/Google Play subscriptions remain store-managed, and the same distinction appears in `docs/DATA_RETENTION_AND_DELETION_POLICY.md`, `docs/STORE_REVIEW_NOTES.md`, `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`, `docs/LEGAL_PUBLICATION_CHECKLIST.md`, and `docs/SUPPORT_MACRO_LIBRARY.md`. Focused destructive-action tests pass.)*

Exit gate:

- [ ] App Store Connect and Google Play Console listings are complete and internally consistent with the app and backend behavior.

## Track 6: Operations And Rollout

Goal: launch gradually with a way to detect and contain problems.

- [x] Configure crash reporting provider or explicitly record the Stage 1 alternative. *(2026-10-06: Stage 1 uses store-native crash reporting from TestFlight/App Store Connect and Google Play Console plus structured tester/support reports; a dedicated SDK is deferred unless beta evidence promotes it.)*
- [ ] Verify a test crash or equivalent crash signal.
- [ ] Configure uptime check alerts. *(2026-10-08: `.github/workflows/uptime.yml` runs public health/readiness checks every 15 minutes and can notify `UPTIME_ALERT_WEBHOOK_URL`; production repository secret and destination-channel verification remain.)*
- [ ] Configure API/workflow/billing alert routing. *(2026-10-08: `ops/monitoring/stitchsense-alerts.yml` defines API, workflow, and billing webhook alert rules, and `docs/OPERATIONS_RUNBOOK.md` documents routing intent; actual Prometheus/Alertmanager or managed-monitor routing deployment remains.)*
- [x] Confirm dashboard covers API availability, errors, latency, auth failures, workflow failures, and RevenueCat webhook failures. *(2026-10-08: `ops/monitoring/stitchsense-dashboard.json` includes API requests, API 5xx, API p95 latency, workflow failures, billing webhook failures, and auth client failures; `ops/monitoring/stitchsense-alerts.yml` includes API scrape loss, API errors/latency, auth failures, workflow HTTP/errors/latency, and billing webhook auth/payload/configuration/exception alerts.)*
- [ ] Rehearse backend deploy.
- [ ] Rehearse backend rollback.
- [ ] Rehearse isolated database restore.
- [ ] Rehearse secret rotation.
- [x] Prepare first-hour and first-day monitoring checklist. *(2026-10-08: `docs/POST_RELEASE_MONITORING_CHECKLIST.md` defines first-hour, first-day, and hold/rollback monitoring checks.)*
- [x] Define staged rollout percentage and hold criteria. *(2026-10-08: `docs/POST_RELEASE_MONITORING_CHECKLIST.md` defines the default internal, 5%, 25%, 50%, and 100% rollout ladder plus hold/rollback triggers for cross-user access, data loss, startup crashes, entitlement failures, and service outages.)*

Exit gate:

- [ ] A forced or simulated failure is detected, routed, and handled according to the runbook.

## Stage 1 Defers

These are allowed after Stage 1 unless beta evidence promotes them to P1.

- [ ] Deep visual redesign.
- [ ] Broad dashboard personalization.
- [ ] Advanced analytics beyond launch monitoring.
- [ ] Full automated device E2E suite.
- [ ] Non-critical React Compiler cleanup.
- [x] Expanded tablet-first experience, if tablet support is disabled or limited for Stage 1.
- [ ] Additional helper tools beyond the current launch set.
- [ ] Large architectural refactors.
- [ ] New AI features beyond existing chat, rewrite, summaries, uploads, RAG, and Stitch Vision flows.

## Suggested Execution Order

1. Clean local/branch baseline and fix Node path friction.
2. Align Expo SDK 57 patches and get Doctor clean.
3. Commit and push the current hardening work.
4. Get CI green from a clean checkout.
5. Configure EAS and RevenueCat public keys.
6. Produce preview/internal builds.
7. Run device, billing, sync, and staging evidence passes in parallel.
8. Finish legal/store/support materials.
9. Build tagged release candidates.
10. Submit to Apple and Google.
11. Release manually or phased after approval.

## Daily Launch Board

Use this short board during the final push.

### Today

- [ ] Pick one blocker from Tracks 0-3.
- [ ] Pick one evidence item from Tracks 4-6.
- [ ] Record result in the relevant checklist or release evidence file.

2026-10-09 local progress: Track 3 billing evidence was tightened around the decision to launch public mobile subscriptions as monthly and annual only. Manual developer/support/beta lifetime access is now documented as admin-granted access in the RevenueCat setup guide, store console checklist, review notes, support runbook, review-account protocol, release-candidate evidence, and production artifact validator.

### Blocked

- [ ] Store-console access or setup.
- [ ] RevenueCat product configuration.
- [ ] EAS environment values.
- [ ] Staging infrastructure.
- [ ] Physical device availability.
- [ ] Legal/business approval.

### Ready For Release Candidate

- [ ] Tracks 0-3 exit gates complete.
- [ ] Track 4 has no P0/P1 defects.
- [ ] Track 5 store/legal essentials complete.
- [ ] Track 6 monitoring and rollback essentials complete.
- [ ] Release evidence file filled for the candidate.
