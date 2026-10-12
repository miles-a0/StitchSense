# StitchSense Beta Feedback Triage

Use this during internal acceptance, TestFlight, Play Internal Testing, and any controlled beta. Do not paste customer content, private pattern text, uploaded files, credentials, or store-console secrets into this file.

## Intake

| Field | Value |
| --- | --- |
| Report date |  |
| Reporter / cohort |  |
| Platform and build |  |
| API environment |  |
| Device and OS |  |
| Flow affected |  |
| Support code / request ID |  |
| Evidence location |  |

## Severity Definitions

| Severity | Meaning | Release action |
| --- | --- | --- |
| P0 | Data loss, cross-user data exposure, payment misgrant, app cannot launch, login broadly broken | Stop rollout or roll back |
| P1 | Core launch flow broken for a meaningful group, upload/indexing unusable, purchase/restore unreliable, severe accessibility blocker | Hold release until fixed |
| P2 | Important but avoidable workflow issue, confusing copy, non-critical visual defect | Fix before public launch where practical |
| P3 | Polish, nice-to-have, or post-launch improvement | Track after launch |

## Triage Checklist

| Check | Result | Notes |
| --- | --- | --- |
| Reproduced on current build |  |  |
| Reproduced on both platforms where relevant |  |  |
| Logs/request IDs collected without secrets |  |  |
| User ownership and entitlement impact assessed |  |  |
| Pattern-context contamination risk assessed |  |  |
| Store/billing impact assessed |  |  |
| Existing regression coverage identified |  |  |
| Fix owner assigned |  |  |

## Release Decision

| Field | Value |
| --- | --- |
| Decision | Continue / Hold / Roll back |
| Decision owner |  |
| Decision time |  |
| Required fix / evidence |  |
| Follow-up issue |  |
