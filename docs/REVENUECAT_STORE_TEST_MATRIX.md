# StitchSense RevenueCat Store Test Matrix

Use this for real iOS sandbox/TestFlight and Google licence-tester/internal-track validation. Keep store-console screenshots and tester account details outside git.

## Test Store Smoke

RevenueCat Test Store confirms that the app wiring, offering lookup, purchase callbacks, restore path, and local entitlement display are functioning during development. This does not replace App Store Connect sandbox, TestFlight, Google Play licence-tester, or internal-track evidence.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| RevenueCat Test Store key configured locally | Pass | 2026-10-08: `.env.local` exists, is git-ignored, and the app can load the Test Store public SDK key without recording the key in git. |
| `pro` entitlement and default offering expose monthly and annual Test Store packages | Pass | 2026-10-08: RevenueCat dashboard showed entitlement `pro`, offering `default`, and Monthly/Yearly packages attached. |
| Monthly Test Store purchase grants visible Pro access | Pass | 2026-10-08: iPhone Expo session showed RevenueCat Test Store purchase flow for the monthly package and refreshed paid access in the app. |
| Annual Test Store purchase grants visible Pro access | Pass | 2026-10-08: iPhone Expo session showed active annual Pro access after the annual Test Store purchase; the app now formats this as `Pro Annual`. |
| Restore purchase returns active store entitlement | Pass | 2026-10-08: restore flow returned active Test Store entitlement and synced the StitchSense access display. |
| Test Store management copy does not open fake store settings | Pass | 2026-10-08: app shows Test Store-specific management copy; real App Store/Google Play subscription management remains pending. |

## Configuration

| Item | iOS | Android | RevenueCat | Evidence / notes |
| --- | --- | --- | --- | --- |
| Monthly product configured |  |  |  |  |
| Annual product configured |  |  |  |  |
| Lifetime product intentionally omitted | N/A | N/A | N/A | Manual developer/support/beta lifetime access is admin-granted outside RevenueCat. |
| Trial / introductory offer configured |  |  |  |  |
| `pro` entitlement attached |  |  |  |  |
| Public SDK key configured in EAS |  |  |  |  |
| Webhook authorization configured |  |  |  |  |

## Purchase And Restore

| Scenario | iOS result | Android result | Evidence / notes |
| --- | --- | --- | --- |
| Monthly purchase grants `pro` |  |  |  |
| Annual purchase grants `pro` |  |  |  |
| Restore after reinstall |  |  |  |
| Restore after sign-out/sign-in |  |  |  |
| Cancelled purchase gives stable copy |  |  |  |
| Pending purchase gives stable copy |  |  |  |
| Expired subscription downgrades access |  |  |  |
| Billing issue/grace period state is understandable |  |  |  |
| Refund/revocation removes or downgrades access |  |  |  |
| One user cannot receive another user's entitlement |  |  |  |
| Manual lifetime access survives expired/cancelled store state |  |  |  |

## Decision

| Field | Value |
| --- | --- |
| Store billing decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
