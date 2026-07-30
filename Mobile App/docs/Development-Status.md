# Development Status

## Current Build State

Started the platform build under `Mobile App` while leaving the existing WordPress plugin unchanged.

Completed foundations:
- Shared API contract: `shared/api-contracts/stitchsense-api.v1.yaml`
- Shared brand tokens: `shared/design-tokens/stitchsense.tokens.json`
- Brand asset direction documented from the web version, with the web logo now available in the iOS asset catalog and used on the auth screen
- Mobile UX spec: `docs/Mobile-UX-Spec.md`
- Backend API scaffold: `backend/stitchsense-api`
- Docker Compose scaffold with API, PostgreSQL, and MinIO: `backend/docker-compose.yml`
- Production-oriented PostgreSQL schema: `backend/stitchsense-api/migrations/001_platform_schema.sql`
- Entitlement resolution with manual lifetime/extended access priority
- Rotating refresh-token auth foundation
- S3-compatible object storage upload and signed pattern file URLs
- Admin endpoints for manual entitlement grant/revoke
- User data export/delete endpoints
- Stripe checkout session creation and verified webhook subscription updates
- RevenueCat mobile purchase plumbing: Android SDK configuration, StitchSense user identity, and backend webhook sync into `subscriptions`
- WordPress bridge auth endpoint for linking verified WP users to StitchSense users and issuing shared API tokens
- Mobile-facing WordPress credential bridge login flow: iOS can now exchange a real WordPress email/password for shared API tokens via `/auth/wordpress-login`
- WordPress plugin opt-in platform API client and admin settings
- WordPress REST bridge route `/wp-json/stitchsense/v1/platform-login` for server-side credential verification using the shared bridge secret
- WordPress admin export route `/wp-json/stitchsense/v1/admin/export-user-data` for producing per-user migration payloads covering patterns, chats, messages, rewrites, and settings
- WordPress pattern list/save metadata routes can call the shared API when the platform toggle is enabled
- WordPress pattern detail/update/delete routes can call the shared API when the platform toggle is enabled
- WordPress chat session/message and rewrite history read routes can read from the shared API when enabled
- WordPress chat message append and rewrite save routes can now write through to the shared API when platform sync is enabled
- WordPress single-message chat appends now also write through to the shared API instead of only the bulk import path
- WordPress saved pattern files can now optionally mirror into the shared platform file endpoint when the plugin already knows the platform pattern id
- Backend `/events` endpoint for mobile analytics/error reporting
- Demo simulator seed account script: `npm run seed:demo`
- WordPress fallback export importer with dry-run validation fixture
- WordPress export audit CLI for counting records, spotting broken relationships, and flagging duplicate `project_id` values before import
- Platform data audit CLI for counting shared users/patterns/chats/rewrites and surfacing orphaned or duplicate records
- Pattern file validation CLI for checking imported `file_url` links and signed object-storage URLs
- Data migration runbook with rollback SQL
- Data migration audit guide: `docs/Data-Migration-Audit-Guide.md`
- Web/mobile sync test plan: `docs/Web-Mobile-Sync-Test-Plan.md`
- Release draft docs: privacy policy, terms/subscription copy, store listing/screenshot plan, and security review checklist
- Brand/app icon direction doc: `docs/Brand-Assets-and-App-Icon-Direction.md`
- n8n workflow calls kept server-side behind the API
- iOS SwiftUI source shell with auth, library, pattern detail, workspace, chat, rewrite, vision, tools, account/paywall status
- iOS Xcode project generated via XcodeGen: `ios/StitchSensePro.xcodeproj`
- iOS secure access/refresh token storage and local Library metadata cache
- iOS pattern upload, signed file preview, AI chat, rewrite, and Stitch Vision API integrations
- iOS auth screen now surfaces network/API sign-in errors instead of failing silently.
- iOS RevenueCat identity wrapper and build settings placeholders added; SPM package add is documented in `docs/iOS-RevenueCat-Setup.md`
- iOS first-party analytics/error reporting client
- iOS API base URL is now build-setting driven and points at the HTTPS VPS API URL: `https://stitchsense.zu-auto.co.uk`
- iOS account area now includes entitlement visibility, preference sync, data export, synced-data delete, and Stripe checkout launch hooks
- iOS workspace now highlights the most recent pattern and surfaces recent pattern shortcuts
- iOS workspace now lets the user focus a recent pattern and loads its live chat/rewrite activity summary from the API
- iOS workspace now includes a saved-history surface for recent chats and rewrites across the synced account, with direct return paths back into the relevant pattern flows
- iOS pattern chat now reloads the latest saved conversation per pattern
- iOS rewrite flow now reloads recent saved rewrites per pattern and lets users reopen them quickly
- iOS account surface now uses adaptive grids for entitlement pills and upgrade actions to behave better on narrower and wider phones
- iOS Stitch Vision now has a fuller branded tool surface with clearer in-progress analysis state
- iOS screen preview fixtures now seed realistic brand/session/library data for Auth, Library, Pattern Detail, and Account views across small and large iPhone preview sizes
- iOS account diagnostics now surface shared WordPress sync status, linked site/user details, last sync time, and synced record counts from the platform API
- Backend `/sync/wordpress/status` endpoint now exposes bridge configuration/link state and synced pattern/chat/rewrite totals for validation
- VPS API deployment compose/env templates and runbook: `backend/docker-compose.vps.yml`, `backend/stitchsense-api/.env.vps.example`, `docs/VPS-API-Deployment.md`
- VPS n8n upload, library proxy, chat, and Stitch Vision image webhook URLs are mapped through the backend API.
- VPS Postgres connection is configured for `173.249.40.161:2303` using the existing `stitchsense_user` role and dedicated `stitchsense_mobile` database.
- VPS API host port is configured/documented as `173.249.40.161:4445`, with the iOS app using the HTTPS NPM route `https://stitchsense.zu-auto.co.uk`.
- VPS port `4444` is already occupied by the existing `stitchmate-api` service, which does not expose `POST /auth/login`.
- VPS `stitchsense-api` is now deployed and healthy at `https://stitchsense.zu-auto.co.uk/health`, with demo login and entitlement/pattern fetch verified against the live service.
- Android Kotlin/Compose source shell with main mobile navigation, API models, token store, auth screen, Library loading, Workspace chat/rewrite, Stitch Vision API call, and Account/paywall status
- Separate Expo / Expo Go app scaffold under `Mobile App/stitchsense-expo`
- Expo SDK 54-compatible project path selected for Expo Go testing on physical iPhone based on current Expo guidance
- Expo Router app shell with branded five-tab navigation: Library, Workspace, Camera, Tools, Account
- Expo secure token storage via `expo-secure-store`
- Expo auth flow now supports StitchSense email login plus WordPress username/password fallback through the shared API
- Expo Library tab now loads live synced patterns from `https://stitchsense.zu-auto.co.uk`
- Expo Pattern Detail route shell now opens real synced pattern records from the Library tab
- Expo Pattern Detail now loads live recent chats and rewrites per pattern, supports signed file retrieval/open, and supports archive/delete actions against the shared API
- Expo Pattern Chat now loads the latest chat session per pattern, shows saved messages, creates missing sessions, and sends replies through the shared API
- Expo Pattern Rewrite now loads prior rewrites per pattern, offers guided rewrite goals, submits fresh rewrites, and reopens previous results
- Expo Workspace now deep-links directly into a recent pattern's workspace, chat, and rewrite flows
- Expo Tools tab now has a real helper-card landing surface and a working native Gauge Calculator route with simple/advanced modes, stitch/block calculations, tolerances, and reset behavior
- Expo Stitch Dictionary now ships with the same extracted stitch reference data as the web app, including search, category filtering, sort controls, and mobile-friendly reference cards
- Expo Stitch Vision now supports choosing or taking a photo in Expo Go, previews the image, submits it to `/vision/analyse`, and renders loading/error/result states from the shared API
- Expo Account now supports preference loading/saving, sync diagnostics, entitlement refresh, Stripe checkout launching, export summary loading, and synced-data deletion actions against the shared API
- Expo Library now supports search, source/craft/archive filters, sort controls, and explicit WordPress re-sync with visible sync status feedback
- Expo Ravelry screen now supports connection status, connect/reconnect launch, username save, saved-library loading, live search with filters, result preview, import, and open-on-Ravelry actions through the shared API
- Shared API now proxies WordPress Ravelry bridge routes so Expo can use Ravelry features without talking directly to WordPress
- WordPress plugin now exposes bridge-safe Ravelry endpoints keyed by the existing platform bridge secret and linked WordPress user id
- Expo Pattern Detail now surfaces imported Ravelry metadata and can refresh an imported Ravelry pattern back through the shared bridge
- Expo Pattern Detail can now refresh the AI pattern summary through the shared API, which calls the existing pattern-summary workflow and saves the updated summary back to the platform record
- Expo Pattern Viewer route now opens private synced pattern files inside the app with a WebView-backed viewer on supported Expo surfaces and a system-viewer fallback for device limitations
- Expo Pattern Chat now shows staged assistant-response progress while the shared API request is in flight, then replaces it with the saved assistant reply
- Expo Gauge Calculator can now autofill target gauge, craft, yarn, and tool-size clues from uploaded/imported pattern metadata or summaries, including a Pattern Detail shortcut into gauge checking
- Expo README updated with direct run instructions for Expo Go
- Expo web-parity plan and working checklist added: `docs/Expo-Web-Parity-Build-Plan.md` and `docs/Expo-Web-Parity-Checklist.md`

