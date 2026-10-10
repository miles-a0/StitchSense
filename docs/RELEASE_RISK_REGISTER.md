# StitchSense Release Risk Register

Use this register during release-candidate signoff, beta triage, and phased rollout. It keeps known launch risks visible without treating checklist creation as evidence that the risk has been removed.

## Risk Register

| Risk | Impact | Current control | Remaining action | Owner |
| --- | --- | --- | --- | --- |
| Cross-user data exposure | Critical privacy/security incident | Backend route tests, ownership checks, release signoff checklist | Maintain device/staging evidence for key flows |  |
| Pattern context contamination | Wrong AI answer or privacy leak between patterns | Pattern-aware backend tests and data sync checklist | Device relaunch/reinstall matrix still required |  |
| Store purchase entitlement mismatch | Paid user loses access or wrong user gains access | RevenueCat webhook tests and store test matrix | Real Apple/Google sandbox evidence still required |  |
| Failed workflow dependency | Chat, upload, library, or image features degrade | Workflow metrics, alert rules, n8n checklist | Live alert routing and staging workflow rehearsal |  |
| Bad migration or restore gap | Data loss, downtime, or slow rollback | Migration rollback rehearsal template and backup evidence template | Fresh isolated restore rehearsal before production migration |  |
| Mobile crash during rollout | Store rollout halt or poor first-user experience | Crash reporting plan and post-release monitoring checklist | Select/configure crash provider and verify test crash |  |
| Inconsistent privacy/store declarations | App review rejection or compliance issue | Privacy worksheet and iOS manifest review | Business/legal approval and final public URLs |  |
| Older local machine blocked by tooling | Slower development and support handoff | Expo Go path, CI-heavy checks, Node version documentation | Avoid adding simulator/heavy build requirements locally |  |

## Rollback Thresholds

| Signal | Threshold | Response |
| --- | --- | --- |
| API readiness | Any sustained production `/ready` failure | Roll back backend or open incident |
| API 5xx | Sustained alert rule breach | Hold rollout and inspect recent deploy |
| Crash-free sessions | Below 99% during controlled rollout | Halt rollout expansion |
| Startup crash | Any reproducible current-build startup crash | Halt or roll back staged release |
| Billing mismatch | Any confirmed wrong-user entitlement | Halt paid rollout and contain |
| Cross-user access | Any credible report | Halt rollout, preserve evidence, rotate/contain as needed |
| Pattern context leak | Any credible report | Disable affected AI workflow path and halt rollout |
| Data deletion/resurrection | Any credible report | Halt rollout and follow restore/repair plan |

## Review Cadence

- Review before each release-candidate build.
- Review after beta triage and before store submission.
- Review during first-hour and first-day rollout monitoring.
- Promote any unresolved risk to the release decision log when it can block launch.

## Decision

| Field | Value |
| --- | --- |
| Review owner |  |
| Review date |  |
| Risks accepted for release |  |
| Risks blocking release |  |
