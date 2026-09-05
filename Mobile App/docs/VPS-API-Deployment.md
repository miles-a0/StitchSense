# VPS API Deployment

The mobile app should call the StitchSense API, not Postgres or n8n directly. The API then talks to the existing VPS services:

- n8n: `173.249.40.161:5678`
- PostgreSQL: `173.249.40.161:2303`, container `stitchsense-postgres`
- API host port: `173.249.40.161:4445`
- API container port: `8080`
- Public API URL: `https://stitchsense.zu-auto.co.uk`

Port `4444` is already serving the existing `stitchmate-api` service on the VPS. It responds to `/health`, but it does not expose the mobile app route `POST /auth/login`, so do not point the mobile app proxy there.

The iOS app is configured to use:

```text
STITCHSENSE_API_BASE_URL=https://stitchsense.zu-auto.co.uk
```

## Deploy

From the VPS, place the `Mobile App/backend` folder somewhere persistent, then:

```bash
cd "Mobile App/backend"
cp stitchsense-api/.env.vps.example stitchsense-api/.env.vps
nano stitchsense-api/.env.vps
docker compose -f docker-compose.vps.yml up -d --build
curl http://127.0.0.1:4445/health
curl http://173.249.40.161:4445/health
```

Expected health response:

```json
{"ok":true,"service":"stitchsense-api"}
```

## Required `.env.vps` Values

Set the live Postgres password in:

```text
DATABASE_URL=postgres://stitchsense:<live-password>@173.249.40.161:2303/stitchsense
```

The live VPS uses Postgres user `stitchsense_user`. Use a dedicated mobile database to avoid collisions with existing WordPress/plugin tables:

```text
DATABASE_URL=postgres://stitchsense_user:<live-password>@173.249.40.161:2303/stitchsense_mobile
```

Do not change the existing `stitchsense-postgres` user password just for the mobile app. Other services may depend on it. If API login returns PostgreSQL code `28P01`, update `DATABASE_URL` in `/opt/stitchsense-mobile/backend/stitchsense-api/.env.vps` to match the existing database username/password, then recreate `stitchsense-api`.

Known n8n workflows:

```text
N8N_CHAT_URL=https://n8n.zu-auto.co.uk/webhook/pattern-helper-chat
N8N_UPLOAD_URL=https://n8n.zu-auto.co.uk/webhook/stitchsense-upload-v5
N8N_LIBRARY_PROXY_URL=https://n8n.zu-auto.co.uk/webhook/stitchsense-library-proxy
N8N_IMAGE_URL=https://n8n.zu-auto.co.uk/webhook/stitchsense-image-analysis
```

The image URL above matches the WordPress plugin default in `class-stitchsense-workflow-client.php`.

## Cloudflare

Create a DNS record:

```text
Type: A
Name: stitchsense
Content: 173.249.40.161
Proxy status: Proxied
```

## Nginx Proxy Manager

Create a Proxy Host:

```text
Domain Names: stitchsense.zu-auto.co.uk
Scheme: http
Forward Hostname / IP: 173.249.40.161
Forward Port: 4445
Block Common Exploits: On
Websockets Support: On
SSL: Request a new SSL Certificate
Force SSL: On
HTTP/2 Support: On
HSTS Enabled: On
```

The compose file publishes the API on host port `4445`, so NPM does not need to share a Docker network with the API container.

If you only need to rebuild the API service later, the Compose service name is
`api` even though the container name is `stitchsense-api`.

Use:

```bash
cd /opt/stitchsense-mobile/backend
docker compose -f docker-compose.vps.yml up -d --build api
docker logs stitchsense-api --tail 100
curl http://127.0.0.1:4445/health
```

After NPM is configured, verify the public route:

```bash
curl https://stitchsense.zu-auto.co.uk/health
```

Expected response from the correct mobile API:

```json
{"ok":true,"service":"stitchsense-api"}
```

If you see this instead, NPM is still pointing at the wrong service:

```json
{"status":"ok","timestamp":"..."}
```

## Local Demo Login

Demo seeding is for local development only and is blocked when `NODE_ENV=production`.
Choose unique, temporary credentials and pass them explicitly:

```bash
cd stitchsense-api
DEMO_EMAIL='developer-owned-address@example.test' \
DEMO_PASSWORD='use-a-unique-random-value' \
npm run seed:demo
```

Never publish, commit, or reuse the temporary password. Retire the account before any public test.

## n8n Notes

The mobile app does not need n8n URLs. Configure the n8n webhook URLs in `.env.vps`; the API will call them after checking the user's entitlement.

Use the same `N8N_SHARED_SECRET` in n8n workflow validation and the API `.env.vps` file.

Current API workflow routes:

```text
POST /workflows/upload
POST /workflows/library-proxy
POST /chats/:id/messages
POST /vision/analyse
```
