# StitchSense Production Readiness Action Plan

**Baseline:** 52% production-ready as of 28 August 2026.

**Execution update (5 September 2026):** The bridge host restriction is deployed and verified; backups are verified off-server; the bridge secret is rotated; pre-rotation sessions are revoked; the published demo login is retired; backend production configuration, authentication throttling, CORS, headers, proxy handling, and upload validation are hardened; Node 22 builds and CI gates are deterministic; and Expo SDK 57 passes lint, typecheck, dependency compatibility, and all 21 Expo Doctor checks.

**Performance update (5 September 2026):** Mobile library/Ravelry refresh hot paths were reduced, AI chat now calls the workflow directly before WordPress fallback, production API image `sha256:ffee03df2584e87652b2eabb3442f83de3d74debcf2521585b40cf93afac20ab` was deployed, and the StitchSense Nginx Proxy Manager host has 600 second read/send timeouts for long Ravelry imports.

**Operations update (5 September 2026):** Graceful API shutdown and VPS container resource limits passed CI on PR #7 and were deployed as production API image `sha256:d35cbecc63570e6e3c101892c17ef5bb55fdc9f7c101f8e9267e2b67ba62635e`; public and private health checks passed, Docker reported the 768MB memory cap, 256MB reservation, 1.5 CPU cap, and `init: true`, and a canary SIGTERM stop test logged clean Fastify shutdown.

**Migration update (5 September 2026):** Versioned migration tracking passed CI on PR #9 and was deployed as production API image `sha256:781edd8c496b51c41bf5782e8503ad0056f7899efe05e970bd51909ad4d3b39d`; a fresh PostgreSQL backup was taken, `schema_migrations` was backfilled with migrations `001` through `008`, a second migration run skipped all eight as already applied, and public/private API health checks passed after rollout.

## Approach

Close exploitable security and recoverability risks first, then run application hardening, billing, data validation, and store preparation in parallel where dependencies allow. A workstream is complete only when its validation evidence is recorded; implementation alone does not move it to done.

## Scope

- **In:** Expo mobile app, shared Node/Fastify API, WordPress plugin bridge, database and object-storage integrations, n8n workflows, subscriptions, CI/CD, production operations, privacy, and App Store/Play release preparation.
- **Out:** New product features, broad visual redesigns, legacy native iOS work, and non-launch-critical enhancements until all P0/P1 gates pass.

## Working Rules

- Freeze new feature scope until the Production Candidate gate passes.
- Make changes in small, reviewable commits with a rollback path.
- Use separate development/staging/production configuration and credentials.
- Never test destructive sync, deletion, billing, or migration flows first against production data.
- Record evidence for every exit gate: command output, test report, screenshot, log, or store-console result.

## Action Items

Checklist states: `[x]` evidence recorded and the gate is genuinely closed; `[d]` documented or prepared but not yet executed; `[ ]` not started.

### 1. Establish a recoverable baseline — P0

- [x] Create one project-wide Git repository that includes the Expo app, API, WordPress plugin source, migrations, scripts, and release documentation.
- [x] Preserve the current Expo history, remove backup/generated ZIPs from the release source tree, and commit the current known state.
- [x] Configure a private remote repository, pull-request checks, and secret scanning.
- [ ] Enable protected-main enforcement for required checks when the GitHub repository plan supports rulesets/branch protection.
- [x] Remove published demo credentials and disable or rotate the live demo account before public testing.
- [x] Inventory production services, versions, owners, DNS/proxy configuration, and credential locations without copying secret values into documentation.
- [d] Take and verify a PostgreSQL backup and document the object-storage backup/recovery method. *(2026-09-26: `docs/BACKUP_RESTORE_EVIDENCE.md` added for repeatable backup snapshot, verification, isolated restore, deleted-account replay/check, and decision evidence. Fresh pre-release backup/restore execution still required.)*

**Exit gate:** The entire release source is versioned and remotely recoverable; production data has a verified backup; no public reusable credentials remain.

### 2. Contain and repair critical security risks — P0

