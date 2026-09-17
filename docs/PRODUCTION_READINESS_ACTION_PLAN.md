# StitchSense Production Readiness Action Plan

**Baseline:** 52% production-ready as of 28 August 2026.

**Execution update (5 September 2026):** The bridge host restriction is deployed and verified; backups are verified off-server; the bridge secret is rotated; pre-rotation sessions are revoked; the published demo login is retired; backend production configuration, authentication throttling, CORS, headers, proxy handling, and upload validation are hardened; Node 22 builds and CI gates are deterministic; and Expo SDK 54 passes lint, typecheck, dependency compatibility, and all 18 Expo Doctor checks.

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

### 1. Establish a recoverable baseline — P0

- [x] Create one project-wide Git repository that includes the Expo app, API, WordPress plugin source, migrations, scripts, and release documentation.
- [x] Preserve the current Expo history, remove backup/generated ZIPs from the release source tree, and commit the current known state.
- [x] Configure a private remote repository, pull-request checks, and secret scanning.
- [ ] Enable protected-main enforcement for required checks when the GitHub repository plan supports rulesets/branch protection.
- [x] Remove published demo credentials and disable or rotate the live demo account before public testing.
- [x] Inventory production services, versions, owners, DNS/proxy configuration, and credential locations without copying secret values into documentation.
- [x] Take and verify a PostgreSQL backup and document the object-storage backup/recovery method.

**Exit gate:** The entire release source is versioned and remotely recoverable; production data has a verified backup; no public reusable credentials remain.

### 2. Contain and repair critical security risks — P0

- [x] Remove client control of WordPress bridge destinations in `/auth/wordpress-login` and `/auth/wordpress-register`; use an exact configured-host allowlist and block private/link-local redirects.
- [x] Rotate `WORDPRESS_BRIDGE_SHARED_SECRET` after deploying the bridge fix, revoke active refresh tokens as appropriate, and audit linked administrator accounts.
- [x] Upgrade or replace the vulnerable Fastify JWT dependency chain and apply safe backend dependency patches.
- [x] Triage Expo dependency advisories, apply compatible patches, and record any build-only residual findings with justification and an upgrade target.
- [x] Add startup validation that refuses production boot with default, empty, malformed, or development credentials.
- [x] Apply authentication-specific rate limits to login, registration, refresh, password reset, and WordPress bridge routes.
- [x] Restrict browser CORS origins, add security headers, validate proxy/IP handling, and review upload limits and MIME/content validation.
- [x] Move production secrets to appropriately protected storage and restrict any necessary environment file to owner-only permissions.
- [x] Run focused authorization tests for cross-user patterns, projects, files, chats, rewrites, stash items, and admin routes.

**Exit gate:** No unresolved critical/high exploitable backend finding; bridge-secret exfiltration is impossible; rotated credentials are live; authorization tests pass.

### 3. Make builds deterministic and enforce quality gates — P0

- [x] Fix the current React Hooks lint error and resolve or deliberately suppress all remaining warnings with explanations.
- [x] Upgrade local and CI runtimes to supported Node 22 LTS and align Expo SDK patch versions reported by Expo Doctor.
- [x] Reconcile `app.json`, `app.config.js`, package version, bundle identifiers, Android package, and deployment documentation.
- [x] Use `npm ci` in CI and Docker builds; pin the container base image to an intentional supported version.
- [x] Add CI jobs for PHP syntax, backend build/tests, Expo typecheck/lint/Doctor, dependency audit, secret scan, and container build.
- [ ] Block merges and production builds when a required gate fails.

**Exit gate:** A clean checkout passes every CI gate with no manual setup beyond documented environment configuration.

### Dependency triage record

