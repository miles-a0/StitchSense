# StitchSense Pro Mobile App PDR

## 1. Product Vision

Build a dedicated StitchSense Pro mobile app for iOS and Android that feels native, calm, polished, and practical for knitters/crocheters working with patterns on a small screen. The app should complement the current WordPress/web experience, not replace it. A user should be able to upload a pattern on web, open it on mobile, continue chat or rewrite work, and see the same saved library everywhere.

The mobile app should keep the StitchSense brand warmth but move away from dense web panels into a task-first mobile experience: Library, Pattern Workspace, AI Chat, Rewrite, Stitch Vision, Gauge Tools, Account.

## 2. Recommended Technical Direction

The user requested SwiftUI. SwiftUI is the right choice for a world-class iOS app. For Android, SwiftUI cannot run natively, so there are two realistic paths:

1. **Recommended path: shared backend, native apps**
   - iOS: SwiftUI
   - Android: Kotlin + Jetpack Compose
   - Shared services: StitchSense API, PostgreSQL, object storage, n8n workflows, Stripe billing portal
   - Best user experience, best platform fit, most App Store/Play Store compliant.

2. **Faster path: cross-platform app**
   - React Native or Flutter
   - Shared UI codebase
   - Faster first release, but not SwiftUI.

Recommendation: build the platform and design system once, then start with iOS SwiftUI as the reference app. Android follows with Jetpack Compose using the same API contracts and UX model. This avoids compromising the SwiftUI requirement while keeping the two apps synced through the backend.

### iOS Compatibility Baseline

The iOS deployment baseline is **iOS 16.0** for the first mobile release. Layout, performance, camera/photo flows, file preview, and AI workflow UX should be verified on a physical iPhone 13 via Xcode as one of the core real-device test targets before release.

Note: iOS deployment target controls minimum OS version. The project should avoid relying on newer-device-only UI/performance assumptions unless intentionally revisited.

## 3. Existing Tech To Reuse

Reuse:
- n8n workflows for pattern upload analysis, chat, rewrite, image/stitch analysis.
- PostgreSQL schema concepts: `user_patterns`, `chat_sessions`, `chat_messages`, `rewrite_sessions`, `user_connections`, `user_settings`.
- Pattern file storage model: uploaded files stored once and referenced by URL/key.
- Ravelry connection/import concepts.
- WordPress web app as an existing touchpoint.

Refactor/extend:
- Current WordPress REST routes are useful, but mobile should not depend directly on WordPress cookies/nonces.
- Build a dedicated StitchSense API layer for mobile and web sync.
- Move billing entitlement checks into shared backend middleware.
- Standardise user identity across web/mobile.

Avoid:
- Duplicating user libraries inside mobile-only local storage.
- Letting the app call n8n directly from the device.
- Sending workflow secrets to mobile clients.

## 4. Core User Journeys

### 4.1 Onboarding
- Create account or sign in.
- Optional: continue with Apple/Google/email.
- Explain trial: first month full access, then subscription required.
- Ask lightweight preferences: craft type, terminology, units, skill level.
- Land in Library, not a marketing screen.

### 4.2 Pattern Library
- View all uploaded/imported patterns.
- Search by title, craft, source, tags, notes.
- Filter: Uploaded, Ravelry, Rewritten, Archived.
- Open pattern file directly.
- See chat count, rewrite count, recent activity.
- Offline cache metadata and recent pattern summaries.

### 4.3 Pattern Workspace
- Mobile-first pattern viewer.
- Sticky bottom action bar: Chat, Rewrite, Notes, Tools.
- PDF/file viewer with pinch zoom and page navigation.
- Pattern summary card collapses by default.
- Continue previous chats/rewrites from the same screen.

### 4.4 AI Chat
- Conversational UI optimised for one-handed use.
- Attach active pattern automatically.
- Skill-level and terminology toggles in a compact sheet.
- Save all chat history to shared backend.

### 4.5 Rewrite
- Dedicated guided rewrite flow:
  - Choose goal: resize, yarn substitution, construction change, terminology conversion, freeform.
  - Fill compact guided fields.
  - Generate rewrite.
  - Compare original vs rewritten in tabs.
  - Save rewritten version as a child pattern.

### 4.6 Stitch Vision
- Camera/photo upload.
- Identify stitch/mistake/technique.
- Save helpful results to user history.

### 4.7 Account & Billing
- Subscription status.
- Trial days remaining.
- Manage subscription via Stripe Customer Portal.
- Export/delete user data.
- Ravelry connection.

## 5. Mobile Information Architecture

Primary navigation:
- Library
- Workspace
- Camera
- Tools
- Account

