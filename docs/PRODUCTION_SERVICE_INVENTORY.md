# StitchSense Production Service Inventory

**Observed:** 28 August 2026  
**Purpose:** Recovery and deployment inventory. Secret values are deliberately excluded.

## Source and deployment

- Canonical source: private GitHub repository `miles-a0/StitchSense`, default branch `main`.
- Production API deployment path documented by the project: `/opt/stitchsense-mobile/backend`.
- API deployment unit: Docker Compose service `api`, container `stitchsense-api`, host port `4445` to container port `8080`, restart policy `unless-stopped`.
- Production environment file: `/opt/stitchsense-mobile/backend/stitchsense-api/.env.vps`. The file contains operational secrets, is owned by `root:root`, and was corrected from mode `0644` to owner-only mode `0600`; values are not recorded here.
- Host access: SSH to `root@173.249.40.161` using the authorised development-machine key.

## Public services

| Service | Public endpoint | DNS / host | Evidence |
|---|---|---|---|
| Mobile API | `https://stitchsense.zu-auto.co.uk` | `173.249.40.161` | `/health` returned HTTP 200 with service `stitchsense-api` |
| WordPress site and bridge | `https://catlowyarns.co.uk` | `185.151.30.187` | A configured-host bridge smoke test reached WordPress and correctly rejected dummy credentials with HTTP 401 |

The API certificate is a Let's Encrypt certificate for `stitchsense.zu-auto.co.uk`, observed valid from 15 August to 13 November 2026. Renewal ownership and alert routing are not documented in the repository and must be assigned.

The WordPress host is managed through 20i/StackCP. At the security deployment, it ran WordPress 7.0.4 and StitchSense plugin 7.7.39. Versions 7.7.16 and 7.7.39 had both been marked active, with the older version loaded first; 7.7.16 was deactivated after a verified database backup, and runtime inspection confirmed 7.7.39.

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
- 218 active refresh tokens at initial observation; all 218 were revoked after bridge-secret rotation, leaving 0 active pre-rotation tokens.
- 29 WordPress-linked accounts; none referenced a non-canonical WordPress host.

## Object storage

- Provider configured in production: MinIO/S3-compatible storage.
- The configured endpoint uses the internal hostname `minio`, so it is reachable from the production network but not from the development machine.
- Configured bucket name: `stitchsense-patterns`.
- Database references currently identify 70 stored objects: 58 pattern files, 7 project photos, and 5 stash images.
- The MinIO container maps API port 9000 to VPS port 9075 and console port 9001 to VPS port 9076. VPS port 9000 belongs to Portainer and must not be treated as an S3 endpoint.
- The production bucket contains 81 objects (281,857,297 bytes). This is 11 more than the 70 current database file references; preserve them until reconciliation determines whether they are historical, derived, or orphaned.

## Backup evidence

- Source archive: `StitchSense-source-before-hardening.tar.gz` in the protected external baseline directory.
- Source archive SHA-256: `4ec39c21ffd29443f4780b816c3dd834449acc020386b416252af77c4132b282`.
- Expo history bundle: `expo-history.bundle` in the same protected directory and verified as a readable Git bundle.
- PostgreSQL custom-format backup: `stitchsense_mobile-20260828-baseline.dump` (1,335,051 bytes), created with PostgreSQL 16.15 client tools against PostgreSQL 16.14. `pg_restore --list` successfully parsed the archive and identified data for all 18 application tables plus sequence state.
- Object storage backup: all 81 objects were mirrored with MinIO Client to an owner-only VPS recovery directory, individually SHA-256 verified, copied off-server to the protected local baseline directory, and verified again (81 passed, 0 failed).

## Security deployment evidence

- Release source: private repository commit `ad64f78`; bridge hardening was introduced by commit `6f74a73`.
- Tested and running Docker image: `sha256:7c937a5b2467f902631e8608ef5a49ab6ff76c654bf383b6b4ca0d7269a9d794`.
- Rollback image repository `backend-api`, tag `pre-hardening-20260828`; rollback source and the pre-deployment environment file are retained under `/opt/stitchsense-mobile/backups/20260828-pre-hardening` with owner-only access.
- Canary and live health checks returned HTTP 200.
- Canary, local production, and public TLS regression probes all rejected a mismatched WordPress host with HTTP 400 before an outbound request.
- The configured Catlow Yarns WordPress bridge remained reachable after deployment and rejected deliberately invalid credentials with HTTP 401.
- The bridge secret was replaced with a new 96-character random value on WordPress and the API. SHA-256 comparison confirmed both stored values match without exposing them.
- All 218 active refresh tokens were revoked transactionally after rotation and a `security.bridge_secret_rotated` audit event was recorded.
- Account audit found 1 established administrator, 1 corresponding WordPress link, 28 standard users, 0 orphaned links, 0 unexpected providers, and 0 non-canonical WordPress links.
- Temporary plaintext rotation files were removed from the Mac, VPS, and WordPress host after verification.

## Ownership and access gaps

Before a production release, assign named owners for the VPS/SSH account, DNS and reverse proxy, TLS renewal alerts, PostgreSQL, MinIO, WordPress administration, GitHub administration, incident alerts, and backup restoration. Authorised VPS and WordPress-host SSH access are now available for the current maintenance workflow.

## Restore validation

The custom archive and its contents list are SHA-256 protected in the external baseline directory. Before relying on it for disaster recovery, restore it into an isolated PostgreSQL 16 database using `pg_restore --no-owner --no-privileges`, compare table counts with this inventory, run application smoke tests, and then destroy the isolated copy according to the data-handling policy. Do not test restoration over the production database.
