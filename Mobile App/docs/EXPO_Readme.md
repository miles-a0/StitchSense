# StitchSense Expo Commands

Use these from the project root:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
```

## Standard start

```bash
./tools/start-stitchsense-expo.sh
```

This starts Expo in `lan` mode on port `8081`.
It also clears stale local Expo session metadata before launch.
The launcher also pins Expo to the Mac's current LAN IP so the QR session is
less likely to drift onto an old address.
It explicitly starts in Expo Go mode.
It labels the session as `StitchSense Preview` so it is easier to spot the
correct QR session on the phone.
If it cannot find a clean LAN IP, it automatically falls back to tunnel mode
instead of letting Expo guess a stale address.

## Tunnel start

```bash
./tools/start-stitchsense-expo.sh tunnel
```

Use this when your phone cannot see your Mac on the local network.

## Doctor mode

```bash
./tools/start-stitchsense-expo.sh doctor
```

This prints the LAN IP the launcher intends to use and the expected Expo URL
without starting Metro. It is useful when the phone shows a stale or unreachable
host and we want to quickly confirm what the Mac thinks the session should be.

## If you prefer running from inside the Expo app folder

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm start
```

This now runs the same root launcher script, so it gets the same:

- LAN IP detection
- stale session cleanup
- Expo Go startup mode
- tunnel fallback if LAN detection fails

If you want the explicit command:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm run start:go
```

Tunnel variant:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm run start:go:tunnel
```

Doctor variant:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm run doctor
```

## Stop Expo cleanly

Press `Ctrl+C` in the terminal where Expo is running.

If Expo gets stuck:

```bash
pkill -f "expo start" || true
pkill -f "node .*expo" || true
```

## If the app says it cannot connect to the development server

Run this again:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh
```

If LAN still fails, switch to:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh tunnel
```

If your phone still shows an old address like `172.x.x.x:8081`, that usually
means Expo Go or the dev build reopened a cached previous session.

The launcher now tries to prevent this by preferring active Wi-Fi interface
addresses and avoiding link-local fallback addresses.

If you see a white error screen saying:

- `There was a problem running "StitchSense Expo"`
- `Could not connect to development server`

that is usually the wrong app shell being opened on the phone. Use `Expo Go`
itself, then scan the fresh QR code again.

Do this:

1. Fully close the app on the phone.
2. Start Expo again with the command above.
3. Scan the fresh QR code with Expo Go.
4. Open the newly scanned session instead of the old recent project entry.
5. If you also have an older StitchSense dev build on the phone, do not open that one for this session.

## Node version

This Expo app should run on Node 20:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
cat .nvmrc
```

If you want to switch manually:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20
```
