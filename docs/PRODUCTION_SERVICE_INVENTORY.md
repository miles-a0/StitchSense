# StitchSense Production Service Inventory

**Observed:** 28 August 2026  
**Purpose:** Recovery and deployment inventory. Secret values are deliberately excluded.

## Source and deployment

- Canonical source: private GitHub repository `miles-a0/StitchSense`, default branch `main`.
- Production API deployment path documented by the project: `/opt/stitchsense-mobile/backend`.
- API deployment unit: Docker Compose service `api`, container `stitchsense-api`, host port `4445` to container port `8080`, restart policy `unless-stopped`.
- Production environment file: `/opt/stitchsense-mobile/backend/stitchsense-api/.env.vps`. The file contains operational secrets and must remain owner-readable only; values are not recorded here.
- Documented host access: SSH to `root@173.249.40.161`. None of the SSH identities currently available on the development machine are authorised by that host.

## Public services

| Service | Public endpoint | DNS / host | Evidence |
|---|---|---|---|
| Mobile API | `https://stitchsense.zu-auto.co.uk` | `173.249.40.161` | `/health` returned HTTP 200 with service `stitchsense-api` |
| WordPress site and bridge | `https://stitchsense.co.uk` | `185.151.30.187` | Bridge endpoint is reachable and rejects unauthenticated requests with HTTP 401 |

The API certificate is a Let's Encrypt certificate for `stitchsense.zu-auto.co.uk`, observed valid from 15 August to 13 November 2026. Renewal ownership and alert routing are not documented in the repository and must be assigned.

## PostgreSQL

- Database: `stitchsense_mobile`
- Role: `stitchsense_user`
- Server: PostgreSQL 16.14, externally reachable on the configured non-default port.
- Connectivity from the development machine was verified using the protected local production environment file.

Observed row counts:

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| `audit_events` | 281 | `chat_messages` | 148 |
| `chat_sessions` | 37 | `linked_accounts` | 29 |
| `manual_entitlements` | 5 | `project_counters` | 11 |
| `project_pattern_marks` | 3 | `project_photos` | 7 |
| `project_work_log` | 4 | `projects` | 26 |
| `refresh_tokens` | 3,759 | `rewrite_sessions` | 4 |
| `stash_items` | 6 | `subscriptions` | 2 |
| `user_connections` | 0 | `user_patterns` | 112 |
| `user_settings` | 4 | `users` | 29 |

Security-relevant observations:

- 1 administrator user.
- 1 documented demo user.
- 218 active refresh tokens at observation time.
- 29 WordPress-linked accounts; none referenced a non-canonical WordPress host.

## Object storage

- Provider configured in production: MinIO/S3-compatible storage.
- The configured endpoint uses the internal hostname `minio`, so it is reachable from the production network but not from the development machine.
- Configured bucket name: `stitchsense-patterns`.
- Database references currently identify 70 stored objects: 58 pattern files, 7 project photos, and 5 stash images.
- Although TCP ports 9000 and 9001 answer on the VPS, the public port 9000 response is not a valid S3 API response. It must not be treated as a backup endpoint.
- A verified object backup therefore requires SSH/production-network access. The recovery method should use MinIO Client (`mc mirror`) or an S3-compatible versioned replication target, preserve metadata, and validate the resulting object count against both the source bucket and database references.

## Backup evidence

- Source archive: `StitchSense-source-before-hardening.tar.gz` in the protected external baseline directory.
- Source archive SHA-256: `4ec39c21ffd29443f4780b816c3dd834449acc020386b416252af77c4132b282`.
- Expo history bundle: `expo-history.bundle` in the same protected directory and verified as a readable Git bundle.
- PostgreSQL custom-format backup: `stitchsense_mobile-20260828-baseline.dump` (1,335,051 bytes), created with PostgreSQL 16.15 client tools against PostgreSQL 16.14. `pg_restore --list` successfully parsed the archive and identified data for all 18 application tables plus sequence state.
- Object storage backup: blocked until authorised VPS or production-network access is available.

## Ownership and access gaps

Before a production release, assign named owners for the VPS/SSH account, DNS and reverse proxy, TLS renewal alerts, PostgreSQL, MinIO, WordPress administration, GitHub administration, incident alerts, and backup restoration. The immediate operational blocker is access to both the VPS and WordPress administration: both are required for an atomic API deployment and bridge-secret rotation.

## Restore validation

The custom archive and its contents list are SHA-256 protected in the external baseline directory. Before relying on it for disaster recovery, restore it into an isolated PostgreSQL 16 database using `pg_restore --no-owner --no-privileges`, compare table counts with this inventory, run application smoke tests, and then destroy the isolated copy according to the data-handling policy. Do not test restoration over the production database.
