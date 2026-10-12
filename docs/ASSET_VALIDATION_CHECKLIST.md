# StitchSense Asset Validation Checklist

Use this before App Store Connect and Google Play submission.

## Icons And Launch Assets

| Asset | Requirement | Result | Evidence / notes |
| --- | --- | --- | --- |
| iOS app icon | 1024 x 1024, no alpha | Pass | 2026-10-06: `expo.icon` points to `assets/images/app-icon.png`; `npm run check:mobile-artifacts` verifies PNG dimensions and no alpha. |
| Android foreground icon | Adaptive icon foreground fits mask | Partial | 2026-10-06: `expo.android.adaptiveIcon.foregroundImage` points to `assets/images/android-adaptive-foreground.png`; physical/device preview still required for mask fit. |
| Android background colour/layer | Matches brand and contrast needs | Partial | 2026-10-06: adaptive icon background is `#fff7ef`; Play Console/device visual check still required. |
| Splash screen | Uses current brand asset and background | Pass | 2026-10-06: splash plugin points to `assets/images/splash-logo.png` with `#fff7ef` background; Expo config resolves successfully. |
| Favicon/web asset | Matches app icon where used | Partial | 2026-10-06: web favicon points to `assets/images/favicon.png`; final web/store visual review still required. |

## Store Screenshots

| Asset | Requirement | Result | Evidence / notes |
| --- | --- | --- | --- |
| iPhone screenshots | Current UI, no private data |  |  |
| Android phone screenshots | Current UI, no private data |  |  |
| iPad/tablet screenshots | Required if tablet support remains enabled | N/A for Stage 1 | 2026-10-06: Stage 1 is phone-only on iOS; tablet optimization is deferred. |
| Android feature graphic | Correct dimensions and brand-safe copy |  |  |
| Screenshot captions | Accurate and not overpromising AI/pattern access |  |  |

## Decision

| Field | Value |
| --- | --- |
| Asset decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
