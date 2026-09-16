# StitchSense Operations Runbook

This runbook covers the mobile API, staging stack, production storage, rollback, restore validation, secret rotation, and incident response. Secret values are never copied into this document.

## Production and staging locations

- VPS: `173.249.40.161`
- Backend deployment path: `/opt/stitchsense-mobile/backend`
- Production compose file: `docker-compose.vps.yml`
- Production API env file: `stitchsense-api/.env.vps`
- Staging compose file: `docker-compose.staging.yml`
- Staging compose env file: `.env.staging.compose`
- Staging API env file: `stitchsense-api/.env.staging`
- Production public API: `https://stitchsense.zu-auto.co.uk`
- Production private API port: `127.0.0.1:4445`
- Staging private API port: `127.0.0.1:4447`

## Standard backend deployment

Run from a clean local checkout on `main` after CI is green:

```bash
rsync -az --delete \
  --exclude='.env.vps' \
  --exclude='.env.staging' \
  --exclude='.env.staging.compose' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.DS_Store' \
  "Mobile App/backend/" root@173.249.40.161:/opt/stitchsense-mobile/backend/
```

Then on the VPS:

```bash
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d --build
```

Verify:

```bash
curl -fsS http://127.0.0.1:4445/health
curl -fsS http://127.0.0.1:4445/ready
curl -fsS https://stitchsense.zu-auto.co.uk/ready
docker inspect stitchsense-api --format '{{.State.Health.Status}} {{.Image}}'
```

Expected readiness response:

```json
{"ok":true,"service":"stitchsense-api","checks":{"database":true,"storage":true}}
```

## Monitoring hooks

The production uptime workflow probes public `/health` and `/ready` every 15 minutes. Add a repository secret named `UPTIME_ALERT_WEBHOOK_URL` to send failure payloads to the chosen incident channel; leave it unset to rely on GitHub workflow-failure notifications only.

The API exposes Prometheus-style request totals and latency buckets at `/metrics` when `METRICS_SHARED_SECRET` is configured. Scrape it only from a trusted network path:

```bash
curl -fsS \
  -H "Authorization: Bearer $METRICS_SHARED_SECRET" \
  http://127.0.0.1:4445/metrics
```

## Staging deployment

Staging is private by default. It has its own API container, Postgres database, MinIO bucket, compose project, and generated secrets.

```bash
cd /opt/stitchsense-mobile/backend
docker compose --env-file .env.staging.compose -f docker-compose.staging.yml up -d --build
docker compose --env-file .env.staging.compose -f docker-compose.staging.yml run --rm api npm run migrate
curl -fsS http://127.0.0.1:4447/ready
```

Do not expose staging publicly until a dedicated reverse-proxy host and app build channel are intentionally configured.

## Migration procedure

Before applying a migration to production, create a fresh PostgreSQL backup in an owner-only VPS directory and confirm the archive is readable.

```bash
install -d -m 700 /opt/stitchsense-mobile/backups/YYYYMMDD-change-name
pg_dump --format=custom --file=/opt/stitchsense-mobile/backups/YYYYMMDD-change-name/stitchsense_mobile_before_change.dump "$DATABASE_URL"
pg_restore --list /opt/stitchsense-mobile/backups/YYYYMMDD-change-name/stitchsense_mobile_before_change.dump >/dev/null
```

Then run migrations from the release image:

```bash
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml run --rm api npm run migrate
```

Verify:

```bash
curl -fsS http://127.0.0.1:4445/ready
```

## Rollback procedure

Use rollback when a deployment causes failed health/readiness checks, elevated errors, data-integrity risk, or broken critical flows.

1. Preserve evidence before changing state:

```bash
docker logs --tail 300 stitchsense-api > /opt/stitchsense-mobile/backups/YYYYMMDD-incident/api-tail.log
docker ps --format '{{.Names}} {{.Image}} {{.Status}}' > /opt/stitchsense-mobile/backups/YYYYMMDD-incident/docker-ps.txt
```

2. Re-tag and restart the previous known-good image if it exists:

```bash
docker tag backend-api:pre-change-tag backend-api:latest
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d
```

3. If source rollback is required, restore the prior source snapshot and rebuild:

```bash
cd /opt/stitchsense-mobile/backend
# Restore only the intended backup source; do not overwrite .env.vps.
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d --build
```

4. Verify:

```bash
curl -fsS http://127.0.0.1:4445/health
curl -fsS http://127.0.0.1:4445/ready
curl -fsS https://stitchsense.zu-auto.co.uk/ready
```

Do not roll back a database migration by hand unless a rehearsed down/restore plan exists for that exact migration.

## Restore validation

Never test restores over production.

1. Create an isolated PostgreSQL 16 database.
2. Restore the selected custom-format dump with:

```bash
pg_restore --no-owner --no-privileges --dbname="$ISOLATED_DATABASE_URL" /path/to/backup.dump
```

3. Compare table counts against the service inventory.
4. Run application smoke checks against the isolated database.
5. Destroy the isolated database after validation according to the data-handling policy.

For WordPress-host data, use the enabled 20i backups as the provider-level restore source and validate in a non-production copy before restoring live data.

## Secret rotation

Rotate secrets one integration at a time.

- Backend API env: update `/opt/stitchsense-mobile/backend/stitchsense-api/.env.vps`, then recreate the API container.
- WordPress bridge: update both the VPS env and WordPress plugin setting in the same maintenance window.
- RevenueCat webhook authorization: update RevenueCat webhook configuration and the VPS env together.
- n8n workflow secrets: update n8n and the matching VPS env together.
- Storage credentials: rotate MinIO credentials only with a confirmed plan for the API env, MinIO env, and bucket access.

After any rotation:

```bash
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d
curl -fsS https://stitchsense.zu-auto.co.uk/ready
```

If refresh-token or bridge-secret exposure is suspected, revoke affected refresh tokens and expect users to sign in again.

## Incident response

1. Classify the incident:
   - Availability: API, database, storage, proxy, DNS, or n8n unavailable.
   - Security: suspicious auth activity, leaked secret, cross-user access, webhook abuse.
   - Data integrity: missing files, duplicated imports, bad migration, wrong user mapping.
   - Billing: RevenueCat entitlement mismatch, webhook failure, store purchase issue.
2. Preserve evidence:
   - API logs.
   - Docker container/image status.
   - Relevant audit event rows.
   - Git commit and deployment timestamp.
3. Contain:
   - Disable affected webhook/feature if possible.
   - Rotate exposed secret.
   - Roll back the app image if code caused the issue.
4. Recover:
   - Restore service readiness.
   - Validate `/health`, `/ready`, login, entitlement, library, upload, and AI chat smoke paths.
5. Follow up:
   - Record timeline, root cause, user impact, remediation, and prevention task in the production-readiness notes.

## Do-not-do list

- Do not print `.env.vps`, `.env.staging`, `.env.staging.compose`, tokens, or PATs into logs or chat.
- Do not use `rm -rf` on deployment, backup, Docker volume, or workspace roots.
- Do not run restore tests against production databases.
- Do not expose staging publicly without a dedicated proxy, TLS, auth, and app build channel plan.
- Do not add a mobile web-checkout fallback for iOS or Android digital subscriptions.
