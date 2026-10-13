# StitchSense Crash Reporting Plan

Status: Sentry selected (2026-10-13), EU data region, project `stitchsense-app`. Store-native crash reports from App Store Connect and Google Play Console remain a second signal.

The app initialises Sentry in `app/_layout.tsx` through `src/lib/crash-reporting.ts`. Reports are sent from preview and store builds only; development and Expo Go are silent. Every event and breadcrumb passes through `src/lib/crash-report-scrub.ts`, which drops console breadcrumbs and touch labels, strips URL query strings (signed file links) and route params, and keeps only the internal user ID. Screenshots, view hierarchy, session replay and performance tracing are off. Sentry's project settings also have the data scrubber, default scrubbers and IP-address storage prevention enabled.

## Required Signals

| Signal | Required before launch | Notes |
| --- | --- | --- |
| Native app crash-free sessions | Yes | Must cover iOS and Android store builds |
| JavaScript fatal errors | Yes | Include app version/build/channel |
| API request IDs in user-visible support copy | Yes | Already used by API error handling |
| Release/build identifiers | Yes | Match release candidate evidence |
| Device model and OS | Yes | Avoid collecting unnecessary personal data |
| Breadcrumbs for critical flows | Preferred | Keep low-cardinality and non-content-bearing |

## Privacy Rules

- Do not capture pattern text, chat prompts, uploaded file contents, auth tokens, payment secrets, or WordPress credentials.
- Redact email addresses from crash breadcrumbs unless support explicitly needs a separately provided user identifier.
- Prefer internal user IDs and request IDs for support correlation.
- Disable session replay or screen capture unless legal/privacy approval explicitly allows it.
- Keep crash retention aligned with `docs/DATA_RETENTION_AND_DELETION_POLICY.md`.

## Candidate Providers

| Provider | Pros | Launch decision |
| --- | --- | --- |
| Store-native crash reports | No added SDK, no extra privacy declarations, available from TestFlight/App Store Connect and Google Play Console | Stage 1 fallback |
| Sentry | Strong React Native support, release tracking, source maps, alerting | Defer unless beta crash evidence requires richer diagnostics |
| Firebase Crashlytics | Strong native crash reporting, Google Play alignment | Defer unless Google Play/internal testing exposes a launch blocker |
| Expo/EAS Insights | Lightweight Expo ecosystem fit where available | Review during release-candidate build setup |

## Rollout Thresholds

| Indicator | Hold / rollback threshold | Notes |
| --- | --- | --- |
| Crash-free sessions | Below 99% during controlled rollout | Investigate before widening rollout |
| Repeated crash signature | Any P0/P1 flow crash affecting multiple testers | Hold release |
| Startup crash | Any reproducible startup crash | Roll back or halt immediately |
| Purchase-flow crash | Any reproducible purchase/restore crash | Hold store rollout |

## Implementation Checklist

| Step | Result | Evidence |
| --- | --- | --- |
| Provider selected | Sentry | 2026-10-13: Owner chose Sentry (EU region). Store-native reports kept as a second signal. |
| iOS native build configured | Pending | Verify TestFlight/App Store Connect crash reporting on the preview/release-candidate build. |
| Android native build configured | Pending | Verify Play Console internal testing crash reporting on the preview/release-candidate build. |
| Source maps uploaded or intentionally unavailable | Pending auth token | Create a Sentry organization auth token and store it as the EAS secret `SENTRY_AUTH_TOKEN` (never in the repo). Until then `SENTRY_ALLOW_FAILURE=true` in `eas.json` lets builds finish without readable stack traces. Confirm the organization slug in `app.json`. |
| Alerts route to production owner / triage channel | Pending | Store-console crash checks must be included in first-hour/first-day monitoring. |
| Test crash verified on non-production build | Pending | Use a non-public build or documented store-console crash signal before widening rollout. |
| Privacy policy/data safety updated if needed | Worksheets updated | `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` and `docs/IOS_PRIVACY_MANIFEST_REVIEW.md` list Sentry and crash data. The published privacy policy must name Sentry as a processor before launch. |
