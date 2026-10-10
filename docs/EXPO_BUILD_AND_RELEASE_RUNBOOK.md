# StitchSense Expo Build And Release Runbook

This runbook covers native Expo builds for RevenueCat subscriptions, internal testing, and production store submission.

Expo Go is still useful for screen-level smoke testing, but real RevenueCat/App Store/Google Play in-app purchases must be tested in a native build: an Expo development build, TestFlight build, or Google Play internal/closed testing build.

## Lightweight local path

The project owner develops on an older local machine, so local commands must stay practical. The repository scripts use `tools/run-with-node22.sh` to select an installed NVM Node 22 runtime when the machine-wide `node` is older. This avoids requiring a broad system upgrade while keeping Expo, TypeScript, and backend scripts on the release runtime.

Use the normal npm scripts from the relevant project directory:

```bash
npm run check:mobile-artifacts
npm run check:capture-script
npm run lint
npm run typecheck
npm test
```

For Expo Go smoke testing, use:

```bash
npm run start:go
npm run start:go:tunnel
npm run doctor
```

Keep heavy checks such as native builds, DB/object-storage integration suites, and store billing validation in CI, staging, EAS, or on physical devices.

## Build profiles

The mobile app uses `Mobile App/stitchsense-expo/eas.json`:

- `development`: internal development-client build for native SDK testing.
- `preview`: internal build for pre-release/staging acceptance.
- `production`: store build for App Store Connect and Google Play.

The project also exposes convenience scripts from `Mobile App/stitchsense-expo`:

```bash
npm run build:dev:ios
npm run build:dev:android
npm run build:preview:ios
npm run build:preview:android
npm run build:prod:ios
npm run build:prod:android
```

## Required EAS environment variables

Set these in EAS before creating RevenueCat-capable native builds:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

For local development or a temporary development build before App Store Connect and Google Play Console are connected, use the RevenueCat Test Store key as a fallback instead:

```bash
EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY=<RevenueCat Test Store public SDK key>
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

Do not use the Test Store key for preview/internal or production-candidate store builds. `npm run check:release-config` requires real iOS and Android RevenueCat public SDK keys and fails if the Test Store key is present.

Set these when a build profile must point somewhere other than the defaults in `app.json`:

```bash
EXPO_PUBLIC_API_BASE_URL=https://stitchsense.zu-auto.co.uk
EXPO_PUBLIC_WORDPRESS_BASE_URL=https://catlowyarns.co.uk
```

Do not add backend-only secrets to EAS public app config. RevenueCat webhook authorization secrets, RevenueCat REST API keys, payment-provider secrets, database URLs, object-storage credentials, and OpenAI keys belong only in backend/VPS environments.

The release-config check rejects placeholder values, local/private API hosts, and weak RevenueCat public SDK-key placeholders. Expo Go can still use local development URLs through normal development commands, but signed store builds must point at public HTTPS release hosts.

The mobile artifact check validates app identity, launch assets, native permission copy, iOS privacy manifest presence, tablet-support evidence, SDK 57 release track, and core Expo scripts without requiring a simulator or native build on the local Mac:

```bash
npm run check:mobile-artifacts
```

## First-time EAS setup

1. Log in to the Expo account that owns the StitchSense project.
2. From `Mobile App/stitchsense-expo`, confirm EAS can see the project:

   ```bash
   npx eas whoami
   npx eas project:info
   ```

3. Add the required EAS environment variables for the relevant environments.
4. Complete `docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md` without recording secret values.
5. If App Store Connect / Play Console builds already exist, initialise remote build-number management before production submission:

   ```bash
   npx eas build:version:set
   ```

6. Confirm bundle/package IDs match the store records:

   - iOS: `uk.co.zuauto.stitchsense`
   - Android: `uk.co.zuauto.stitchsense`

## RevenueCat acceptance matrix

Run this before enabling paid subscriptions publicly:

- Development build opens the paywall without missing-key errors.
- iOS sandbox or TestFlight purchase grants the `pro` entitlement.
- Android licence-tester/internal-track purchase grants the `pro` entitlement.
- Restore purchases works after reinstall/sign-out/sign-in.
- Re-import/update flows still work for imported Ravelry patterns after entitlement refresh.
- RevenueCat webhook updates the matching StitchSense backend user only.
- Expired/cancelled test subscriptions remove or downgrade entitlement as expected.

## Screenshot capture

The web screenshot helper can capture launch screenshots against a local Expo web server while reading pattern/project IDs from the intended API environment:

```bash
STITCH_CAPTURE_BASE_URL=http://127.0.0.1:8082 \
STITCH_CAPTURE_API_BASE_URL=https://stitchsense.zu-auto.co.uk \
STITCH_CAPTURE_USERNAME="review-account@example.com" \
STITCH_CAPTURE_PASSWORD="..." \
STITCH_CAPTURE_OUTPUT=./screenshots \
node scripts/capture-app-screenshots.cjs
```

Use a staging API URL for internal acceptance whenever possible. Do not capture screenshots with real customer data, private pattern contents, or visible credentials.

## Production release checklist

1. Confirm backend production `/ready` is green.
2. Confirm RevenueCat offerings contain monthly and annual packages.
3. Confirm Starling Business bank details are configured in App Store Connect and Google Play Console.
4. Start a release evidence record from `docs/RELEASE_CANDIDATE_EVIDENCE.md`.
5. Complete `docs/STORE_SUBMISSION_CHECKLIST.md`, `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`, `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`, and `docs/IOS_PRIVACY_MANIFEST_REVIEW.md`.
6. Record the tablet support decision in `docs/TABLET_SUPPORT_DECISION.md`.
7. Confirm support, support macros, review/test account, crash reporting, backup/restore, security signoff, environment config, accessibility, performance, asset, and post-release monitoring evidence is ready.
8. Run lint/typecheck locally:

   ```bash
   npm run check:mobile-artifacts
   npm run check:release-config
   npm run lint
   npm run typecheck
   ```

9. Create production builds:

   ```bash
   npm run build:prod:ios
   npm run build:prod:android
   ```

10. Submit through EAS Submit or upload manually to App Store Connect / Google Play Console.
11. Keep rollout staged until crash-free sessions, subscription events, and backend logs look healthy.

## Rollback notes

- Mobile binaries already installed by users cannot be instantly removed; use staged rollout controls in the stores.
- For JavaScript-only fixes, use EAS Update only after confirming the update targets the intended channel.
- For backend issues discovered during mobile rollout, use the backend rollback procedure in `docs/OPERATIONS_RUNBOOK.md`.