## Validation Run

Backend:
- `npm install` completed.
- `npm run build` passed.
- `npm test` passed.
- Backend WordPress login bridge build/test validation passed after adding `/auth/wordpress-login`.
- Local dependency install warns that Fastify/AWS SDK packages expect Node 20+, while this machine currently has Node 19. The Docker target uses Node 22, which matches the selected stack.

iOS:
- Swift source typechecked successfully against iPhone Simulator SDK 16.2.
- Swift typecheck command uses `/private/tmp/stitchsense-swift-module-cache` because the sandbox cannot write the default module cache under the user home directory.
- Xcode project generation succeeds with XcodeGen 1.9.0.
- Xcode project is forced to iOS-only build settings with `SUPPORTED_PLATFORMS = iphoneos iphonesimulator`, `PRODUCT_MODULE_NAME = StitchSensePro`, and `ALWAYS_SEARCH_USER_PATHS = NO`.
- The Xcode project now carries both `STITCHSENSE_API_BASE_URL` and `STITCHSENSE_WORDPRESS_BASE_URL` as build settings for simulator/device builds.
- `xcodebuild` reaches app compilation and app bundle generation with a project-local derived-data path; simulator-service instability on this Mac still interrupts unattended CLI completion before a clean `BUILD SUCCEEDED` banner.
- XcodeGen 1.9.0 rejects generated Swift Package dependency declarations, so RevenueCat SPM package installation is documented as a manual Xcode step for now.