- [x] Remove client control of WordPress bridge destinations in `/auth/wordpress-login` and `/auth/wordpress-register`; use an exact configured-host allowlist and block private/link-local redirects.
- [x] Rotate `WORDPRESS_BRIDGE_SHARED_SECRET` after deploying the bridge fix, revoke active refresh tokens as appropriate, and audit linked administrator accounts.
- [x] Upgrade or replace the vulnerable Fastify JWT dependency chain and apply safe backend dependency patches.
- [x] Triage Expo dependency advisories, apply compatible patches, and record any build-only residual findings with justification and an upgrade target.
- [x] Add startup validation that refuses production boot with default, empty, malformed, or development credentials. *(2026-09-25: production validation now also fails closed without HTTPS n8n chat/upload/library/image workflow URLs, long n8n workflow shared secrets, RevenueCat webhook authorization, safe RevenueCat entitlement ID, and complete Stripe webhook/price configuration whenever Stripe is enabled.)*
- [x] Apply authentication-specific rate limits to login, registration, refresh, password reset, and WordPress bridge routes. *(2026-09-25: WordPress bridge auth now uses timing-safe shared-secret comparison, has DB-backed coverage for missing/wrong secret and trusted-site enforcement, and is represented in the shared API contract.)*
- [x] Restrict browser CORS origins, add security headers, validate proxy/IP handling, and review upload limits and MIME/content validation.
- [x] Move production secrets to appropriately protected storage and restrict any necessary environment file to owner-only permissions.
- [x] Run focused authorization tests for cross-user patterns, projects, files, chats, rewrites, stash items, and admin routes.

**Exit gate:** No unresolved critical/high exploitable backend finding; bridge-secret exfiltration is impossible; rotated credentials are live; authorization tests pass.

### 3. Make builds deterministic and enforce quality gates — P0

- [x] Fix the current React Hooks lint error and resolve or deliberately suppress all remaining warnings with explanations.
- [x] Upgrade local and CI runtimes to supported Node 22 LTS and align Expo SDK patch versions reported by Expo Doctor.
- [x] Reconcile `app.json`, `app.config.js`, package version, bundle identifiers, Android package, and deployment documentation. *(2026-09-26: CI now also runs `npm run check:mobile-artifacts` to validate app config identity, required launch assets, permission copy, iOS privacy manifest presence, tablet-support evidence, SDK 57 track, and release scripts without requiring a native build on the local machine.)*
- [x] Use `npm ci` in CI and Docker builds; pin the container base image to an intentional supported version.
- [x] Add CI jobs for PHP syntax, backend build/tests, Expo typecheck/lint/Doctor, dependency audit, secret scan, and container build.
- [ ] Block merges and production builds when a required gate fails. *(2026-09-25: CI production image builds now run only after backend, Expo, PHP syntax, secret-scan, and operations artifact checks have all passed. Merge blocking still depends on GitHub branch-protection/ruleset availability for the repository. 2026-09-26: `docs/BRANCH_PROTECTION_SETUP.md` added with required checks and desired ruleset settings for when GitHub plan support is available.)*

**Exit gate:** A clean checkout passes every CI gate with no manual setup beyond documented environment configuration.

**2026-09-26 SDK 57 lint note:** Expo lint passes under SDK 57 with `react-hooks/set-state-in-effect` and `react-hooks/preserve-manual-memoization` disabled in `eslint.config.js`. These React Compiler checks flagged existing synchronous effect and memo dependency patterns across multiple screens/providers after the SDK upgrade. The suppression is intentionally scoped to those two rules so syntax, import, hooks dependency, and standard Expo lint gates still run while the affected screens are refactored incrementally behind focused tests. `docs/REACT_COMPILER_CLEANUP_PLAN.md` now tracks the cleanup order, guardrails, and exit criteria for re-enabling both rules.

### Dependency triage record