Recommended pattern:
- iOS: SwiftUI `TabView` with nested `NavigationStack`.
- Android: Compose bottom navigation with navigation graph.

Key screens:
- `LibraryScreen`
- `PatternDetailScreen`
- `PatternViewerScreen`
- `PatternChatScreen`
- `RewriteHomeScreen`
- `RewriteResultScreen`
- `StitchVisionScreen`
- `GaugeToolsScreen`
- `AccountScreen`
- `PaywallScreen`

## 6. UX Redesign Principles

- Keep brand warmth, but simplify density.
- Replace web tabs with bottom navigation and contextual sheets.
- Make the Library the app home.
- Use large tap targets and clear hierarchy.
- Use collapsible sections for long AI summaries.
- Keep pattern viewing and AI actions close together.
- Treat “upload pattern” as a primary mobile action.
- Avoid large text-heavy panels on first load.

Visual direction:
- Background: warm off-white.
- Primary: muted brown/terracotta.
- Secondary: soft grey/brown controls.
- Radius: restrained 8-16px depending on component scale.
- Typography: accessible, native dynamic type support.
- Motion: subtle sheet transitions, progress states, upload status.

## 7. Sync & Data Strategy

Single source of truth should be the shared backend database, not the device.

Mobile stores:
- Auth token securely in Keychain/EncryptedSharedPreferences.
- Recent metadata cache in local SQLite.
- Recently opened pattern files in protected local storage.
- Pending offline actions in an outbox queue.

Backend owns:
- Users
- Entitlements/subscription status
- Admin-granted free access overrides
- Pattern records
- Pattern file metadata
- Chat sessions/messages
- Rewrite sessions
- Ravelry connections
- User settings

Sync model:
- API returns `updated_at` timestamps.
- Mobile asks for changes since last sync.
- Mobile posts local pending changes when online.
- Conflict rule: newest `updated_at` wins for simple fields; append-only for chats/rewrites.

## 8. Paywall Proposal

### Recommended Pricing

Free Trial:
- 30 days full access.
- No feature restrictions during trial.
- Trial requires account.

StitchSense Pro Monthly:
- £10/month.
- Unlimited saved patterns.
- AI chat and rewrite access.
- Stitch Vision.
- Ravelry import.
- Sync across web/mobile.

StitchSense Pro Annual:
- £96/year.
- Equivalent to £8/month.
- Good for retention and App Store positioning.

Optional future tier:
- StitchSense Studio, £19/month.
- Higher AI usage limits, larger uploads, batch pattern import, priority processing.

### Billing Implementation

Use Stripe as the billing source of truth for web and backend, but handle mobile app store rules carefully:

- For iOS digital features, Apple may require In-App Purchase for subscriptions sold inside the iOS app.
- For Android, Google Play Billing may be required for subscriptions sold inside the Android app.
- Stripe can still power web checkout and backend entitlements.

Recommended entitlement architecture:
- `subscriptions` table in shared backend.
- `manual_entitlements` table in shared backend for admin/beta/friend access.
- Store provider: `stripe`, `apple`, `google`.
- Backend exposes `/me/entitlements`.
- Mobile never decides access alone.
- Web can use Stripe checkout/customer portal.
- Mobile can use RevenueCat or native StoreKit/Play Billing to simplify app-store subscriptions.

### Admin Free Access Overrides

Admins should be able to grant individual users free access without creating fake Stripe subscriptions. This should be handled as a first-class entitlement override in the backend.

Grant types:
- **Lifetime Pro**: free full access until manually revoked.
- **Extended Trial**: free full access until a chosen date, such as 3 months or 6 months for beta testers.
- **Temporary Courtesy Access**: short manual extension for support/customer goodwill.

Required admin fields:
- User
- Grant type
- Start date
- Optional expiry date
- Reason/note
- Granted by admin user
- Revoked date/revoked by, if removed

Entitlement priority:
1. Active admin lifetime/manual grant.
2. Active paid subscription.
3. Active extended/admin trial.
4. Standard 30-day trial.
5. Expired/no access, show paywall.

The API should return the access source in `/me/entitlements`, for example `manual_lifetime`, `manual_trial`, `stripe`, `apple`, `google`, or `standard_trial`. The mobile app can show friendly copy, but the backend remains the final authority.

Recommendation:
- Phase 1 web billing with Stripe.
- Phase 2 mobile subscription via RevenueCat linked to backend entitlements.
- Keep £10/month consistent across platforms, allowing app store price tiers where needed.

## 9. API Requirements

Create a dedicated StitchSense API service that can be used by:
- WordPress plugin
- iOS app
- Android app
- Admin tooling