Android:
- Gradle validation was not run because no `gradle` command or wrapper is available locally yet.
- Standalone Kotlin validation was not run because no `kotlinc` command is available locally.
- RevenueCat SDK dependencies are declared, but Android billing needs a Gradle-backed build and real Play internal testing before it can be considered store-verified.

Expo:
- `npm install` completed for `Mobile App/stitchsense-expo`.
- `npx tsc --noEmit` completed without reported TypeScript errors.
- `npm run lint` completed without reported lint errors.
- `npx tsc --noEmit` and `npm run lint` passed again after adding Pattern Detail summary refresh and tightening route/style/icon TypeScript issues.
- `npx tsc --noEmit` and `npm run lint` passed after adding the Expo Pattern Viewer route and `react-native-webview`.
- WordPress web Projects parity is implemented locally: `/wp-json/stitchsense/v1/projects` proxies to the shared platform API, the web app has a first-class Projects tab, and project cards support list/search/status filter, create-from-library-pattern, inline update, delete, and sync validation.
- `npx tsc --noEmit` and `npm run lint` passed after adding staged Pattern Chat response progress.
- `npx tsc --noEmit` and `npm run lint` passed after adding uploaded-pattern gauge autofill.
- Expo Go compatibility was intentionally scaffolded on SDK 54 rather than SDK 56 because Expo’s current docs note SDK 54 as the safer path for physical-device Expo Go during the SDK 56 transition.

Security/cost-control notes:
- Mobile clients call StitchSense API, not n8n directly.
- AI workflow routes check entitlements before calling n8n.
- Manual admin access grants are modelled separately from paid subscriptions.
- WordPress shared API sync is disabled by default and requires the platform base URL plus bridge secret before it can affect existing WordPress behaviour.
- The live VPS API is reachable and authenticates the seeded demo account; remaining risk is around completeness of migrated production data rather than basic connectivity.
- Real WordPress-account login now depends on the WordPress plugin bridge secret matching `WORDPRESS_BRIDGE_SHARED_SECRET` in the live API container and on the live site running the updated plugin code with `/platform-login` available.

## Known Open Work

- Add Gradle wrapper for reproducible Android builds.
- Install PHP CLI locally or validate PHP syntax inside the WordPress/container environment.
- Run WordPress/API integration tests for web upload then mobile open, mobile upload then web open, and chat/rewrite sync both ways.
- Run live web/mobile Projects sync validation for create, update, delete, and linked-pattern preservation.
- Audit and migrate production web data into `stitchsense_mobile` so the mobile app reflects real users, patterns, chats, and rewrites instead of only seeded/demo records.
- Run per-user WordPress exports through the importer and validate imported pattern/chat/rewrite coverage for real accounts.
- Validate Expo Go behavior on the user’s physical iPhone and tighten the Expo shell for device-first iteration.
- Finalise release legal/store copy after business and legal review.
