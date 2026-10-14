# StitchSense Staging Environment

Staging is a fully separate copy of the StitchSense backend stack used for release rehearsal, workflow changes, and smoke tests. It must never read from or write to live services or live user data.

Use `docs/ENVIRONMENT_CONFIGURATION_MATRIX.md` to compare settings across environments. This document describes how staging is laid out and the rules that keep it isolated.

## Layout

| Component | Staging | Production | Where it is defined |
| --- | --- | --- | --- |
| Compose stack | `stitchsense-staging` (API, Postgres, MinIO on the `stitchsense_staging` network) | Production compose stack | `Mobile App/backend/docker-compose.staging.yml`, `Mobile App/backend/.env.staging.compose.example` |
| API | `https://staging-stitchsense.zu-auto.co.uk` (container `stitchsense-api-staging`, host port `127.0.0.1:4447`) | `https://stitchsense.zu-auto.co.uk` | `Mobile App/backend/stitchsense-api/.env.staging.example` |
| API database | `stitchsense_staging` (container `stitchsense-postgres-staging`, host port `127.0.0.1:5434`) | `stitchsense_mobile` | `docker-compose.staging.yml`, `DATABASE_URL` |
| Object storage | Bucket `stitchsense-patterns-staging` in the staging MinIO (`127.0.0.1:9002`, console `127.0.0.1:9003`) | `stitchsense-patterns` | `docker-compose.staging.yml`, `OBJECT_STORAGE_*` |
| n8n workflows | Separate `staging-*` workflows: `staging-pattern-helper-chat` (chat and Stitch Vision image analysis) and `staging-stitchsense-upload-v5` (upload indexing) | `pattern-helper-chat`, `stitchsense-upload-v5`, `stitchsense-image-analysis` | `N8N_CHAT_URL`, `N8N_UPLOAD_URL`, `N8N_IMAGE_URL` |
| n8n workflow database | `stitchsense_wf_staging` | Production workflow database | Credentials configured inside the staging n8n workflows |
| Qdrant collection | `knitting_knowledge_staging` | `knitting_knowledge` | Qdrant node URLs inside the staging n8n workflows |
| WordPress bridge | `https://staging.catlowyarns.co.uk` | `https://catlowyarns.co.uk` | `WORDPRESS_SITE_URL`, `WORDPRESS_BRIDGE_SHARED_SECRET` |
| CORS origins | `https://staging.catlowyarns.co.uk` | `https://catlowyarns.co.uk`, `https://www.catlowyarns.co.uk` | `CORS_ORIGINS` |
| Reverse proxy | Nginx Proxy Manager forwards `staging-stitchsense.zu-auto.co.uk` to `stitchsense-api-staging:8080` over the external `my-main-net` network | Forwards to `stitchsense-api:8080` over `my-main-net` | `docker-compose.staging.yml` (`reverse_proxy` network) |
| Trusted proxies | `127.0.0.1,172.16.0.0/12` (host reverse proxy and Docker bridge networks) | Production reverse proxy | `TRUST_PROXY` |

## n8n workflows

- Staging workflows are separate copies of the production workflows, named with a `staging-` prefix and served on `staging-*` webhook paths.
- Staging workflows read and write only the `stitchsense_wf_staging` database and the `knitting_knowledge_staging` Qdrant collection. Check both after importing or duplicating a workflow export, because the committed exports reference the production `knitting_knowledge` collection.
- Staging uses its own shared secrets (`N8N_SHARED_SECRET`, `N8N_CHAT_SHARED_SECRET`, `N8N_UPLOAD_SHARED_SECRET`). Do not reuse production values.
- Apply workflow changes to staging first, then follow `docs/N8N_WORKFLOW_RELEASE_CHECKLIST.md` before promoting them to production.
- The StitchSense Library API Proxy workflow is deactivated and is not part of staging or production. Its export has been removed from the repository and the API no longer exposes `/workflows/library-proxy`.

## Isolation rules

- Never point staging at live services. That includes the production API database, object storage bucket, n8n webhooks, workflow database, Qdrant collection, WordPress site, RevenueCat project, and Stripe account.
- Never copy production secrets into `.env.staging` or `.env.staging.compose`. The `.example` files contain placeholders only.
- Never restore production backups into staging without an approved anonymisation step. Staging holds test accounts only.
- Staging ports bind to `127.0.0.1` only and are reached through the host reverse proxy.
- `my-main-net` is shared with the production API, and both containers carry the compose service alias `api` there. Proxy hosts must forward to container names (`stitchsense-api-staging`, `stitchsense-api`), never to `api`. Staging reaches its own database and MinIO only through the `stitchsense_staging` network.
- When adding a new external integration, add a staging-specific value to `.env.staging.example` and a row to this document before deploying it to staging.

## Setup

1. Copy `Mobile App/backend/.env.staging.compose.example` to `.env.staging.compose` and `Mobile App/backend/stitchsense-api/.env.staging.example` to `.env.staging`, then replace every placeholder with a staging-only value.
2. Confirm every `N8N_*_URL` uses a `staging-*` webhook path and `WORDPRESS_SITE_URL` is `https://staging.catlowyarns.co.uk`.
3. Start the stack: `docker compose -f docker-compose.staging.yml --env-file .env.staging.compose up -d` from `Mobile App/backend`.
4. Run migrations inside the staging API container, then check `/health` and `/ready` on the staging API URL.