Suggested stack:
- Node.js/Fastify or Python/FastAPI
- PostgreSQL
- S3-compatible object storage, ideally MinIO or Cloudflare R2
- Redis queue/cache if needed later
- Docker Compose on VPS

Core endpoints:
- `POST /auth/login`
- `POST /auth/register`
- `GET /me`
- `GET /me/entitlements`
- `GET /patterns`
- `POST /patterns`
- `GET /patterns/:id`
- `PUT /patterns/:id`
- `DELETE /patterns/:id`
- `POST /patterns/:id/file`
- `GET /patterns/:id/chats`
- `POST /chats`
- `GET /chats/:id/messages`
- `POST /chats/:id/messages`
- `POST /rewrites`
- `GET /patterns/:id/rewrites`
- `POST /vision/analyse`
- `POST /workflows/upload`
- `POST /workflows/chat`
- `POST /billing/checkout`
- `POST /billing/webhook`
- `GET /admin/entitlements`
- `POST /admin/entitlements`
- `DELETE /admin/entitlements/:id`
- `GET /sync?since=timestamp`

## 10. Infrastructure Plan

On the VPS with Docker:
- `stitchsense-api`
- `postgres`
- `minio` or external S3-compatible storage
- `n8n`
- `nginx` or Traefik reverse proxy
- `redis` optional
- backup container/job

Important:
- Move away from WordPress user-meta fallback for production mobile sync.
- Migrate existing fallback user-meta library data into PostgreSQL.
- Keep WordPress plugin working by making it call the same API over time.

## 11. Security & Privacy

- OAuth/JWT access tokens with refresh token rotation.
- Store mobile tokens securely.
- Signed URLs for private pattern files.
- No public raw file URLs for paid/private user files long-term.
- Never expose n8n workflow secrets to clients.
- Rate-limit AI workflow endpoints.
- Subscription entitlement checks before expensive AI calls.
- GDPR-style export/delete from shared backend.
- Audit logs for file access and billing changes.

## 12. Development Phases

### Phase 0: Discovery & Decisions
- Confirm native iOS + native Android vs cross-platform.
- Confirm account provider.
- Confirm storage provider.
- Confirm Stripe/RevenueCat billing path.
- Confirm whether WordPress remains primary web app or becomes client of new API.

### Phase 1: Shared Backend Foundation
- Create Docker API service.
- Design production PostgreSQL schema.
- Implement auth.
- Implement pattern library API.
- Implement file upload/storage.
- Implement n8n proxy API.
- Implement entitlements.
- Implement admin-granted lifetime and extended free access.

### Phase 2: Web Sync Stabilisation
- Migrate existing plugin data into PostgreSQL.
- Update WordPress plugin to use shared API where practical.
- Preserve current front-end behaviour.
- Verify web/mobile data contract.

### Phase 3: Mobile Design System & Prototype
- Create SwiftUI app shell.
- Build Library, Pattern Detail, Account, Paywall prototype.
- Build navigation and theme.
- Validate on small iPhone and large iPhone.
- Validate on physical iPhone 13 via Xcode, with iOS 16.0 retained as the deployment baseline.

### Phase 4: iOS MVP
- Auth.
- Library sync.
- Pattern upload.
- Pattern viewer.
- Chat.
- Rewrite.
- Stitch Vision.
- Subscription status.
- Basic offline cache.

### Phase 5: Android MVP
- Match API and UX.
- Use Kotlin + Jetpack Compose.
- Implement Play Billing/RevenueCat.

### Phase 6: Beta & Launch
- TestFlight.
- Play internal testing.
- Error reporting.
- Analytics.
- App Store assets.
- Privacy policy and subscription terms.

## 13. MVP Scope

Must have:
- Account login/register.
- Subscription/trial entitlement.
- Pattern library sync.
- Pattern upload and saved file access.
- AI pattern chat.
- AI rewrite.
- Stitch Vision photo analysis.
- Shared chat/rewrite history with web.
- Account/settings screen.

Should have:
- Ravelry connection/import.
- Offline metadata cache.
- Recent pattern file cache.
- Export/delete data.

Later:
- Apple Watch row counter.
- Push notifications for long workflow completion.
- Shared pattern folders/tags.
- Designer/studio tier.
- Community pattern recommendations.

## 14. Open Decisions

- Native Android with Jetpack Compose, or a cross-platform framework instead?
- Continue WordPress user accounts, or introduce dedicated StitchSense accounts?
- Storage provider: existing WordPress uploads, MinIO, Cloudflare R2, or S3?
- Subscription in mobile: RevenueCat plus Stripe web, or custom StoreKit/Play Billing integration?
- How much offline functionality is required for pattern viewing?
- Should web users be migrated automatically to the new backend account system?