- Backend production dependencies report zero known vulnerabilities after a clean Node 22 `npm ci`.
- Expo SDK 54 was updated to its supported patch set (`expo` 54.0.37, `expo-constants` 18.0.14, and `expo-file-system` 19.0.24). Compatible audit fixes were applied.
- The remaining Expo audit report is 10 moderate and 10 high transitive findings in Metro/Expo build tooling (`image-size`, `postcss`, `uuid`, and related dependency chains), with no critical finding. npm's offered remediation is an unsupported breaking jump to Expo 57, so it is deliberately deferred to the SDK 57 upgrade track. These packages are not backend runtime dependencies; CI blocks any new critical advisory and continues to enforce Expo's supported dependency matrix.
- GitHub Actions run `33967860092` passed all four required jobs, including the isolated PostgreSQL cross-user authorization suite, Expo checks, PHP syntax, secret scanning, dependency audits, and production container build.
- GitHub Actions run `33968160241` passed on protected release source commit `1c88c5c`; the same commit was deployed to production as image `sha256:03a07dc07c80740712df50cc808b02a875f28b469fa72d45884ef5a67457d10e`.
- GitHub branch-protection enforcement remains unavailable on the repository's current plan. Checks run on every pull request and push to `main`, but GitHub cannot yet prevent an administrator from bypassing them.
- 2026-09-11: the CI MinIO integration-test image now pulls from pinned Quay release digest `sha256:ed9be66eb5f2636c18289c34c3b725ddf57815f2777c77b5938543b78a44f144` after Docker Hub denied the matching `minio/minio` pull during PR #35.
- 2026-09-11: CI action pins were advanced to `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0 SHAs to clear GitHub's Node 20 action-runtime deprecation warnings while keeping supply-chain pins explicit.

### 4. Build a launch-level automated test suite — P0/P1

- [ ] Add backend route/integration tests using isolated PostgreSQL and object-storage services. *(2026-09-07: CI now provisions isolated PostgreSQL and MinIO for backend integration checks; broader route coverage still remains.)*
- [ ] Cover registration, login, refresh rotation/revocation, password reset, bridge authentication, entitlements, uploads, signed file access, and data deletion/export. *(2026-09-07: auth lifecycle now has DB-backed coverage for registration, login failure/success, refresh rotation, refresh-token reuse rejection, logout revocation, and password-reset unavailable-state handling. Signed file access coverage now verifies active owner access, stored-object presigned URLs/downloads, transfer-token downloads, tamper rejection, cross-user denial, and deleted-pattern denial. Data export/deletion now has DB-backed coverage for user scoping, destructive confirmation, project/stash inclusion, token redaction, and cross-user preservation. Backend upload route coverage now verifies entitlement-gated text-file upload storage plus multipart indexing workflow payload/persistence against PostgreSQL and MinIO. 2026-09-16: project route coverage now verifies owner create/list/update/sync-validation/delete plus linked-pattern ownership/deletion guards, counters, work-log entries, and resume marks. Stash route coverage now verifies owner create/list/filter/update/delete, cross-user non-leakage, and partial-update preservation/explicit clearing. User settings route coverage now verifies defaults, scoped persistence, and partial-update preservation for preference changes. Admin entitlement route coverage now verifies admin-only grant/list/access/revoke flows, paid/manual access reporting, and grant/revoke audit events. 2026-09-17: mobile event route coverage now verifies authentication, audit-event ownership, metadata defaulting/preservation, and event-type validation. Promotions route coverage now verifies linked-account scoping, configured WordPress bridge requests, and fail-closed upstream error handling.)*
- [ ] Cover RevenueCat webhook authorization, replay/idempotency, cancellation, expiry, restore, and user mapping.
- [ ] Add Expo unit/component tests for session restoration, API errors, entitlement gates, pattern binding, and destructive confirmations. *(2026-09-14: Expo now has a Node-backed unit-test script plus pure coverage for session restoration/token rotation, entitlement gates, user-facing API error mapping, pattern chat/rewrite binding selectors, upload create/file/rollback flow behavior, and destructive account/data, pattern, project, stash, counter, work-log, photo, and marker confirmation copy. 2026-09-16: chat-context document uploads now share tested rollback coverage for create/upload/index failure, summary-refresh fallback, and loaded-pattern intro copy. Component-level flows remain.)*
- [ ] Add device-level E2E smoke tests for onboarding, login, library, upload, pattern chat/rewrite, project lifecycle, Stitch Vision, stash, logout, and returning-user restoration.
- [ ] Add regression tests for pattern A/B contamination, metadata-only Ravelry blocking, and deleted-record resurrection. *(2026-09-14: metadata-only paid Ravelry workflow blocking is covered by pure guard tests, WordPress/Ravelry sync now has DB-backed regression coverage proving stale exports do not resurrect locally deleted patterns, and pattern-aware chat/rewrite routes now have DB-backed payload-scope coverage for A/B contamination. Full device relaunch/reinstall matrices remain.)*

**2026-09-07 update:** User data export now includes projects, project activity, project photos, pattern marks, counters, and stash items. User data deletion now clears stash items alongside patterns, projects, chats, rewrites, settings, and connections. Full account deletion now has a separate confirmed API/app path that clears synced data, removes refresh tokens, deletes the StitchSense account row, and invalidates future API access. DB-backed integration coverage was added for user scoping, destructive confirmation, token redaction, cross-user preservation, and account deletion.

**Exit gate:** Critical user journeys and security boundaries run automatically; the release branch is green; known P0 regressions have tests.

### 5. Prove production data and cross-platform sync correctness — P0

- [ ] Create a staging copy of representative WordPress data with personal data minimised or anonymised.
- [ ] Run the audit/import tools and reconcile users, patterns, files, chats, rewrites, projects, and linked accounts.
- [ ] Validate web upload → mobile open and mobile upload → web open, including large PDFs, thumbnails, and signed URLs.
- [ ] Validate create/update/delete and re-sync in both directions under the agreed web-as-master rules.
- [ ] Run the full pattern contamination and metadata-only Ravelry matrix across app relaunch and account reinstall.
- [ ] Rehearse migration rollback and confirm old WordPress behaviour remains available during rollback.
- [ ] Produce final migration counts, exceptions, and approval before touching production data.

**2026-09-11 update:** `/sync/validation` now has DB-backed integration coverage for platform library counts, recent active/deleted project reporting, and project-child integrity checks that flag active counters, work logs, photos, or marks attached to deleted projects. Representative WordPress staging-data reconciliation and bidirectional device/web evidence remain required for this exit gate.

**Exit gate:** Reconciled counts and bidirectional test evidence show no data loss, ownership leak, stale resurrection, or AI cross-pattern contamination.

### 6. Complete compliant native subscriptions — P0

- [ ] Confirm monthly/annual products, trial rules, prices, entitlement identifier, and account ownership in App Store Connect, Play Console, and RevenueCat.
- [x] Integrate the RevenueCat SDK into the Expo app as the primary iOS/Android subscription path.
- [x] Replace incomplete or non-store digital-subscription paths with RevenueCat native store purchase flows for store builds.
- [ ] Implement purchase, pending purchase, restore, cancellation guidance, expiry, grace period, refund/revocation, and offline/error states. *(2026-09-08: mobile RevenueCat purchase handling now distinguishes active, pending, cancelled, already-purchased, network/offline, unavailable-product, and configuration-error states across paywall/account/promo flows. Store dashboard/device validation still required for expiry, grace-period, refund, and revocation states.)*
- [x] Keep any pre-existing legacy web entitlement records readable without exposing a mobile checkout or billing-management path.
- [ ] Validate RevenueCat webhooks for both stores and verify one StitchSense user cannot receive another user’s entitlement.
- [ ] Complete Apple sandbox/TestFlight and Google licence-tester/internal-track purchase matrices.
- [ ] Configure payout banking in App Store Connect and Google Play Console with the Starling Business account; RevenueCat does not hold payout bank details.
- [ ] Add RevenueCat app-specific public SDK keys to EAS/app build configuration before creating real store builds.
- [x] Document Expo/EAS development, preview, and production native build workflow for RevenueCat-capable store testing.

**2026-09-06 update:** Mobile subscriptions now use RevenueCat client-side purchase, restore, and store-management flows. The backend already accepts RevenueCat webhooks and maps Apple/Google subscriptions to StitchSense entitlements by app user ID. Remaining work requires real RevenueCat/App Store/Play Console configuration and sandbox/device validation.

**2026-09-07 update:** Expo/EAS build profiles and release documentation now cover native development, preview/internal, and production store builds. Mobile runtime config ignores blank app config values, so EAS-provided RevenueCat SDK keys and API URLs can override repository defaults without code changes.

**2026-09-07 update:** RevenueCat webhook handling now refuses to reassign an existing Apple/Google store transaction to a different StitchSense user, preserving the original owner and logging a mismatch audit event. Integration coverage was added for webhook authorization, ignored events, idempotent renewal updates, and cross-user transaction mismatch protection.

**2026-09-11 update:** RevenueCat webhook integration coverage now also asserts Apple cancellation keeps entitlement active through the paid-through date, Apple expiration removes platform entitlement access, and Google Play Store purchases map to Google-backed Pro monthly subscriptions. Real store-console sandbox/internal-track validation is still required before this exit gate can pass.

**2026-09-14 update:** RevenueCat webhook handling now detects previously received event IDs before mutating subscription state again, and the database enforces a unique receipt record for RevenueCat webhook event IDs. Integration coverage asserts replay delivery is accepted without duplicating receipt audit rows.

**2026-09-14 update:** Billing production readiness is focused on RevenueCat plus the Apple App Store and Google Play in-app purchase flows.

**2026-09-16 update:** The Expo mobile subscription surfaces no longer offer web checkout or provider-branded web billing management. Paywall, account, and promo checkout actions now route mobile purchases and subscription management through RevenueCat/App Store/Google Play only, while legacy web entitlements are displayed generically as legacy web subscriptions.

**2026-09-16 update:** The old web subscription setup guide was removed from launch documentation so production setup instructions now point mobile subscriptions to RevenueCat, Apple App Store, and Google Play only.

**Exit gate:** Purchase, restore, cancel, expire, and cross-device entitlement refresh pass on real iOS and Android store builds.

### 7. Complete physical-device, accessibility, and UX hardening — P1

- [ ] Test supported small/large iPhones, iPad if tablet support remains enabled, and representative Android phone/tablet sizes.
- [ ] Test slow/offline networks, expired sessions, API timeouts, interrupted uploads, background/resume, reinstall, and low-storage conditions.
- [ ] Validate camera/photo permissions and Stitch Vision using real captures and non-English inputs.
- [ ] Audit VoiceOver/TalkBack labels, focus order, tap targets, contrast, reduced motion, and dynamic text overflow.
- [ ] Standardise launch-critical loading, empty, error, destructive-action, and form-validation states.
- [ ] Run a focused performance pass for startup, long pattern lists, large project histories, PDFs, images, and chat rendering.

**Exit gate:** The supported-device matrix passes with no P0/P1 defects and no critical accessibility blocker.

### 8. Harden deployment and production operations — P1

- [x] Add versioned migration tracking and a controlled migrate-before-release job with backward-compatible rollout rules.
- [x] Add staging infrastructure using separate database, storage, webhooks, secrets, and app build channels. *(VPS-local API/Postgres/MinIO staging stack provisioned on 2026-09-06 with separate generated secrets, localhost-only ports, dedicated Compose project/image identity, schema migrations 001-008 applied, and staging MinIO bucket created. Pending public proxy/app-channel wiring and representative-data validation.)*
- [x] Run the API container as a non-root user with a health check, minimal production dependencies, localhost-only host binding, and private reverse-proxy networking.
- [x] Add and validate graceful shutdown behaviour and explicit CPU/memory resource limits.
- [ ] Add structured logs, request correlation IDs, crash reporting, uptime checks, latency/error metrics, and alert routing. *(2026-09-11: backend request IDs, structured slow-request logs, redaction, and a guarded Prometheus-style `/metrics` endpoint now provide API request totals and latency buckets. External crash reporting, dashboards, and alert routing remain.)*
- [ ] Create dashboards and alerts for API availability, authentication failures, workflow failures, webhook failures, database capacity, and storage errors. *(2026-09-11: scheduled GitHub Actions uptime checks now probe public `/health` and deep `/ready` every 15 minutes and can notify an optional `UPTIME_ALERT_WEBHOOK_URL` incident webhook on failure. Dedicated dashboards and broader alert routing remain.)*
- [ ] Document and rehearse deployment, rollback, database restore, secret rotation, and incident-response runbooks. *(2026-09-07: general operations runbook added; live rehearsal evidence still required before this can be marked complete.)*
- [ ] Define retention, deletion, and backup policies for user data, logs, audit events, and uploaded files. *(2026-09-07: operational draft policy added; business/legal approval and deletion/restore rehearsal still required.)*

**Exit gate:** A staging release can be deployed and rolled back automatically; monitoring detects a forced failure; backup restoration is demonstrated.

### 9. Finalise legal, privacy, support, and store materials — P1

- [ ] Obtain business/legal approval for the privacy policy, terms, subscription terms, retention statements, and account deletion process.
- [ ] Publish stable HTTPS privacy, terms, and support/contact URLs.
- [ ] Complete Apple privacy labels and Google Data Safety answers against the actual SDK and backend data inventory.
- [ ] Produce compliant 1024×1024 non-alpha iOS artwork, Android adaptive icon layers, splash assets, feature graphic, and phone/tablet screenshots.
- [ ] Finalise store descriptions, keywords, categories, age/content ratings, review notes, support details, and test-account instructions.
- [ ] Decide whether iPad/tablet support ships in v1; if retained, complete tablet QA and assets.

**Exit gate:** Legal copy is approved and published; both store listings contain final, internally consistent declarations and assets.

### 10. Run controlled beta and production rollout — Release

- [ ] Build signed production candidates from a tagged, green commit and record artifact hashes and configuration versions.
- [ ] Run an internal acceptance pass against staging, then TestFlight and Play Internal Testing with real non-developer users.
- [ ] Triage beta feedback, fix all P0/P1 issues, and rerun affected regression suites.
- [ ] Perform final security, privacy, migration, billing, backup, monitoring, and store-readiness sign-offs.
- [ ] Deploy backend/database changes before the compatible mobile release using the rehearsed rollout sequence.
- [ ] Submit to Apple and Google, respond to review findings, and use manual/phased release after approval.
- [ ] Monitor crash-free sessions, API errors, auth failures, purchases, sync, AI workflow failures, support contacts, and reviews during rollout.
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
