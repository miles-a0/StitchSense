# StitchSense Data And Sync Reconciliation Runbook

Use this runbook for staging data validation before production migration, beta acceptance, or any restore rehearsal that could affect synced user data. Do not paste customer content, uploaded files, secrets, access tokens, or raw private pattern text into git.

## Scope

Validate that WordPress, the StitchSense API database, object storage, and the mobile app agree about user-owned resources without leaking ownership, resurrecting deleted records, or mixing pattern-specific AI context.

## Inputs

| Input | Value / evidence |
| --- | --- |
| Git commit SHA |  |
| API environment | Staging / Production-like isolated restore |
| WordPress environment | Staging / Production clone with minimised data |
| Database snapshot / backup ID |  |
| Object-storage bucket / mirror ID |  |
| Mobile build ID |  |
| Test users | Private evidence only |

## Count Reconciliation

Record counts by owner, not raw content.

| Resource | WordPress count | API DB count | Mobile count | Exceptions |
| --- | ---: | ---: | ---: | --- |
| Linked accounts |  |  |  |  |
| Patterns |  |  |  |  |
| Pattern files |  |  |  |  |
| Pattern chats |  |  |  |  |
| Pattern rewrites |  |  |  |  |
| Projects |  |  |  |  |
| Project counters |  |  |  |  |
| Project work logs |  |  |  |  |
| Project photos |  |  |  |  |
| Stash items |  |  |  |  |
| Stash photos |  |  |  |  |
| Deleted/tombstoned records |  |  |  |  |

## Bidirectional Flow Checks

| Flow | Expected result | Evidence / notes |
| --- | --- | --- |
| Web upload appears in mobile Library | Pattern appears for owner only with signed file access |  |
| Mobile upload appears in web/API inventory | Pattern has owner, file reference, and indexing state |  |
| Mobile delete creates tombstone / prevents resurrection | Deleted record does not reappear after sync |  |
| Web delete/update follows agreed web-as-master rule | Mobile reflects expected state after sync |  |
| Large PDF remains downloadable through scoped signed URL | Owner succeeds, other user fails |  |
| Project linked to pattern survives pattern deletion policy | Project state matches product rule |  |
| Stash image remains owner-scoped | Owner succeeds, other user fails |  |

## Pattern Context Matrix

| Scenario | Expected result | Evidence / notes |
| --- | --- | --- |
| Pattern A chat cannot read Pattern B content | Response and retrieved context stay scoped to Pattern A |  |
| Pattern A rewrite cannot use Pattern B text | Rewrite payload and result stay scoped to Pattern A |  |
| Metadata-only paid Ravelry pattern blocks AI content operations | User is prompted for owned source |  |
| Stored-source Ravelry pattern allows AI content operations | Operation uses stored private source only for owner |  |
| Deleted pattern cannot be opened through stale IDs | Owner receives deleted/not-found state; other users never see data |  |

## Object Storage Reconciliation

| Check | Expected result | Evidence / notes |
| --- | --- | --- |
| Every active DB file reference has an object | No missing active files |  |
| Every candidate orphan is quarantined before deletion | No immediate bulk delete |  |
| Signed URLs require owner access | Cross-user request denied |  |
| Deleted account replay removes/restores expected foreground state after backup restore | Deleted account does not silently reappear |  |

## Decision

| Field | Value |
| --- | --- |
| Reconciliation decision | Hold / Continue |
| Decision owner |  |
| Decision time |  |
| Exceptions accepted |  |
| Follow-up issues |  |
