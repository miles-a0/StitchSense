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
