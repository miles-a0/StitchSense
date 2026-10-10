# StitchSense Store Submission Checklist

Use this checklist for App Store Connect, Google Play Console, and RevenueCat launch preparation. Keep console screenshots and account-specific identifiers outside git when they expose private business or account details.

## App Identity

| Item | iOS | Android | Evidence / notes |
| --- | --- | --- | --- |
| Bundle/package identifier is `uk.co.zuauto.stitchsense` |  |  |  |
| App name is StitchSense |  |  |  |
| App version and build number match release evidence |  |  |  |
| Support URL is live over HTTPS |  |  |  |
| Privacy policy URL is live over HTTPS |  |  |  |
| Terms/subscription terms URL is live over HTTPS |  |  |  |
| Review test account is configured and documented privately |  |  |  |

## Store Assets

| Asset | iOS | Android | Evidence / notes |
| --- | --- | --- | --- |
| 1024 x 1024 icon has no alpha channel | Pass | N/A | 2026-10-06: `assets/images/app-icon.png` is configured as `expo.icon`; `npm run check:mobile-artifacts` validates 1024 x 1024 PNG without alpha. |
| Android adaptive icon foreground/background approved |  |  |  |
| Splash/launch assets match the app |  |  |  |
| Phone screenshots cover current launch UI |  |  |  |
| Tablet screenshots complete if tablet support remains enabled | N/A for Stage 1 | N/A for Stage 1 | 2026-10-06: Stage 1 is phone-only on iOS; tablet optimization is deferred in `docs/TABLET_SUPPORT_DECISION.md`. |
| Android feature graphic complete |  |  |  |
| Screenshots do not expose personal data, private patterns, or secrets |  |  |  |

## Listing Copy

| Item | Status | Evidence / notes |
| --- | --- | --- |
| Short description / subtitle |  |  |
| Full description |  |  |
| Keywords / tags |  |  |
| Category |  |  |
| Age/content rating |  |  |
| Review notes explain login, subscriptions, Ravelry metadata limits, and Stitch Vision permissions |  |  |
| Support contact routes to a monitored mailbox or helpdesk |  |  |

Detailed review-note wording is tracked in `docs/STORE_REVIEW_NOTES.md`.
Review/test account handling is tracked in `docs/REVIEW_TEST_ACCOUNT_PROTOCOL.md`.

## Subscriptions

| Item | iOS | Android | RevenueCat | Evidence / notes |
| --- | --- | --- | --- | --- |
| Monthly product configured |  |  |  |  |
| Annual product configured |  |  |  |  |
| Lifetime product intentionally omitted for public mobile launch | N/A | N/A | N/A | Developer/support/beta lifetime access is admin-granted through StitchSense WordPress/admin entitlement tools; public mobile checkout remains monthly and annual only. |
| Trial/introductory offer rules approved |  |  |  |  |
| Offering exposes monthly and annual packages |  |  |  |  |
| `pro` entitlement maps to both store products |  |  |  |  |
| Manual developer/support access does not override store setup | N/A | N/A |  | Active admin grants should appear as Pro access in the app, while cancelled/refunded/expired store states must not remove active manual lifetime access. |
| Webhook URL and authorization configured |  |  |  |  |
| Banking, tax, and agreements ready |  |  |  |  |

## Release Controls

| Item | iOS | Android | Evidence / notes |
| --- | --- | --- | --- |
| TestFlight/internal testing acceptance pass completed |  |  |  |
| Phased/staged rollout selected | Pending console setup | Pending console setup | Default internal, 5%, 25%, 50%, and 100% rollout policy is defined in `docs/POST_RELEASE_MONITORING_CHECKLIST.md`; final console selection remains release-candidate work. |
| Rollback/hold criteria copied from release evidence | Policy prepared | Policy prepared | Hold/rollback triggers are defined in `docs/POST_RELEASE_MONITORING_CHECKLIST.md` and should be copied into candidate evidence before rollout widens. |
| Monitoring dashboard and alert routing ready |  |  |  |

Store asset details are tracked in `docs/ASSET_VALIDATION_CHECKLIST.md`.
Console-level App Store Connect, Google Play Console, and RevenueCat setup evidence is tracked in `docs/STORE_CONSOLE_SETUP_CHECKLIST.md`.

## Decision

| Field | Value |
| --- | --- |
| Submission decision | Hold / Submit |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