- Backend production dependencies report zero known vulnerabilities after a clean Node 22 `npm ci`.
- Expo is now on the SDK 57 release track (`expo` 57.0.27, React 19.2.3, React Native 0.86.3) with Expo Doctor and `expo install --check` clean.
- The remaining Expo production audit report is 11 moderate and 19 high transitive findings with no critical finding. npm's suggested fixes include unsupported downgrades or incompatible major package changes outside the SDK 57/React Native matrix, so the release gate blocks new critical advisories while Expo's supported dependency matrix remains authoritative for mobile runtime upgrades.
- GitHub Actions run `33967860092` passed all four required jobs, including the isolated PostgreSQL cross-user authorization suite, Expo checks, PHP syntax, secret scanning, dependency audits, and production container build.
- GitHub Actions run `33968160241` passed on protected release source commit `1c88c5c`; the same commit was deployed to production as image `sha256:03a07dc07c80740712df50cc808b02a875f28b469fa72d45884ef5a67457d10e`.
- GitHub branch-protection enforcement remains unavailable on the repository's current plan. Checks run on every pull request and push to `main`, but GitHub cannot yet prevent an administrator from bypassing them.
- 2026-09-11: the CI MinIO integration-test image now pulls from pinned Quay release digest `sha256:ed9be66eb5f2636c18289c34c3b725ddf57815f2777c77b5938543b78a44f144` after Docker Hub denied the matching `minio/minio` pull during PR #35.
- 2026-09-11: CI action pins were advanced to `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0 SHAs to clear GitHub's Node 20 action-runtime deprecation warnings while keeping supply-chain pins explicit.

### 4. Build a launch-level automated test suite — P0/P1

- [ ] Add backend route/integration tests using isolated PostgreSQL and object-storage services. *(2026-09-07: CI now provisions isolated PostgreSQL and MinIO for backend integration checks; broader route coverage still remains.)*
- [ ] Cover registration, login, refresh rotation/revocation, password reset, bridge authentication, entitlements, uploads, signed file access, and data deletion/export. *(2026-09-07: auth lifecycle now has DB-backed coverage for registration, login failure/success, refresh rotation, refresh-token reuse rejection, logout revocation, and password-reset unavailable-state handling. Signed file access coverage now verifies active owner access, stored-object presigned URLs/downloads, transfer-token downloads, tamper rejection, cross-user denial, and deleted-pattern denial. Data export/deletion now has DB-backed coverage for user scoping, destructive confirmation, project/stash inclusion, token redaction, and cross-user preservation. Backend upload route coverage now verifies entitlement-gated text-file upload storage plus multipart indexing workflow payload/persistence against PostgreSQL and MinIO. 2026-09-16: project route coverage now verifies owner create/list/update/sync-validation/delete plus linked-pattern ownership/deletion guards, counters, work-log entries, and resume marks. Stash route coverage now verifies owner create/list/filter/update/delete, cross-user non-leakage, and partial-update preservation/explicit clearing. User settings route coverage now verifies defaults, scoped persistence, and partial-update preservation for preference changes. Admin entitlement route coverage now verifies admin-only grant/list/access/revoke flows, paid/manual access reporting, and grant/revoke audit events. 2026-09-17: mobile event route coverage now verifies authentication, audit-event ownership, metadata defaulting/preservation, and event-type validation. Promotions route coverage now verifies linked-account scoping, configured WordPress bridge requests, and fail-closed upstream error handling. Stitch Vision route coverage now verifies entitlement gating, linked WordPress image bridge calls, bridge-404 direct workflow fallback, default/compact payload fields, and non-404 bridge error handling. Ravelry route coverage now verifies entitlement gating, configured WordPress bridge URL/header/body/query mapping, request validation, and cross-user import update denial. Sync route coverage now verifies authenticated returning-user snapshots, `since` filtering, deleted-pattern tombstones, cross-user isolation, and invalid-cursor rejection. Identity route coverage now verifies authenticated `/me` profile scoping plus manual and standard-trial entitlement snapshots. Rewrite import route coverage now verifies ownership, imported metadata preservation, ordering, validation, and cross-user non-leakage. WordPress sync status coverage now verifies scoped counts, linked/unlinked states, pending mirror gaps, and configured bridge export request details. Project photo route coverage now verifies multipart image validation, owner-scoped listing/download/deletion, signed photo URLs, and object-storage-backed file access. Stash image route coverage now verifies multipart image validation, owner-scoped upload/download, signed stash image URLs, and object-storage-backed file access. Rewrite route coverage now verifies entitlement gating, pattern ownership, metadata-only paid-source blocking, empty-context blocking, direct workflow payloads, WordPress proxy fallback, and persistence. Chat history route coverage now verifies scoped session creation/listing, imported message validation/ordering, and cross-user message isolation.)*
- [x] Cover RevenueCat webhook authorization, replay/idempotency, cancellation, expiry, restore, and user mapping. *(DB-backed coverage verifies authorization failure, unmatched entitlement ignore, unknown-user ignore, unsupported-store ignore, idempotent replay, owner-pinned Apple and Google subscription upserts, cross-user mismatch auditing, cancellation-through-period behavior with cancellation reason metadata, expiration with expiration reason metadata, uncancellation/restore, and entitlement refresh effects. Pure billing tests also cover billing issue, subscription paused, product change, subscription extended, non-renewing purchase, and refund-reversed status mapping.)*
- [ ] Add Expo unit/component tests for session restoration, API errors, entitlement gates, pattern binding, and destructive confirmations. *(2026-09-14: Expo now has a Node-backed unit-test script plus pure coverage for session restoration/token rotation, entitlement gates, user-facing API error mapping, pattern chat/rewrite binding selectors, upload create/file/rollback flow behavior, and destructive account/data, pattern, project, stash, counter, work-log, photo, and marker confirmation copy. 2026-09-16: chat-context document uploads now share tested rollback coverage for create/upload/index failure, summary-refresh fallback, and loaded-pattern intro copy. 2026-09-24: pattern upload rollback coverage now treats backend indexing failure as a failed multi-stage upload and deletes the created private pattern record; session restoration now clears rotated credentials if entitlement hydration is still unauthorized; API error coverage now includes timeout/offline retry copy. Component-level flows remain.)*
- [ ] Add device-level E2E smoke tests for onboarding, login, library, upload, pattern chat/rewrite, project lifecycle, Stitch Vision, stash, logout, and returning-user restoration. *(2026-09-26: device acceptance matrix added for fresh install, onboarding, login/session restoration, library, Ravelry, upload, pattern viewer download, scoped chat/rewrite, projects, stash, Stitch Vision, RevenueCat purchase/restore edge states, logout, offline/timeout/reinstall, accessibility, and nested-menu reachability evidence. Automated device execution still remains.)*
- [ ] Add regression tests for pattern A/B contamination, metadata-only Ravelry blocking, and deleted-record resurrection. *(2026-09-14: metadata-only paid Ravelry workflow blocking is covered by pure guard tests, WordPress/Ravelry sync now has DB-backed regression coverage proving stale exports do not resurrect locally deleted patterns, and pattern-aware chat/rewrite routes now have DB-backed payload-scope coverage for A/B contamination. Full device relaunch/reinstall matrices remain.)*

**2026-09-07 update:** User data export now includes projects, project activity, project photos, pattern marks, counters, and stash items. User data deletion now clears stash items alongside patterns, projects, chats, rewrites, settings, and connections. Full account deletion now has a separate confirmed API/app path that clears synced data, removes refresh tokens, deletes the StitchSense account row, and invalidates future API access. DB-backed integration coverage was added for user scoping, destructive confirmation, token redaction, cross-user preservation, and account deletion.

**Exit gate:** Critical user journeys and security boundaries run automatically; the release branch is green; known P0 regressions have tests.

### 5. Prove production data and cross-platform sync correctness — P0

- [ ] Create a staging copy of representative WordPress data with personal data minimised or anonymised. *(2026-10-14: staging runs 1–3 used the owner's two accounts only; customer-like data still needs minimising or anonymising before use.)*
- [x] Run the audit/import tools and reconcile users, patterns, files, chats, rewrites, projects, and linked accounts. *(2026-09-26: `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md` added for owner-scoped counts, exception capture, and linked account/pattern/file/chat/rewrite/project/stash reconciliation evidence. Staging execution still required. 2026-10-13: staging run 1 recorded in `docs/DATA_SYNC_RECONCILIATION_EVIDENCE.md`. Two test users were imported through the idempotent WordPress sync; patterns 23/23 and rewrites 4/4 matched, owner file access and 138 cross-user requests passed, and four exceptions (E1–E4) are open. Device, bidirectional, stash, and tombstone checks remain. 2026-10-14: runs 2–3 closed E1, E3–E6 (PR #79 fixed chats on deleted patterns and archived WordPress patterns being imported as active); only E2, an orphaned legacy WordPress chat, remains open.)*
- [ ] Validate web upload → mobile open and mobile upload → web open, including large PDFs, thumbnails, and signed URLs. *(2026-09-26: bidirectional upload/open checks are now represented in the reconciliation runbook. Staging execution still required. 2026-10-14: passed on staging with Expo Go: large phone upload opens on the web for the owner only, web upload opens on the phone, signed links verified; thumbnails not separately checked.)*
- [x] Validate create/update/delete and re-sync in both directions under the agreed web-as-master rules. *(2026-10-14: create both ways, delete from the API and the phone, and re-sync without resurrection passed on staging. 2026-10-16: rename in the app, summary edit, archive and delete on the website, and re-sync passed on staging after fixing sync overwrites of newer platform edits and the plugin archive bridge (plugin 7.7.44).)*
- [ ] Run the full pattern contamination and metadata-only Ravelry matrix across app relaunch and account reinstall. *(2026-09-26: pattern-context, metadata-only Ravelry, stale-ID, and deleted-record checks are now represented in the reconciliation runbook. Device/reinstall execution still required. 2026-10-14: API-level matrix, stale IDs, device chat scoping, and relaunch passed on staging; reinstall needs a staging build.)*
- [ ] Rehearse migration rollback and confirm old WordPress behaviour remains available during rollback. *(2026-09-26: `docs/MIGRATION_ROLLBACK_REHEARSAL.md` added for forward migration, isolated database restore, old WordPress behaviour, deleted-account replay/check, and rollback duration evidence. Live rehearsal still required.)*
- [ ] Produce final migration counts, exceptions, and approval before touching production data.

**2026-09-11 update:** `/sync/validation` now has DB-backed integration coverage for platform library counts, recent active/deleted project reporting, and project-child integrity checks that flag active counters, work logs, photos, or marks attached to deleted projects. Representative WordPress staging-data reconciliation and bidirectional device/web evidence remain required for this exit gate.

**Exit gate:** Reconciled counts and bidirectional test evidence show no data loss, ownership leak, stale resurrection, or AI cross-pattern contamination.

### 6. Complete compliant native subscriptions — P0

- [ ] Confirm monthly/annual products, trial rules, prices, entitlement identifier, and account ownership in App Store Connect, Play Console, and RevenueCat.
- [x] Integrate the RevenueCat SDK into the Expo app as the primary iOS/Android subscription path.
- [x] Replace incomplete or non-store digital-subscription paths with RevenueCat native store purchase flows for store builds.
- [ ] Implement purchase, pending purchase, restore, cancellation guidance, expiry, grace period, refund/revocation, and offline/error states. *(2026-09-08: mobile RevenueCat purchase handling now distinguishes active, pending, cancelled, already-purchased, network/offline, unavailable-product, and configuration-error states across paywall/account/promo flows. 2026-09-24: production API startup now fails closed without a long RevenueCat webhook authorization secret, the webhook auth comparison is timing-safe, and half-configured Stripe billing is rejected. 2026-09-25: mobile RevenueCat purchase error mapping is now isolated behind pure tests for cancellation, pending payment, already-purchased, network/offline/timeout, unavailable-product, configuration, and invalid-credential outcomes. Store dashboard/device validation still required for expiry, grace-period, refund, and revocation states.)*
- [x] Keep any pre-existing legacy web entitlement records readable without exposing a mobile checkout or billing-management path.
- [ ] Validate RevenueCat webhooks for both stores and verify one StitchSense user cannot receive another user’s entitlement.
- [ ] Complete Apple sandbox/TestFlight and Google licence-tester/internal-track purchase matrices. *(2026-09-26: `docs/REVENUECAT_STORE_TEST_MATRIX.md` added for iOS/Android/RevenueCat product setup, purchase, restore, cancellation, pending, expiry, grace/billing issue, refund/revocation, and cross-user entitlement evidence. Real store testing still required.)*
- [ ] Configure payout banking in App Store Connect and Google Play Console with the Starling Business account; RevenueCat does not hold payout bank details.
- [ ] Add RevenueCat app-specific public SDK keys to EAS/app build configuration before creating real store builds. *(2026-09-25: a release-config check now fails store-build preparation unless the public iOS/Android RevenueCat SDK keys, entitlement ID, HTTPS API URLs, and bundle/package identifiers are configured. Real EAS environment values still need to be added in Expo before this can be marked complete.)*
- [x] Document Expo/EAS development, preview, and production native build workflow for RevenueCat-capable store testing.

**2026-09-06 update:** Mobile subscriptions now use RevenueCat client-side purchase, restore, and store-management flows. The backend already accepts RevenueCat webhooks and maps Apple/Google subscriptions to StitchSense entitlements by app user ID. Remaining work requires real RevenueCat/App Store/Play Console configuration and sandbox/device validation.

**2026-09-07 update:** Expo/EAS build profiles and release documentation now cover native development, preview/internal, and production store builds. Mobile runtime config ignores blank app config values, so EAS-provided RevenueCat SDK keys and API URLs can override repository defaults without code changes.

**2026-09-07 update:** RevenueCat webhook handling now refuses to reassign an existing Apple/Google store transaction to a different StitchSense user, preserving the original owner and logging a mismatch audit event. Integration coverage was added for webhook authorization, ignored events, idempotent renewal updates, and cross-user transaction mismatch protection.

**2026-09-11 update:** RevenueCat webhook integration coverage now also asserts Apple cancellation keeps entitlement active through the paid-through date, Apple expiration removes platform entitlement access, and Google Play Store purchases map to Google-backed Pro monthly subscriptions. Real store-console sandbox/internal-track validation is still required before this exit gate can pass.

**2026-09-14 update:** RevenueCat webhook handling now detects previously received event IDs before mutating subscription state again, and the database enforces a unique receipt record for RevenueCat webhook event IDs. Integration coverage asserts replay delivery is accepted without duplicating receipt audit rows.

**2026-09-14 update:** Billing production readiness is focused on RevenueCat plus the Apple App Store and Google Play in-app purchase flows.

**2026-09-16 update:** The Expo mobile subscription surfaces no longer offer web checkout or provider-branded web billing management. Paywall, account, and promo checkout actions now route mobile purchases and subscription management through RevenueCat/App Store/Google Play only, while legacy web entitlements are displayed generically as legacy web subscriptions.

**2026-10-09 update:** Internal developer/support/beta lifetime access remains an admin-granted entitlement path, not a public RevenueCat lifetime product. Manual grants are resolved before store subscriptions on the backend and documented in the RevenueCat setup, store submission, review-note, and legal-publication checklists.

**2026-09-16 update:** The old web subscription setup guide was removed from launch documentation so production setup instructions now point mobile subscriptions to RevenueCat, Apple App Store, and Google Play only.

**Exit gate:** Purchase, restore, cancel, expire, and cross-device entitlement refresh pass on real iOS and Android store builds.

### 7. Complete physical-device, accessibility, and UX hardening — P1

- [ ] Test supported small/large iPhones and representative Android phone sizes for Stage 1. *(2026-09-26: `docs/DEVICE_ACCEPTANCE_MATRIX.md` now defines the physical-device evidence matrix; real device results still required. 2026-10-06: Stage 1 is phone-only on iOS with `expo.ios.supportsTablet` set to `false`; tablet QA is deferred until tablet support is re-enabled.)*
- [ ] Test slow/offline networks, expired sessions, API timeouts, interrupted uploads, background/resume, reinstall, and low-storage conditions. *(2026-09-26: recovery scenarios are now represented in the device acceptance matrix; execution evidence still required.)*
- [ ] Validate camera/photo permissions and Stitch Vision using real captures and non-English inputs.
- [ ] Audit VoiceOver/TalkBack labels, focus order, tap targets, contrast, reduced motion, and dynamic text overflow. *(2026-09-26: accessibility checks are now represented in the device acceptance matrix, including the movable global menu tab. `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md` added for focused VoiceOver/TalkBack, tap target, dynamic text, contrast, reduced-motion, and error-state evidence. Execution evidence still required.)*
- [ ] Standardise launch-critical loading, empty, error, destructive-action, and form-validation states.
- [ ] Run a focused performance pass for startup, long pattern lists, large project histories, PDFs, images, and chat rendering. *(2026-09-26: `docs/PERFORMANCE_ACCEPTANCE_PLAN.md` added for startup, session restoration, long lists, PDFs, project histories, stash images, chat rendering, slow/offline network, older devices, and low-storage evidence. Real device execution still required.)*

**Exit gate:** The supported-device matrix passes with no P0/P1 defects and no critical accessibility blocker.

### 8. Harden deployment and production operations — P1

- [x] Add versioned migration tracking and a controlled migrate-before-release job with backward-compatible rollout rules.
- [d] Add staging infrastructure using separate database, storage, webhooks, secrets, and app build channels. *(VPS-local API/Postgres/MinIO staging stack provisioned on 2026-09-06 with separate generated secrets, localhost-only ports, dedicated Compose project/image identity, schema migrations 001-008 applied, and staging MinIO bucket created. 2026-09-25: staging Postgres and MinIO images are digest-pinned, VPS MinIO now uses the same pinned Quay image as CI, and a reusable API health/readiness smoke script is documented for staging checks. Pending public proxy/app-channel wiring and representative-data validation. 2026-10-11: migration `009` (RevenueCat event replay index) is not recorded as applied to staging; apply it before staging billing tests.)*
- [x] Run the API container as a non-root user with a health check, minimal production dependencies, localhost-only host binding, and private reverse-proxy networking.
- [x] Add and validate graceful shutdown behaviour and explicit CPU/memory resource limits.
- [ ] Add structured logs, request correlation IDs, crash reporting, uptime checks, latency/error metrics, and alert routing. *(2026-09-11: backend request IDs, structured slow-request logs, redaction, and a guarded Prometheus-style `/metrics` endpoint now provide API request totals and latency buckets. 2026-09-25: `/metrics` also exports low-cardinality workflow attempt counters/latency histograms by workflow type, outcome, and status class, plus billing webhook counters/latency histograms by provider, outcome, and status class. Regression coverage proves workflow metrics omit endpoint URLs, payload IDs, and secrets, and billing webhook metrics omit event IDs, transaction IDs, and authorization material. The shared smoke script now optionally verifies guarded metrics access when `STITCHSENSE_METRICS_SHARED_SECRET` is configured, and the scheduled uptime workflow reuses that script. 2026-09-26: `docs/CRASH_REPORTING_PLAN.md` added for provider selection, required crash signals, privacy rules, and rollout thresholds. `docs/N8N_WORKFLOW_RELEASE_CHECKLIST.md` added for workflow release contracts, rollback, and metrics privacy. `docs/INCIDENT_POSTMORTEM_TEMPLATE.md` added for production incident, release-hold, store-review blocker, billing, data-integrity, and pattern-context postmortems. External crash-reporting implementation and live alert routing remain.)*
- [ ] Create dashboards and alerts for API availability, authentication failures, workflow failures, webhook failures, database capacity, and storage errors. *(2026-09-11: scheduled GitHub Actions uptime checks now probe public `/health` and deep `/ready` every 15 minutes and can notify an optional `UPTIME_ALERT_WEBHOOK_URL` incident webhook on failure. 2026-09-25: operations docs now call out alert targets for workflow `http_error`, `workflow_error`, and `exception` outcomes and billing webhook `unauthorized`, `invalid_payload`, `configuration_error`, and `exception` outcomes. Prometheus-compatible starter rules now live in `ops/monitoring/stitchsense-alerts.yml` for API scrape loss, elevated API 5xx rate, route-specific error bursts, authentication client-failure spikes, API/workflow latency, workflow failures, and billing webhook authorization/configuration/processing failures. 2026-09-26: starter dashboard JSON added for API traffic/errors/latency, auth failures, workflow failures, and billing webhook failures. Database/storage alerts and live alert routing rehearsal remain.)*
- [ ] Document and rehearse deployment, rollback, database restore, secret rotation, and incident-response runbooks. *(2026-09-07: general operations runbook added. 2026-09-26: `docs/OPERATIONS_REHEARSAL_LOG.md` added for deployment, rollback, isolated restore, secret rotation, and incident-response rehearsal evidence. Live rehearsal evidence still required before this can be marked complete.)*
- [ ] Define retention, deletion, and backup policies for user data, logs, audit events, and uploaded files. *(2026-09-07: operational draft policy added; business/legal approval and deletion/restore rehearsal still required.)*

**Exit gate:** A staging release can be deployed and rolled back automatically; monitoring detects a forced failure; backup restoration is demonstrated.

### 9. Finalise legal, privacy, support, and store materials — P1

- [ ] Obtain business/legal approval for the privacy policy, terms, subscription terms, retention statements, and account deletion process.
- [ ] Publish stable HTTPS privacy, terms, and support/contact URLs. *(2026-09-26: `docs/SUPPORT_READINESS_RUNBOOK.md` added for support channels, triage playbook, escalation paths, and launch support readiness. `docs/SUPPORT_MACRO_LIBRARY.md` added for beta/store/public support response copy. `docs/LEGAL_PUBLICATION_CHECKLIST.md` added for privacy, terms, subscription terms, support/contact, and account deletion publication evidence. Public URLs still need publication.)*
- [ ] Complete Apple privacy labels and Google Data Safety answers against the actual SDK and backend data inventory. *(2026-09-26: `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` added to align policy, Apple privacy labels, Google Data Safety, SDKs, permissions, deletion, and sharing declarations. `docs/IOS_PRIVACY_MANIFEST_REVIEW.md` added to align app config privacy manifests, native permissions, RevenueCat, crash-reporting provider choice, and App Store labels. Business/legal approval still required.)*
- [ ] Produce compliant 1024×1024 non-alpha iOS artwork, Android adaptive icon layers, splash assets, feature graphic, and required phone screenshots. *(2026-09-26: screenshot capture helper now supports `STITCH_CAPTURE_API_BASE_URL` so staging/review screenshots do not need to read production API data. `docs/ASSET_VALIDATION_CHECKLIST.md` added for icon, splash, feature graphic, screenshot, tablet screenshot, and caption evidence. Tablet screenshots are N/A for Stage 1 while iOS tablet support is disabled. Final assets still required.)*
- [ ] Finalise store descriptions, keywords, categories, age/content ratings, review notes, support details, and test-account instructions. *(2026-09-26: `docs/STORE_SUBMISSION_CHECKLIST.md` added for store identity, assets, listing copy, subscription setup, and release controls. `docs/STORE_CONSOLE_SETUP_CHECKLIST.md` added for App Store Connect, Google Play Console, and RevenueCat console setup evidence. `docs/STORE_REVIEW_NOTES.md` added for review account handling, reviewer instructions, subscriptions, Ravelry metadata limits, Stitch Vision permissions, deletion, support codes, and sensitive-feature notes. `docs/REVIEW_TEST_ACCOUNT_PROTOCOL.md` added for private reviewer/beta/billing/support test-account handling. Final console entries still required.)*
- [x] Decide whether iPad/tablet support ships in v1; if retained, complete tablet QA and assets. *(2026-09-26: `docs/TABLET_SUPPORT_DECISION.md` added for explicit release ownership. 2026-10-06: Stage 1 is phone-only with `expo.ios.supportsTablet` set to `false`; tablet screenshots, tablet QA, and tablet optimization are deferred.)*

**Exit gate:** Legal copy is approved and published; both store listings contain final, internally consistent declarations and assets.

### 10. Run controlled beta and production rollout — Release

- [ ] Build signed production candidates from a tagged, green commit and record artifact hashes and configuration versions. *(2026-09-25: release-candidate evidence template added for build IDs, image digest, app versions, config identifiers, CI gates, store/billing checks, device acceptance, data/sync evidence, rollout monitoring, and release decision capture. 2026-09-26: `docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md` added for EAS environment, channel, public app config, RevenueCat key, and build-number evidence before native builds.)*
- [ ] Run an internal acceptance pass against staging, then TestFlight and Play Internal Testing with real non-developer users.
- [ ] Triage beta feedback, fix all P0/P1 issues, and rerun affected regression suites. *(2026-09-26: `docs/BETA_FEEDBACK_TRIAGE.md` added for intake, severity definitions, ownership/entitlement/pattern-context checks, and release hold/rollback decisions. Real beta feedback triage still required.)*
- [ ] Perform final security, privacy, migration, billing, backup, monitoring, and store-readiness sign-offs. *(2026-09-26: `docs/RELEASE_DECISION_LOG.md` added for go/no-go evidence across CI, release config, readiness, device acceptance, data/sync, store, privacy, backup, operations, and monitoring. `docs/SECURITY_SIGNOFF_CHECKLIST.md` added for backend/data/mobile/release security signoff. `docs/ENVIRONMENT_CONFIGURATION_MATRIX.md` added for backend and EAS config parity across development, staging, preview, and production. `docs/RELEASE_RISK_REGISTER.md` added for launch risks, rollback thresholds, and accepted/blocking risk review.)*
- [ ] Deploy backend/database changes before the compatible mobile release using the rehearsed rollout sequence.
- [ ] Submit to Apple and Google, respond to review findings, and use manual/phased release after approval.
- [ ] Monitor crash-free sessions, API errors, auth failures, purchases, sync, AI workflow failures, support contacts, and reviews during rollout. *(2026-09-26: `docs/POST_RELEASE_MONITORING_CHECKLIST.md` added for first-hour/first-day checks and hold/rollback triggers.)*
- [ ] Hold or roll back when agreed error, crash, billing, or data-integrity thresholds are breached.

**Exit gate:** Approved store versions are released gradually, production indicators remain within thresholds, and no unresolved P0/P1 incident exists.

## Fastest Safe Execution Sequence

1. **Day-one containment:** Workstreams 1 and 2.
2. **Engineering foundation:** Workstream 3, then begin Workstream 4.
3. **Parallel launch tracks:** Run Workstreams 5, 6, 7, 8, and 9 concurrently once the security baseline and CI gates are stable.
4. **Release convergence:** Complete Workstream 10 only after every preceding exit gate is signed off.

## Progress Scoring

Recalculate the production-readiness percentage only when exit-gate evidence is complete:

| Area | Weight |
|---|---:|
| Core product journeys and UX | 25% |
| Backend, data, and sync correctness | 20% |
| Security and privacy | 20% |
| Automated testing and build quality | 15% |
| Deployment, observability, and recovery | 10% |
| Billing, legal, and store release | 10% |

**Production-ready means 100% of P0/P1 exit gates pass.** Deferred P2 enhancements do not block launch unless beta evidence promotes them to P1.

## Immediate Next Task

Build the isolated staging environment in Workstream 5, then expand the automated journey coverage in Workstream 4 against that environment. Branch-protection enforcement should be enabled as soon as the GitHub repository plan permits it.
