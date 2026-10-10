# StitchSense Security Signoff Checklist

Use this before a production release candidate is approved.

## Backend And Data

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Auth routes rate-limited |  |  |
| WordPress bridge host and shared-secret checks verified |  |  |
| Production startup rejects unsafe defaults |  |  |
| Cross-user route tests passed in CI |  |  |
| Signed file/photo access is owner-scoped |  |  |
| Entitlement-gated routes deny unpaid access |  |  |
| Pattern chat/rewrite context scoped to selected pattern |  |  |
| Password hashes use explicit bcrypt cost | Partial | 2026-10-10: API registration/password reset and demo seeding now use `gen_salt('bf', 10)`. Successful login upgrades older lower-cost hashes to cost 10. Verified with `tests/auth-lifecycle.integration.test.mjs`; cost 12 still needs production-like latency benchmarking before adopting. |
| Metadata-only paid Ravelry content remains blocked |  |  |
| Deletion/export flows preserve ownership |  |  |

## Mobile And Release

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Store builds use native RevenueCat purchase flow only |  |  |
| Release config uses public HTTPS hosts |  |  |
| No backend secrets in EAS public config |  |  |
| Secret scan passed |  |  |
| Privacy/Data Safety worksheet reviewed |  |  |
| Support and incident paths ready |  |  |

## Decision

| Field | Value |
| --- | --- |
| Security decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
