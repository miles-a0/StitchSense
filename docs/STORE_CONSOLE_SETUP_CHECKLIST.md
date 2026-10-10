# StitchSense Store Console Setup Checklist

Use this checklist to prepare App Store Connect and Google Play Console. Keep banking, tax, account IDs, reviewer credentials, and console screenshots containing private business details out of git.

## App Store Connect

| Area | Required state | Evidence |
| --- | --- | --- |
| App record | Bundle ID `uk.co.zuauto.stitchsense`, name StitchSense |  |
| Agreements, tax, and banking | Active for paid apps / in-app purchases |  |
| Subscription group | Monthly and annual products configured |  |
| Lifetime product | Not configured for Stage 1 public mobile launch | Developer/support/beta lifetime access remains admin-granted through StitchSense WordPress/admin tools. |
| Intro/trial rules | Match RevenueCat and listing copy |  |
| Privacy policy / support / terms URLs | Stable HTTPS URLs |  |
| App privacy labels | Match `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` and `docs/IOS_PRIVACY_MANIFEST_REVIEW.md` |  |
| TestFlight | Internal acceptance build available |  |
| Phased release | Manual or phased release selected intentionally |  |

## Google Play Console

| Area | Required state | Evidence |
| --- | --- | --- |
| App record | Package `uk.co.zuauto.stitchsense`, name StitchSense |  |
| Payments profile | Active for subscriptions |  |
| Subscriptions | Monthly and annual products configured |  |
| Lifetime product | Not configured for Stage 1 public mobile launch | Developer/support/beta lifetime access remains admin-granted through StitchSense WordPress/admin tools. |
| Licence testers / internal track | Testers configured before purchase testing |  |
| Data Safety | Matches `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md` |  |
| Store listing | Copy, assets, category, contact details complete |  |
| Managed publishing / staged rollout | Selected intentionally |  |
| App signing | Play app signing state recorded privately |  |

## RevenueCat Alignment

| Check | Evidence |
| --- | --- |
| Store products imported and mapped to the `pro` entitlement |  |
| Monthly and annual packages are exposed by the launch offering |  |
| No public lifetime package is exposed by the launch offering |  |
| Manual developer/support access is tested through admin entitlement tools, not RevenueCat products |  |
| Webhook target points to the intended backend environment |  |
| Webhook authorization value is set only in RevenueCat and backend env |  |
| Sandbox/TestFlight and internal-track purchase results are recorded |  |

## Decision

| Field | Value |
| --- | --- |
| Store console decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
