# Mobile App Build Checklist

## Phase 0: Product Decisions

- [x] Confirm native app strategy: SwiftUI iOS first, Android Compose second.
- [x] Confirm whether Android must launch at the same time as iOS.
- [x] Confirm account model: dedicated StitchSense accounts vs WordPress-linked accounts.
- [x] Confirm storage provider.
- [x] Confirm subscription provider approach: Stripe web + RevenueCat mobile is recommended.
- [x] Confirm admin free-access policies: lifetime, 3-month beta, 6-month beta, courtesy extensions.
- [x] Confirm brand assets and app icon direction.
- [x] Confirm MVP feature list.

## Phase 1: Backend Platform

- [x] Create `stitchsense-api` service.
- [x] Add Docker Compose for API, PostgreSQL, object storage, reverse proxy.
- [x] Define production database schema.
- [x] Add auth and refresh token flow.
- [x] Add user profile/settings endpoints.
- [x] Add pattern CRUD endpoints.
- [x] Add file upload and signed URL endpoints.
- [x] Add chat session/message endpoints.
- [x] Add rewrite endpoints.
- [x] Add Stitch Vision endpoint.
- [x] Add n8n proxy integration.
- [x] Map live VPS n8n upload, library proxy, chat, and Stitch Vision webhook URLs through the API.
- [x] Add billing entitlement middleware.
- [x] Add manual entitlement overrides for lifetime and extended free access.
- [x] Add admin endpoints for granting/revoking free access.
- [x] Add audit logs for entitlement changes.
- [x] Add Stripe webhook handling.
- [x] Add export/delete data endpoints.
- [x] Add API tests.
- [x] Add VPS API deployment compose/env template for the live Postgres/n8n stack.

## Phase 2: Existing Data Migration

- [x] Audit current PostgreSQL data.
- [x] Audit WordPress fallback user-meta data.
- [x] Write migration script.
- [ ] Import existing patterns.
- [ ] Import chat history.
- [ ] Import rewrite history.
- [ ] Validate file links.
- [x] Decide whether to copy existing files to object storage.
- [x] Produce migration rollback plan.

## Phase 3: Mobile UX/UI Design

- [x] Create mobile information architecture.
- [x] Create design tokens: colours, type, spacing, buttons, cards, sheets.
- [x] Design Library screen.
- [x] Design Pattern Workspace.
- [x] Design AI Chat.
- [x] Design Rewrite flow.
- [x] Design Stitch Vision flow.
- [x] Design Account and Paywall.
- [x] Design empty/loading/error states.
- [x] Review accessibility and dynamic type.

## Phase 4: iOS SwiftUI MVP

- [x] Create Xcode project.
- [x] Add networking client.
- [x] Add secure token storage.
- [x] Add local cache.
- [x] Add auth screens.
- [x] Add Library.
- [x] Add Pattern Detail.
- [x] Add upload flow.
- [x] Add PDF/file viewer.
- [x] Add AI Chat.
- [x] Add Rewrite.
- [x] Add Stitch Vision camera/photo picker.
- [x] Add Account.
- [x] Add Paywall.
- [x] Add subscription status handling.
- [x] Add iOS RevenueCat identity wrapper.
- [ ] Add RevenueCat SPM package to the Xcode project.
- [x] Add analytics/error reporting.
- [ ] Test on small and large iPhones.

## Phase 5: Android MVP

- [x] Create Kotlin/Compose project.
- [x] Port shared API models.
- [x] Add auth.
- [x] Add Library.
- [x] Add Pattern Workspace.
- [x] Add AI Chat.
- [x] Add Rewrite.
- [x] Add Stitch Vision.
- [x] Add Account/Paywall.
- [x] Add Play Billing/RevenueCat.
- [ ] Test across common screen sizes.

## Parallel Expo Track

