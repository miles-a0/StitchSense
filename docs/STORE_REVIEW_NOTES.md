# StitchSense Store Review Notes

Use this as the source for App Store Connect and Google Play review notes. Do not commit real review account passwords or private store-console identifiers.

## Review Account

| Field | Value |
| --- | --- |
| Account email / username | Stored privately |
| Password location | Private secret store only |
| Entitlement state |  |
| Test data reset instructions |  |

## Reviewer Instructions

| Area | Notes |
| --- | --- |
| Login | Use the private review account. Do not use personal WordPress accounts. |
| Subscriptions | Public mobile purchases use RevenueCat with App Store / Google Play sandbox or internal testing. |
| Ravelry | Paid Ravelry imports may only include metadata until the user uploads their owned source file. |
| Stitch Vision | Camera/photo permissions are used only for selected knitting/crochet images. |
| Account deletion | In-app deletion removes StitchSense data but does not cancel App Store / Google Play subscriptions. |
| Support codes | Request IDs shown in errors are safe to send to support. |

## Sensitive-Feature Notes

| Feature | Review guidance |
| --- | --- |
| AI chat/rewrite | Pattern-specific AI must remain scoped to the selected pattern. |
| Uploads | Uploaded PDFs and images are private to the owning user. |
| Billing | Legacy web entitlements and admin-granted developer/support access may display, but mobile checkout must use native store purchases only. |
| Manual access | Developer, support, beta, and comped lifetime accounts are granted outside RevenueCat through trusted StitchSense admin tools; they are not public mobile lifetime products. |
| Data safety | Privacy/Data Safety answers are tracked in `docs/PRIVACY_DATA_SAFETY_WORKSHEET.md`. |

## Decision

| Field | Value |
| --- | --- |
| Notes ready for submission | Yes / No |
| Owner |  |
| Decision time |  |
| Follow-up issues |  |
