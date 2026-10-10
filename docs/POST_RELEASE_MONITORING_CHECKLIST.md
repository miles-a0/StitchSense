# StitchSense Post-Release Monitoring Checklist

Use this during TestFlight, Play Internal Testing, phased store rollout, and the first public production release.

## Staged Rollout Policy

Default to a conservative staged rollout unless a store-review requirement or incident response decision requires a narrower release.

| Step | Audience | Minimum observation window | Widen only if |
| --- | --- | --- | --- |
| 1 | Internal/TestFlight and Play internal testing | 24 hours | Install, login, purchase/restore, upload, and AI smoke checks pass without P0/P1 issues. |
| 2 | 5% public rollout | 24 hours | First-hour and first-day checks are inside threshold with no unresolved launch blocker. |
| 3 | 25% public rollout | 24 hours | Crash-free sessions, backend errors, workflow failures, billing webhooks, and support contacts remain inside threshold. |
| 4 | 50% public rollout | 24 hours | No P0/P1 defect, store rejection, cross-user access, data loss, entitlement mismatch, or repeated startup crash pattern remains open. |
| 5 | 100% public rollout | Owner decision | Release decision log records continue/go with monitoring evidence linked. |

## First Hour

| Check | Threshold | Result | Notes |
| --- | --- | --- | --- |
| API `/health` and `/ready` | Stable |  |  |
| API 5xx rate | Below alert threshold |  |  |
| Auth failure spike | No unexplained spike |  |  |
| Workflow failures | No sustained `http_error`, `workflow_error`, or `exception` burst |  |  |
| Billing webhook failures | No unauthorized/configuration/exception burst |  |  |
| Crash-free sessions | At or above release threshold |  |  |
| Support contacts | No P0/P1 pattern |  |  |

## First Day

| Check | Threshold | Result | Notes |
| --- | --- | --- | --- |
| Login/session restoration | No broad issue |  |  |
| Pattern upload/indexing | No repeated rollback/failure pattern |  |  |
| Pattern chat/rewrite | No contamination reports |  |  |
| RevenueCat purchase/restore | No entitlement mismatch pattern |  |  |
| Ravelry imports | No repeated bridge failure pattern |  |  |
| Store reviews/rejections | No unresolved launch blocker |  |  |

## Hold Or Roll Back

| Trigger | Action | Owner |
| --- | --- | --- |
| Cross-user data exposure suspected | Halt rollout, contain, investigate |  |
| Data loss or deleted-record resurrection | Halt rollout, restore/repair plan |  |
| Startup crash on current store build | Halt or roll back staged rollout |  |
| Purchase grants wrong user or fails broadly | Halt paid rollout |  |
| API/service outage | Backend rollback or incident response |  |

## Decision

| Field | Value |
| --- | --- |
| Monitoring decision | Continue / Hold / Roll back |
| Decision owner |  |
| Decision time |  |
| Follow-up issues |  |
