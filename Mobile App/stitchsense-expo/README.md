# StitchSense Expo

Parallel Expo / Expo Go mobile client for StitchSense.

This app sits alongside the existing SwiftUI build under `Mobile App/ios` and
shares the same live API base:

- API: `https://stitchsense.zu-auto.co.uk`
- WordPress bridge site: `https://catlowyarns.co.uk`

## Current port scope

- Branded Expo Router shell
- Secure token storage with `expo-secure-store`
- StitchSense / WordPress credential login
- Live library loading from the shared API
- Pattern detail route shell
- Workspace, camera, tools, and account tab foundations

## Run in Expo Go

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh
```

Then scan the QR code in Expo Go on your iPhone.

If you see a screen that says:

- `There was a problem running "StitchSense Expo"`
- `Could not connect to development server`

that usually means your phone opened an older dev-build shell instead of the
fresh Expo Go session. In that case:

1. Fully close the app on the phone.
2. Open `Expo Go` itself.
3. Scan the fresh QR code again.
4. Open the newly scanned session, not an older recent project entry.

If your local Wi-Fi connection is being fussy, use tunnel mode instead:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh tunnel
```

The project is pinned to Node 20 via `.nvmrc`. The helper script loads `nvm`,
switches to Node 20, clears stale Expo/Metro ports, and starts Expo in a way
that matches what the phone expects.

## Why this app is separate

The existing native mobile app in this repo is a SwiftUI/Xcode project. Expo Go
requires an Expo/React Native app, so this folder is the dedicated Expo track
for direct on-device iteration.
