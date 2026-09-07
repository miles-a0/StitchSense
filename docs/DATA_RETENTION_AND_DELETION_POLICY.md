# StitchSense Data Retention And Deletion Policy

Status: operational draft pending business/legal approval before public launch.

This policy defines how long StitchSense should keep production data, logs, audit records, uploaded files, and backups. It is written as an engineering control document; final customer-facing wording must be reviewed before it is published.

## Principles

- Keep only what the app needs to provide the service, support users, meet operational needs, and investigate abuse or incidents.
- Delete or anonymise user data when it is no longer needed.
- Do not store secret values in logs, documentation, support exports, or analytics.
- Keep backups recoverable, but do not treat backups as a way to avoid foreground deletion obligations.
- Validate deletion in staging before running bulk deletion in production.

## Proposed retention schedule

| Data category | Examples | Proposed retention |
| --- | --- | --- |
| Account profile | email, display name, role, linked WordPress identity | While the account is active, then deleted/anonymised after account deletion completes |
| Authentication data | password hashes, refresh tokens, reset tokens | While active; expired/revoked tokens purged on a scheduled maintenance cycle |
| Library/project data | patterns, projects, notes, counters, markers, stash items | While the account is active, then deleted after account deletion completes |
| Uploaded files | PDFs, project photos, stash photos, generated thumbnails | While referenced by active app records; orphaned objects quarantined then deleted after reconciliation |
| AI workflow records | chat sessions, chat messages, rewrite prompts/results, image analysis metadata | While the account is active unless the user deletes them earlier |
| Billing entitlement records | provider, status, plan, period end, non-secret webhook metadata | While needed for account access, billing support, refund disputes, or audit history |
| Audit events | admin grants/revocations, billing webhook receipts, imports, security-relevant events | 12 months by default, longer only for unresolved incidents or business/legal need |
| API logs | request IDs, route, status, timing, operational errors | 30 days by default, shorter if storage pressure requires |
| Backups | PostgreSQL dumps, MinIO object mirrors, 20i provider backups | Operational target: 30-90 days depending on provider capability and recovery needs |
| Staging data | anonymised/minimised copy of production-like data | Destroy after the test cycle unless needed for active debugging |

## Account deletion behaviour

When a user requests account deletion, StitchSense should:

1. Confirm the request came from the authenticated account holder or an authorised support/admin process.
2. Delete or anonymise the user profile.
3. Revoke refresh tokens and reset tokens.
4. Delete library, project, stash, notes, counters, chat, rewrite, and AI workflow records owned by that user.
5. Delete or queue deletion for object-storage files referenced only by that user.
6. Preserve only minimal audit/billing records required for fraud prevention, support, or unresolved disputes.
7. Record a deletion audit event that does not contain deleted content.
8. Return a clear completion state to the user.

Backups may retain deleted data until the backup naturally expires. Restoring a backup must include a post-restore deletion replay/check for accounts deleted after the backup was taken.

## Object-storage reconciliation

Before deleting files from MinIO:

1. Compare database file references with bucket object keys.
2. Mark unreferenced objects as orphan candidates.
3. Preserve orphan candidates for one reconciliation window.
4. Delete only objects that remain unreferenced after the window and are not needed for an active incident.

The current service inventory records more bucket objects than active database references; do not bulk-delete those objects until reconciliation identifies whether they are historical, derived, or orphaned.

## Logs and audit data

API logs must remain operational:

- Include request ID, method, URL path, status code, timing, and non-sensitive error information.
- Do not include passwords, tokens, auth headers, cookies, full uploaded file contents, payment secrets, webhook secrets, or PATs.
- Use request IDs when escalating support/debugging issues instead of asking users for sensitive details.

Audit events may contain user IDs and event metadata, but should not contain secret values or full user-generated content unless strictly required for a security investigation.

## Backup handling

- Store backup files in owner-only directories.
- Verify PostgreSQL custom-format backups with `pg_restore --list`.
- Verify object-storage mirrors by count and checksum where practical.
- Keep local/off-server backup copies protected.
- Do not restore over production without an explicit incident decision and a tested recovery sequence.
- 20i backups are the provider-level restore source for WordPress-host data; validate in a non-production copy before restoring live data.

## Staging data

Representative staging data should be minimised:

- Prefer synthetic data.
- If production-like data is needed, remove or replace direct identifiers where practical.
- Do not copy payment secrets, live tokens, or real webhook credentials into staging.
- Destroy staging datasets after the validation cycle unless they are part of an active investigation.

## Launch blockers

Before public launch:

- Customer-facing privacy policy and account deletion wording must match the actual app behaviour.
- Apple privacy labels and Google Data Safety answers must match the actual SDKs and backend data handling.
- A deletion/recovery rehearsal must prove deleted accounts are not accidentally resurrected by restore or sync flows.
- Backup retention periods must be confirmed against 20i, VPS, and any off-server backup practices actually in use.
