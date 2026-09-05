# StitchSense Production Readiness Action Plan

**Baseline:** 52% production-ready as of 28 August 2026.

**Execution update (5 September 2026):** The bridge host restriction is deployed and verified; backups are verified off-server; the bridge secret is rotated; pre-rotation sessions are revoked; the published demo login is retired; backend production configuration, authentication throttling, CORS, headers, proxy handling, and upload validation are hardened; Node 22 builds and CI gates are deterministic; and Expo SDK 54 passes lint, typecheck, dependency compatibility, and all 18 Expo Doctor checks.

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
- [ ] Configure a private remote repository, protected main branch, pull-request checks, and secret scanning.
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

### 4. Build a launch-level automated test suite — P0/P1

- [ ] Add backend route/integration tests using isolated PostgreSQL and object-storage services.
- [ ] Cover registration, login, refresh rotation/revocation, password reset, bridge authentication, entitlements, uploads, signed file access, and data deletion/export.
- [ ] Cover Stripe and RevenueCat webhook signatures, replay/idempotency, cancellation, expiry, restore, and user mapping.
- [ ] Add Expo unit/component tests for session restoration, API errors, entitlement gates, pattern binding, and destructive confirmations.
- [ ] Add device-level E2E smoke tests for onboarding, login, library, upload, pattern chat/rewrite, project lifecycle, Stitch Vision, stash, logout, and returning-user restoration.
- [ ] Add regression tests for pattern A/B contamination, metadata-only Ravelry blocking, and deleted-record resurrection.

**Exit gate:** Critical user journeys and security boundaries run automatically; the release branch is green; known P0 regressions have tests.

### 5. Prove production data and cross-platform sync correctness — P0

- [ ] Create a staging copy of representative WordPress data with personal data minimised or anonymised.
- [ ] Run the audit/import tools and reconcile users, patterns, files, chats, rewrites, projects, and linked accounts.
- [ ] Validate web upload → mobile open and mobile upload → web open, including large PDFs, thumbnails, and signed URLs.
- [ ] Validate create/update/delete and re-sync in both directions under the agreed web-as-master rules.
- [ ] Run the full pattern contamination and metadata-only Ravelry matrix across app relaunch and account reinstall.
- [ ] Rehearse migration rollback and confirm old WordPress behaviour remains available during rollback.
- [ ] Produce final migration counts, exceptions, and approval before touching production data.

**Exit gate:** Reconciled counts and bidirectional test evidence show no data loss, ownership leak, stale resurrection, or AI cross-pattern contamination.

### 6. Complete compliant native subscriptions — P0

- [ ] Confirm monthly/annual products, trial rules, prices, entitlement identifier, and account ownership in App Store Connect, Play Console, and RevenueCat.
- [ ] Integrate RevenueCat into the Expo app for Apple StoreKit and Google Play Billing.
- [ ] Replace iOS “coming soon” and Android Stripe digital-subscription checkout with native purchase flows for store builds.
- [ ] Implement purchase, pending purchase, restore, cancellation guidance, expiry, grace period, refund/revocation, and offline/error states.
- [ ] Preserve Stripe billing only on permitted web/distribution channels and keep entitlement resolution consistent across providers.
- [ ] Validate RevenueCat webhooks for both stores and verify one StitchSense user cannot receive another user’s entitlement.
- [ ] Complete Apple sandbox/TestFlight and Google licence-tester/internal-track purchase matrices.

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

- [ ] Add versioned migration tracking and a controlled migrate-before-release job with backward-compatible rollout rules.
- [ ] Add staging infrastructure using separate database, storage, webhooks, secrets, and app build channels.
- [ ] Harden the API container: non-root user, health/readiness checks, graceful shutdown, resource limits, and minimal production dependencies.
- [ ] Add structured logs, request correlation IDs, crash reporting, uptime checks, latency/error metrics, and alert routing.
- [ ] Create dashboards and alerts for API availability, authentication failures, workflow failures, webhook failures, database capacity, and storage errors.
- [ ] Document and rehearse deployment, rollback, database restore, secret rotation, and incident-response runbooks.
- [ ] Define retention, deletion, and backup policies for user data, logs, audit events, and uploaded files.

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

Start with Workstream 1 and the WordPress bridge portion of Workstream 2. Before modifying the bridge, capture the current repository state and verified backups; then implement host restriction tests, deploy the fix, and rotate the shared secret.