- [x] Create separate Expo app scaffold under `Mobile App/stitchsense-expo`.
- [x] Keep existing SwiftUI app intact while starting the Expo branch.
- [x] Configure Expo Go-friendly SDK path for direct iPhone testing.
- [x] Add Expo Router shell with StitchSense-branded tab navigation.
- [x] Add secure token storage for the Expo app.
- [x] Add shared API login flow with StitchSense-email and WordPress-username fallback.
- [x] Add live Library sync against `stitchsense-api`.
- [x] Add first Pattern Detail route shell.
- [x] Add Expo chat flow.
- [x] Add Expo rewrite flow.
- [x] Add Expo Stitch Vision flow.
- [x] Add Expo tools/gauge calculator.
- [x] Add Expo paywall/account management parity.
- [x] Surface project reading-position and bookmark summaries near the top of the project detail flow.
- [x] Validate on physical iPhone through Expo Go.

## Phase 6: Web Sync Update

- [x] Add backend WordPress account bridge endpoint.
- [x] Add opt-in WordPress platform API client/settings.
- [x] Update WordPress pattern list/save metadata routes to use shared API when enabled.
- [x] Update WordPress pattern detail/update/delete routes to use shared API when enabled.
- [x] Add WordPress read-side chat/rewrite platform sync when enabled.
- [x] Preserve current shortcode UI.
- [x] Preserve admin screens.
- [ ] Test web upload then mobile open.
- [ ] Test mobile upload then web open.
- [ ] Test chat/rewrite sync both ways.
- [x] Deploy `stitchsense-api` on the VPS and verify `https://stitchsense.zu-auto.co.uk/health`.

## Phase 6A: Pattern Isolation Hardening

- [x] Define pattern-aware vs pattern-neutral tool rules.
- [x] Require explicit `patternId` for every pattern-aware chat request.
- [x] Require explicit `patternId` for every pattern-aware rewrite request.
- [x] Enforce session-to-pattern integrity in the API.
- [x] Block metadata-only patterns from chat/rewrite with the purchase/re-import message.
- [x] Clear stale local AI state when switching patterns in Expo.
- [x] Ensure project-linked AI flows always bind to the linked pattern only.
- [x] Audit WordPress/web chat entry points for the same binding rules.
- [x] Audit WordPress/web rewrite entry points for the same binding rules.
- [x] Add structured logs for user, pattern, project, and session routing.
- [x] Add source-surface logging for web vs Expo pattern-aware routing.
- [x] Add tombstone-aware WordPress mirror re-sync so stale exports cannot revive deleted records.
- [ ] Run contamination test matrix across web/mobile/app relaunch/re-sync paths.
- [x] Prevent metadata-only patterns from generating misleading summaries.
- [ ] Validate web-master deletion/re-sync rules so stale mobile data cannot resurrect deleted web records.

## Phase 6B: Launch Hardening

- [x] Make sync diagnostics truthful and reliable for real support use.
- [ ] Validate signup, signin, onboarding, and WordPress account linking end to end.
- [ ] Validate new-user flow, returning-user flow, and reinstalled-app flow.
- [ ] Validate AI reliability for chat, rewrite, and Stitch Vision against live VPS config.
- [ ] Validate English output for non-English source patterns where translation is expected.
- [ ] Validate metadata-only Ravelry imports never fabricate answers, rewrites, or summaries.
- [ ] Run web/master parity checks for upload, delete, re-sync, and resumed session paths.
- [ ] Freeze launch-blocking defects into a short punch list and close them before beta.

Reference docs for this phase:

- [Launch-Hardening-Validation-Matrix.md](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/docs/Launch-Hardening-Validation-Matrix.md)
- [Beta-Launch-Punch-List.md](/Users/andrewmagill/DEV/StitchSense/Mobile%20App/docs/Beta-Launch-Punch-List.md)

## Phase 7: Release

- [ ] Prepare TestFlight build.
- [ ] Prepare Play internal testing build.
- [x] Create privacy policy draft.
- [ ] Review/finalise privacy policy for publication.
- [x] Create terms/subscription copy draft.
- [ ] Review/finalise terms/subscription copy for publication.
- [x] Create screenshots and store assets plan.
- [ ] Create screenshots and store assets.
- [ ] Test subscription purchase/restore/cancel.
- [ ] Run security review.
- [ ] Run beta with real pattern uploads.
- [ ] Launch.
