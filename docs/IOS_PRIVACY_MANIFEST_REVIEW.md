# StitchSense iOS Privacy Manifest Review

Use this review before creating App Store builds. It aligns `app.json`, Apple privacy labels, public privacy copy, and any native SDK behaviour.

## Manifest Inventory

| Area | Current declaration | Required review |
| --- | --- | --- |
| UserDefaults accessed API | `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` | Confirm Expo/SecureStore/router dependencies do not require additional accessed API categories |
| Camera permission | `NSCameraUsageDescription` present | Confirm wording matches Stitch Vision and selected-image usage only |
| Photo library read permission | `NSPhotoLibraryUsageDescription` present | Confirm wording matches pattern, project, stash, and Stitch Vision images |
| Photo library add permission | `NSPhotoLibraryAddUsageDescription` present | Confirm whether save-to-library behaviour ships in v1 |
| RevenueCat SDK | Native purchase and entitlement SDK | Confirm no tracking declaration is required |
| Crash reporting SDK | No dedicated SDK for Stage 1 | Store-native crash reporting is the Stage 1 fallback; add privacy declaration changes if Sentry/Firebase/another SDK is later selected |

## Store Label Alignment

| Store label area | Must match |
| --- | --- |
| Contact info | Privacy policy, data safety worksheet, account support copy |
| User content | Pattern, project, stash, image, chat, and rewrite handling |
| Purchases | RevenueCat, Apple, Google, backend entitlement records |
| Diagnostics | Backend logs, API request IDs, store-native crash reports for Stage 1 |
| Tracking | Must remain `No` unless a tracking SDK is deliberately added and approved |

## Review Steps

1. Run `node tools/validate-mobile-release-artifacts.mjs`.
2. Compare `Mobile App/stitchsense-expo/app.json` against `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`.
3. Confirm new native modules have documented privacy impact.
4. Confirm public privacy and support URLs are stable HTTPS URLs.
5. Capture approval in the release candidate evidence record.

## Decision

| Field | Value |
| --- | --- |
| Reviewer |  |
| Review date |  |
| Manifest changes required |  |
| Store label changes required |  |
| Approved for App Store build | Yes / No |
