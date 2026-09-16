# StitchSense Expo Build And Release Runbook

This runbook covers native Expo builds for RevenueCat subscriptions, internal testing, and production store submission.

Expo Go is still useful for screen-level smoke testing, but real RevenueCat/App Store/Google Play in-app purchases must be tested in a native build: an Expo development build, TestFlight build, or Google Play internal/closed testing build.

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

Set these when a build profile must point somewhere other than the defaults in `app.json`:

```bash
EXPO_PUBLIC_API_BASE_URL=https://stitchsense.zu-auto.co.uk
EXPO_PUBLIC_WORDPRESS_BASE_URL=https://catlowyarns.co.uk
```

Do not add backend-only secrets to EAS public app config. RevenueCat webhook authorization secrets, payment-provider secrets, database URLs, object-storage credentials, and OpenAI keys belong only in backend/VPS environments.

## First-time EAS setup

1. Log in to the Expo account that owns the StitchSense project.
2. From `Mobile App/stitchsense-expo`, confirm EAS can see the project:

   ```bash
   npx eas whoami
   npx eas project:info
   ```

3. Add the required EAS environment variables for the relevant environments.
4. If App Store Connect / Play Console builds already exist, initialise remote build-number management before production submission:

   ```bash
   npx eas build:version:set
   ```

5. Confirm bundle/package IDs match the store records:

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

## Production release checklist

1. Confirm backend production `/ready` is green.
2. Confirm RevenueCat offerings contain monthly and annual packages.
3. Confirm Starling Business bank details are configured in App Store Connect and Google Play Console.
4. Run lint/typecheck locally:

   ```bash
   npm run lint
   npm run typecheck
   ```

5. Create production builds:

   ```bash
   npm run build:prod:ios
   npm run build:prod:android
   ```

6. Submit through EAS Submit or upload manually to App Store Connect / Google Play Console.
7. Keep rollout staged until crash-free sessions, subscription events, and backend logs look healthy.

## Rollback notes

- Mobile binaries already installed by users cannot be instantly removed; use staged rollout controls in the stores.
- For JavaScript-only fixes, use EAS Update only after confirming the update targets the intended channel.
- For backend issues discovered during mobile rollout, use the backend rollback procedure in `docs/OPERATIONS_RUNBOOK.md`.
