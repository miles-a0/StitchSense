# Phase-End Deploy and Test

Use this at the end of any phase when we need to re-upload the WordPress plugin, redeploy the StitchSense API, and test the Expo app.

## Working rule

If a phase changes the WordPress plugin, I will:

1. bump the plugin version
2. rebuild the plugin zip
3. tell you that a fresh upload is needed

If a phase only changes Expo, you do not need to re-upload the plugin.

If a phase only changes `stitchsense-api`, you do not need to re-upload the plugin, but you do need to redeploy the API.

## 1. Rebuild the WordPress plugin zip

From the repo root:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
chmod +x ./tools/package-stitchsense-plugin.sh
./tools/package-stitchsense-plugin.sh 7.7.16 "Short release note here"
```

That will:

- update the plugin version in `stitchsense-assistant-hub-pro.php`
- update the build reference in `assets/stitchsense-hub-pro.js`
- rebuild:
  - `stitchsense-assistant-hub-pro.zip`
  - `stitchsense-assistant-hub-pro-v7.7.16.zip`

### Upload target

Upload this file to WordPress:

```text
/Users/andrewmagill/DEV/StitchSense/stitchsense-assistant-hub-pro.zip
```

## 2. Redeploy `stitchsense-api` on the VPS

### On your Mac, copy the backend changes up to the VPS

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
scp -r "Mobile App/backend" root@173.249.40.161:/opt/stitchsense-mobile/
```

If the backend folder already exists on the server and you want a cleaner sync, use:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
rsync -avz --delete "Mobile App/backend/" root@173.249.40.161:/opt/stitchsense-mobile/backend/
```

### Then SSH into the VPS and rebuild the API

```bash
ssh root@173.249.40.161
cd /opt/stitchsense-mobile/backend
docker compose -f docker-compose.vps.yml up -d --build api
docker logs stitchsense-api --tail 100
curl http://127.0.0.1:4445/health
```

Expected health response:

```json
{"ok":true,"service":"stitchsense-api"}
```

### If a migration was added in that phase

Run the SQL file against `stitchsense_mobile`.

Example:

```bash
cd /opt/stitchsense-mobile/backend
docker exec -i stitchsense-postgres psql -U stitchsense_user -d stitchsense_mobile < stitchsense-api/migrations/006_project_pattern_marks.sql
```

Then rebuild the API again:

```bash
docker compose -f docker-compose.vps.yml up -d --build api
curl http://127.0.0.1:4445/health
```

## 3. Restart Expo

### Best standard start

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh
```

### If your phone cannot see your Mac properly

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh tunnel
```

### If Expo is stuck, kill it first

```bash
pkill -f "expo start" || true
pkill -f "node .*expo" || true
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh tunnel
```

## 4. What to test after each phase

### If the WordPress plugin changed

Test:

- WordPress admin settings page still loads
- affected REST routes return expected responses
- the web app flow still works
- the mobile app flow that depends on the plugin still works

### If the API changed

Test:

- login still works
- affected mobile screen loads without auth errors
- the changed feature works end to end
- web/mobile sync still behaves correctly if the feature is shared

### If Expo changed

Test:

- screen loads in Expo Go
- updated UI/UX appears on device
- primary action works
- no regressions in the surrounding flow

## 5. Typical end-of-phase command set

If all three layers changed:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/package-stitchsense-plugin.sh 7.7.16 "Short release note here"
scp -r "Mobile App/backend" root@173.249.40.161:/opt/stitchsense-mobile/
ssh root@173.249.40.161
```

Then on the VPS:

```bash
cd /opt/stitchsense-mobile/backend
docker compose -f docker-compose.vps.yml up -d --build api
docker logs stitchsense-api --tail 100
curl http://127.0.0.1:4445/health
```

Then back on your Mac:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh tunnel
```

## 6. Notes

- The compose service name is `api`, not `stitchsense-api`
- The running container name is `stitchsense-api`
- The main plugin file currently controls the WordPress version number
- The API public URL is:

```text
https://stitchsense.zu-auto.co.uk
```
