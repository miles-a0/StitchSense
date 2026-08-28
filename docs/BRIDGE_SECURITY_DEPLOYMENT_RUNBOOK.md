# WordPress Bridge Security Deployment Runbook

This runbook deploys the configured-host restriction and rotates the shared bridge credential without leaving the API and WordPress permanently out of sync. Run it only with authorised VPS and WordPress administrator access.

## Preconditions

- The private repository `main` branch contains commit `6f74a73` or a descendant.
- The backend test suite and production dependency audit pass under Node 20 or newer.
- A current PostgreSQL backup and MinIO bucket backup have been created and verified.
- A rollback copy of the currently deployed backend source and environment file exists on the VPS with owner-only permissions.
- The operator can update the WordPress setting `stitchsense_platform_bridge_secret` and the API environment value `WORDPRESS_BRIDGE_SHARED_SECRET` in one maintenance window.

## 1. Deploy the host-restriction code

From the VPS deployment directory, obtain the reviewed release source without overwriting `.env.vps`, then rebuild only the API service:

```sh
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml build api
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d --no-deps api
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml ps
curl --fail --silent --show-error https://stitchsense.zu-auto.co.uk/health
```

Confirm the exfiltration regression is closed before rotating the secret. The request below uses an intentionally non-existent reserved domain and dummy credentials; the patched API must return HTTP 400 without making an outbound request:

```sh
curl --silent --show-error --output /tmp/stitchsense-bridge-probe.json --write-out '%{http_code}\n' \
  --request POST https://stitchsense.zu-auto.co.uk/auth/wordpress-login \
  --header 'content-type: application/json' \
  --data '{"siteUrl":"https://attacker.invalid","username":"probe-only","password":"not-a-real-password"}'
```

Do not proceed if the response is 502 or if the API health check fails.

## 2. Rotate the bridge credential

Generate a new high-entropy credential on the operator's trusted machine. Do not paste it into chat, tickets, shell history, source control, or this document.

1. Start a brief authentication maintenance window.
2. In WordPress administration, open the StitchSense Pro settings and save the new value in **WordPress bridge shared secret**.
3. Immediately update `WORDPRESS_BRIDGE_SHARED_SECRET` in `/opt/stitchsense-mobile/backend/stitchsense-api/.env.vps`, preserving owner-only file permissions.
4. Recreate the API container with the updated environment:

```sh
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d --no-deps --force-recreate api
curl --fail --silent --show-error https://stitchsense.zu-auto.co.uk/health
```

If either side cannot be updated, restore the old value on the side that changed. Never leave different values in place after the maintenance window.

## 3. Revoke and audit

- Revoke refresh tokens created before the deployment if the incident review treats the old bridge secret as exposed. This signs affected users out and should be communicated in advance.
- Verify the single expected administrator account, its roles, and its WordPress link. Investigate any additional administrator or unexpected linked account before reopening authentication.
- Review API and WordPress logs for unusual bridge failures, password attempts, administrative logins, or outbound hostnames during the suspected exposure period.

## 4. Acceptance checks

- API `/health` returns HTTP 200.
- A mismatched WordPress `siteUrl` receives HTTP 400.
- WordPress login succeeds against the configured `https://stitchsense.co.uk` host.
- Registration, token refresh, logout, pattern sync, Ravelry sync, and promotional sync pass a focused smoke test.
- The production API environment and WordPress setting contain the same new credential, and neither value appears in logs or repository files.
- Container logs contain no restart loop, database error, storage error, or unexpected outbound-host error.

## Rollback

If the new image fails before secret rotation, restore the previous backend source/image and recreate the API container using the unchanged environment. If failure occurs after rotation, first restore the previous credential on both WordPress and the API, then restore the previous image. Confirm health and WordPress login after rollback and retain logs for diagnosis.
