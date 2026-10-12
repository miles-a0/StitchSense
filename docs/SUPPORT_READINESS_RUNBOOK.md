# StitchSense Support Readiness Runbook

Use this to prepare support before beta and public launch. Keep private account details, uploaded files, and credentials out of git.

## Support Channels

| Channel | Owner | Status | Notes |
| --- | --- | --- | --- |
| Public support email/contact form |  |  |  |
| App Store support URL |  |  |  |
| Google Play support contact |  |  |  |
| Internal incident channel |  |  |  |
| Billing/provider escalation route |  |  |  |

## Triage Playbook

| User report | First response | Engineering evidence |
| --- | --- | --- |
| Cannot sign in | Confirm email/WordPress link state; ask for support code if shown | Request ID, auth route metrics, account status |
| Pattern upload failed | Ask for file size/type and support code; do not request private pattern content | Upload route logs, storage object state, rollback result |
| Pattern chat/rewrite used wrong context | Treat as P0/P1 until disproven | Pattern IDs, request ID, workflow payload audit without content |
| Purchase not active | Ask user to restore purchase; confirm store platform | RevenueCat user ID, webhook receipt status, entitlement snapshot |
| Manual/developer access missing | Ask for support code and account email; do not direct the user to buy a store product | Admin entitlement grant, entitlement snapshot, audit event |
| Account/data deletion | Direct user to in-app deletion flow and store subscription management | Deletion audit event, retained billing/audit basis |
| Ravelry paid pattern blocked | Explain metadata-only limitation and ask user to upload owned source | Pattern metadata/source status |

## Escalation Paths

| Trigger | Escalate to | Target response |
| --- | --- | --- |
| Suspected cross-user data access | Production owner immediately | Same day containment |
| Billing entitlement mismatch | Billing/RevenueCat owner | Same business day |
| Upload/storage object missing | Backend/storage owner | Same business day |
| Store review rejection | Release owner | Same day |
| Crash spike or startup failure | Release owner and engineering | Immediate hold/rollback decision |

## Support Macros

The expanded support macro library lives in `docs/SUPPORT_MACRO_LIBRARY.md`. Keep the library aligned with current app wording, store policies, and privacy/legal copy before each beta or public rollout.

| Situation | Approved copy |
| --- | --- |
| Support code request | Please send the support code shown in the app. Do not send passwords, full pattern files, or payment card details. |
| Subscription management | App Store and Google Play subscriptions must be managed through your Apple or Google account. StitchSense can restore purchase access in the app after the store confirms it. |
| Manual access | Developer, beta, support, and comped lifetime access is assigned by StitchSense support/admin tools and is not managed through App Store or Google Play purchases. |
| Paid Ravelry metadata | StitchSense can import metadata for paid Ravelry patterns, but it cannot access paid pattern content unless you provide your owned source file. |

## Launch Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Support URL published over HTTPS |  |  |
| Privacy/terms links published |  |  |
| Test account credentials stored privately for review |  |  |
| Support owner can access operational dashboards |  |  |
| Support owner knows rollback/incident contact |  |  |
