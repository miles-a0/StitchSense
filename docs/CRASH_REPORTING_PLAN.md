# StitchSense Crash Reporting Plan

Status: Stage 1 fallback selected. StitchSense will use store-native crash reporting from TestFlight/App Store Connect and Google Play Console plus structured tester/support reports for the first controlled release. A dedicated crash SDK such as Sentry or Firebase Crashlytics remains a post-Stage-1 improvement unless beta evidence promotes it to a blocker.

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
| Provider selected | Stage 1 fallback selected | 2026-10-06: Store-native crash reporting and tester/support reports selected for first controlled release. |
| iOS native build configured | Pending | Verify TestFlight/App Store Connect crash reporting on the preview/release-candidate build. |
| Android native build configured | Pending | Verify Play Console internal testing crash reporting on the preview/release-candidate build. |
| Source maps uploaded or intentionally unavailable | Intentionally unavailable for Stage 1 fallback | Revisit when choosing Sentry/Firebase/Expo Insights. |
| Alerts route to production owner / triage channel | Pending | Store-console crash checks must be included in first-hour/first-day monitoring. |
| Test crash verified on non-production build | Pending | Use a non-public build or documented store-console crash signal before widening rollout. |
| Privacy policy/data safety updated if needed | No SDK change for Stage 1 fallback | Dedicated crash SDK would require a fresh privacy/data-safety review. |
