# StitchSense Release Hardening Changeset Plan

Use this plan to split the current release-hardening work into reviewable commits or pull requests. Do not mix unrelated product changes into these groups.

## 1. Local And Expo Release Baseline

Purpose: make local checks reliable on the older development machine and clear Expo release gates.

Files:

- `tools/run-with-node22.sh`
- `tools/start-stitchsense-expo.sh`
- `tools/validate-mobile-release-artifacts.mjs`
- `Mobile App/stitchsense-expo/package.json`
- `Mobile App/stitchsense-expo/package-lock.json`
- `Mobile App/stitchsense-expo/eslint.config.js`
- `Mobile App/stitchsense-expo/app.config.js`
- `Mobile App/backend/stitchsense-api/package.json`
- `Mobile App/stitchsense-expo/app.json`
- `Mobile App/stitchsense-expo/assets/images/app-icon.png`
- `Mobile App/stitchsense-expo/assets/images/splash-logo.png`
- `Mobile App/stitchsense-expo/assets/images/android-adaptive-foreground.png`
- `docs/EXPO_BUILD_AND_RELEASE_RUNBOOK.md`
- `docs/STAGE_1_RELEASE_BUILD_ACTION_PLAN.md`
- `docs/ASSET_VALIDATION_CHECKLIST.md`
- `docs/STORE_SUBMISSION_CHECKLIST.md`
- `docs/TABLET_SUPPORT_DECISION.md`
- `docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md`
- `docs/ENVIRONMENT_CONFIGURATION_MATRIX.md`
- `docs/CRASH_REPORTING_PLAN.md`
- `docs/IOS_PRIVACY_MANIFEST_REVIEW.md`

Verification:

- `npm run check:mobile-artifacts`
- `npm run check:capture-script`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- backend `npm run build`
- `npx expo install --check`
- `npx expo-doctor`
- `node tools/validate-production-artifacts.mjs`

## 2. Backend Security, Metrics, And Billing Hardening

Purpose: keep backend launch security, metrics, billing webhook, and workflow-hardening changes together.

Files:

