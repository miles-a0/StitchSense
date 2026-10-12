# StitchSense EAS Environment Setup Checklist

Use this checklist before creating preview, internal, or production Expo builds. Do not record secret values in this file; record only environment names, owners, and verification evidence.

## Required Environments

| EAS environment | Build profile | Channel | Purpose | Evidence |
| --- | --- | --- | --- | --- |
| Development | `development` | development | Native development-client checks | Pending Expo account check |
| Preview / internal | `preview` | preview | TestFlight / Play internal acceptance | Pending EAS environment setup |
| Production | `production` | production | Store submission and public rollout | Pending EAS environment setup |

## Public App Config

These values are public in the mobile build. They still need to be correct, but they are not backend secrets.

| Variable | Preview / internal | Production | Notes |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `https://staging-stitchsense.zu-auto.co.uk` or approved acceptance API | `https://stitchsense.zu-auto.co.uk` | Must be HTTPS and must not point at localhost/private IP for store builds |
| `EXPO_PUBLIC_WORDPRESS_BASE_URL` | `https://catlowyarns.co.uk` | `https://catlowyarns.co.uk` | Must be the approved WordPress host |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | Pending EAS value | Pending EAS value | Must start with `appl_` |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | Pending EAS value | Pending EAS value | Must start with `goog_` |
| `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` | `pro` | `pro` | Must match backend/startup validation |
| `STITCHSENSE_EXPO_OWNER` | Pending Expo account value | Pending Expo account value | Optional build-time owner override; keep unset only if the committed Expo owner is already correct |
| `STITCHSENSE_EAS_PROJECT_ID` | Pending EAS project value | Pending EAS project value | Required before native EAS builds or OTA update channels; drives `extra.eas.projectId` and `updates.url` |

For development-only Test Store builds before Apple/Google stores are connected:

| Variable | Development/Test Store | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` | RevenueCat Test Store public SDK key | Use only for local/development testing; preview/internal and production-candidate store builds must leave this unset and use the platform keys above. |
| `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` | `pro` | Must match the RevenueCat entitlement and backend default. |

## Backend-Only Values

Do not put these values in EAS public config:

- Database URLs.
- Object-storage credentials.
- RevenueCat webhook authorization.
- Stripe or payment provider secrets.
- WordPress bridge shared secrets.
- n8n workflow shared secrets.
- OpenAI or AI provider keys.
- Metrics shared secrets.

## Verification

| Check | Evidence |
| --- | --- |
| `npx eas whoami` confirms the intended Expo account |  |
| `npx eas project:info` confirms the intended project |  |
| `npm run check:release-config` passes with the selected environment values | 2026-10-10: wired into `eas-build-pre-install`; currently fails locally until real `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` values are configured |
| `npm run check:mobile-artifacts` passes before build | 2026-10-06: passes locally after Stage 1 icon/config updates |
| Preview build points to staging or approved acceptance API | Pending preview build |
| Production build points to production API and WordPress hosts | Pending production EAS environment verification |
| RevenueCat keys match the app and store bundle/package identifiers | Pending RevenueCat console values |
| Build numbers are managed intentionally before store submission | 2026-10-10: `ios.buildNumber` set to `1`, `android.versionCode` set to `1`; increment deliberately for each submitted binary |
| OTA runtime compatibility is pinned | 2026-10-10: `runtimeVersion.policy` set to `appVersion`; changing native runtime requires an app version bump |

## Decision

| Field | Value |
| --- | --- |
| EAS setup decision | Hold |
| Decision owner |  |
| Decision time | 2026-10-10 |
| Follow-up issues | Add real RevenueCat public SDK keys in EAS, confirm Expo project/account, set `STITCHSENSE_EXPO_OWNER` and `STITCHSENSE_EAS_PROJECT_ID` if needed, and run `npm run check:release-config` with selected EAS values before native builds. |
