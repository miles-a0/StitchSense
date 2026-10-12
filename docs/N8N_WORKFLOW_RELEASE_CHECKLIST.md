# StitchSense n8n Workflow Release Checklist

Treat n8n as an external service boundary. Workflow changes must preserve user ownership, selected pattern context, shared-secret authentication, and useful error details.

## Workflow Inventory

| Workflow type | Backend config key | Required context |
| --- | --- | --- |
| Chat | `N8N_CHAT_WEBHOOK_URL` | User ID, selected pattern ID, selected pattern content/context, request ID |
| Upload/indexing | `N8N_UPLOAD_WEBHOOK_URL` | User ID, pattern ID, uploaded file metadata, request ID |
| Library/Ravelry | `N8N_LIBRARY_WEBHOOK_URL` | User ID, linked account/import metadata, request ID |
| Image/Stitch Vision | `N8N_IMAGE_WEBHOOK_URL` | User ID, image reference, selected pattern or project context where applicable, request ID |

## Contract Checks

| Check | Evidence |
| --- | --- |
| Shared-secret header is required and rotated in staging before production |  |
| Payload includes user owner and selected resource IDs |  |
| Pattern chat/rewrite cannot receive Pattern B context while viewing Pattern A |  |
| Workflow failure surfaces useful non-secret error information |  |
| Retry/fallback behaviour matches backend tests and support copy |  |
| Metrics emit only low-cardinality labels and no URLs, prompts, file IDs, or secrets |  |

## Deploy-order dependencies

| Backend change | Workflow requirement | Confirmed live |
| --- | --- | --- |
| Upload requests send the pattern file only as the `file` multipart field (previously also `data` and `pattern_file`) | Upload workflow `Validate File` node must select the `file` binary key, as the repository export does. Import the current export before deploying this backend change; an older workflow that reads `data` would reject every upload with "No file uploaded." |  |
| n8n secrets and Qdrant/embedding URLs read from `$env` in the exports | `N8N_CHAT_SHARED_SECRET`, `N8N_UPLOAD_SHARED_SECRET`/`N8N_SHARED_SECRET`, `STITCHSENSE_QDRANT_URL`, `STITCHSENSE_EMBEDDINGS_URL`, `STITCHSENSE_STIRLING_URL` and `QDRANT_API_KEY` set in the n8n environment |  |
| Chat retrieval filter (`Prepare Qdrant Search`) uses `platform_user_id`, not `user_id` | Upload indexing writes the raw platform user ID to each point's `platform_user_id`; API chat, rewrite, summary and Stitch Vision requests all send it. `user_id` is a per-session scope string (`pattern:{user}:{pattern}:{session}`) that never equals the indexed `pattern:{user}:{pattern}`, so filtering on it would return no chunks. |  |
| Requests with no pattern scope return no chunks | General helper chat no longer searches the whole `knitting_knowledge` collection. Confirm helper chat still answers from the model without retrieved pattern context. |  |

## Open Follow-up: Owner Scope For WordPress Web Chat

Interim state: requests without `platform_user_id` (the WordPress website chat, now restricted to signed-in users) are filtered by `project_id`/`file_id`/`job_id` only, as before. The website never sends an owner ID and website uploads are indexed without one, so enforcing owner scope there today would remove pattern retrieval from website chat.

To close it:

1. Decide the owner key for website users (linked platform user ID, or a `wp:{user_id}` key for WordPress-only accounts) and have the WordPress chat and upload proxies set it server-side from the signed-in user, overwriting any browser-supplied value.
2. Inspect the live `knitting_knowledge` points and backfill the owner key on existing points.
3. Change `scopedFilter` to fail closed when the owner key is missing.

## Release Steps

1. Export the current production workflow definitions before editing.
2. Apply changes to staging workflows first.
3. Run backend tests covering workflow payloads and failures.
4. Run staging smoke checks for upload, chat, rewrite, library/Ravelry, and Stitch Vision.
5. Confirm `stitchsense_workflow_requests_total` and latency metrics update without sensitive labels.
6. Record workflow versions or export hashes in `docs/RELEASE_CANDIDATE_EVIDENCE.md`.

## Rollback

| Trigger | Action |
| --- | --- |
| Authentication failure after rotation | Restore previous workflow secret and backend env pair |
| Widespread workflow HTTP errors | Revert n8n workflow to last exported production version |
| Pattern context contamination suspected | Disable affected workflow path and halt rollout |
| Upload/indexing creates partial records | Use existing rollback/delete path and inspect orphan storage |

## Decision

| Field | Value |
| --- | --- |
| Workflow release owner |  |
| Staging workflow versions |  |
| Production workflow versions |  |
| Approved for rollout | Yes / No |