- `.github/workflows/ci.yml`
- `.github/workflows/uptime.yml`
- `Mobile App/backend/docker-compose.staging.yml`
- `Mobile App/backend/docker-compose.vps.yml`
- `Mobile App/backend/scripts/smoke-api.sh`
- `Mobile App/backend/stitchsense-api/.env.staging.example`
- `Mobile App/backend/stitchsense-api/.env.vps.example`
- `Mobile App/backend/stitchsense-api/package-lock.json`
- `Mobile App/backend/stitchsense-api/src/config.ts`
- `Mobile App/backend/stitchsense-api/src/routes/admin.ts`
- `Mobile App/backend/stitchsense-api/src/routes/auth.ts`
- `Mobile App/backend/stitchsense-api/src/routes/billing.ts`
- `Mobile App/backend/stitchsense-api/src/services/entitlements.ts`
- `Mobile App/backend/stitchsense-api/src/services/metrics.ts`
- `Mobile App/backend/stitchsense-api/src/services/secureCompare.ts`
- `Mobile App/backend/stitchsense-api/src/services/workflows.ts`
- `Mobile App/backend/stitchsense-api/tests/admin-entitlements.integration.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/api-hardening.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/auth-wordpress-bridge.integration.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/billing-revenuecat.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/billing-webhook-metrics.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/entitlements.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/revenuecat-webhook.integration.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/secure-compare.test.mjs`
- `Mobile App/backend/stitchsense-api/tests/workflow-metrics.test.mjs`
- `Mobile App/shared/api-contracts/stitchsense-api.v1.yaml`
- `ops/monitoring/stitchsense-alerts.yml`
- `ops/monitoring/stitchsense-dashboard.json`
- `tools/validate-production-artifacts.mjs`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/PRODUCTION_READINESS_ACTION_PLAN.md`

Verification:

- backend `npm run build`
- backend `npm test` in CI/staging with `TEST_DATABASE_URL` and object storage configured
- `node tools/validate-production-artifacts.mjs`
- CI production checks

## 3. Mobile UX, Navigation, And Launch Flow Hardening

Purpose: keep mobile UI/navigation and user-visible failure-state changes together.

Files:

- `Mobile App/stitchsense-expo/app/(tabs)/_layout.tsx`
- `Mobile App/stitchsense-expo/app/(tabs)/account.tsx`
- `Mobile App/stitchsense-expo/app/(tabs)/library.tsx`
- `Mobile App/stitchsense-expo/app/_layout.tsx`
- `Mobile App/stitchsense-expo/app/onboarding.tsx`
- `Mobile App/stitchsense-expo/app/paywall.tsx`
- `Mobile App/stitchsense-expo/app/pattern-viewer.tsx`
- `Mobile App/stitchsense-expo/app/sign-in.tsx`
- `Mobile App/stitchsense-expo/components/parallax-scroll-view.tsx`
- `Mobile App/stitchsense-expo/components/ui/icon-symbol.tsx`
- `Mobile App/stitchsense-expo/hooks/use-theme-color.ts`
- `Mobile App/stitchsense-expo/src/components/navigation/app-tab-bar.tsx`
- `Mobile App/stitchsense-expo/src/components/ui/brand-button.tsx`
- `Mobile App/stitchsense-expo/src/components/ui/motion-view.tsx`
- `Mobile App/stitchsense-expo/src/components/ui/screen-hero.tsx`
- `Mobile App/stitchsense-expo/tsconfig.json`

Verification:

- `npm run lint`
- `npm run typecheck`
- real-device smoke for onboarding, sign-in, library, pattern viewer, and tab navigation

## 4. Mobile Error, Upload, Session, And RevenueCat Logic

Purpose: keep independently tested mobile logic changes together.

Files:

- `Mobile App/stitchsense-expo/scripts/capture-app-screenshots.cjs`
- `Mobile App/stitchsense-expo/scripts/validate-release-config.mjs`
- `Mobile App/stitchsense-expo/src/lib/config.ts`
- `Mobile App/stitchsense-expo/src/lib/entitlement-access.ts`
- `Mobile App/stitchsense-expo/src/lib/errors.ts`
- `Mobile App/stitchsense-expo/src/lib/pattern-upload-flow.ts`
- `Mobile App/stitchsense-expo/src/lib/revenuecat.ts`
- `Mobile App/stitchsense-expo/src/lib/revenuecat-results.ts`
- `Mobile App/stitchsense-expo/src/lib/session-restoration.ts`
- `Mobile App/stitchsense-expo/src/providers/session-provider.tsx`
- `Mobile App/stitchsense-expo/tests/entitlement-access.test.ts`
- `Mobile App/stitchsense-expo/tests/errors.test.ts`
- `Mobile App/stitchsense-expo/tests/pattern-upload-flow.test.ts`
- `Mobile App/stitchsense-expo/tests/release-config.test.ts`
- `Mobile App/stitchsense-expo/tests/revenuecat-results.test.ts`
- `Mobile App/stitchsense-expo/tests/session-restoration.test.ts`

Verification:

- `npm run check:capture-script`
- `npm run check:release-config` with RevenueCat public SDK keys supplied
- `npm test`

## 5. Release Evidence And Store Readiness Documentation

Purpose: keep launch checklist, evidence, policy, support, and store-prep documents together.

Files:

- `docs/ACCESSIBILITY_AUDIT_CHECKLIST.md`
- `docs/BACKUP_RESTORE_EVIDENCE.md`
- `docs/BETA_FEEDBACK_TRIAGE.md`
- `docs/BRANCH_PROTECTION_SETUP.md`
- `docs/DATA_SYNC_RECONCILIATION_RUNBOOK.md`
- `docs/DEVICE_ACCEPTANCE_MATRIX.md`
- `docs/INCIDENT_POSTMORTEM_TEMPLATE.md`
- `docs/LEGAL_PUBLICATION_CHECKLIST.md`
- `docs/MIGRATION_ROLLBACK_REHEARSAL.md`
- `docs/N8N_WORKFLOW_RELEASE_CHECKLIST.md`
- `docs/OPERATIONS_REHEARSAL_LOG.md`
- `docs/PERFORMANCE_ACCEPTANCE_PLAN.md`
- `docs/POST_RELEASE_MONITORING_CHECKLIST.md`
- `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`
- `docs/REACT_COMPILER_CLEANUP_PLAN.md`
- `docs/RELEASE_CANDIDATE_EVIDENCE.md`
- `docs/RELEASE_DECISION_LOG.md`
- `docs/RELEASE_RISK_REGISTER.md`
- `docs/REVENUECAT_STORE_TEST_MATRIX.md`
- `docs/revenuecat-subscriptions-and-payouts.md`
- `docs/REVIEW_TEST_ACCOUNT_PROTOCOL.md`
- `docs/SECURITY_SIGNOFF_CHECKLIST.md`
- `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`
- `docs/STORE_REVIEW_NOTES.md`
- `docs/SUPPORT_MACRO_LIBRARY.md`
- `docs/SUPPORT_READINESS_RUNBOOK.md`

Verification:

- `node tools/validate-production-artifacts.mjs`
- release owner review of any placeholder or evidence-only table

## 6. Repository Instructions

Purpose: keep project instruction updates isolated.

Files:

- `AGENTS.md`
- `Mobile App/stitchsense-expo/AGENTS.md`

Verification:

- Confirm instructions match the current project safety rules and do not include secrets.
