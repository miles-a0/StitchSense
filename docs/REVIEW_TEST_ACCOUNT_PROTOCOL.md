# StitchSense Review And Test Account Protocol

Use this protocol for App Store, Google Play, beta, and support test accounts. Do not commit passwords, recovery codes, private pattern files, payment details, or personally identifying tester information.

## Account Inventory

| Account type | Purpose | Owner | Storage location for credentials | Evidence |
| --- | --- | --- | --- | --- |
| Store review account | Apple/Google reviewer login |  | Private password manager only |  |
| Internal beta account | Acceptance testing |  | Private password manager only |  |
| Billing sandbox user | RevenueCat/store purchase testing |  | Private password manager only |  |
| Manual entitlement test user | Developer/support/beta lifetime access validation |  | Private password manager only |  |
| Support reproduction account | Customer-support reproduction |  | Private password manager only |  |

## Data Boundaries

- Use synthetic patterns, projects, stash items, and images.
- Do not use customer data, live private pattern files, or real payment-card details.
- Keep paid Ravelry tests limited to metadata unless an owned source file is deliberately uploaded.
- Reset or delete test data after review when it is no longer needed.
- Keep review-account credentials out of screenshots, logs, docs, and chat.

## Reviewer Access

| Check | Evidence |
| --- | --- |
| Account can sign in on a fresh install |  |
| Account has the intended entitlement state for review |  |
| Reviewer notes explain subscriptions and restore purchase |  |
| Manual entitlement test user shows Pro access without a store purchase |  |
| Reviewer notes explain Stitch Vision camera/photo permissions |  |
| Reviewer notes explain Ravelry metadata-only limits |  |
| Account deletion path is visible and safe to demonstrate |  |

## Rotation And Cleanup

| Event | Required action | Evidence |
| --- | --- | --- |
| Public launch completed | Rotate or retire review password if shared externally |  |
| Store review rejection | Preserve evidence, update notes, and retry with same or rotated account |  |
| Suspected credential exposure | Rotate password immediately and invalidate sessions |  |
| Beta cohort ends | Disable or archive unused test accounts |  |

## Decision

| Field | Value |
| --- | --- |
| Review/test account decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
