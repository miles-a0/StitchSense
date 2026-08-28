# StitchSense Expo Readme

This is the quick-start guide for the separate Expo / Expo Go version of StitchSense.

Project location:

```bash
/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo
```

## What this is

This Expo app is a separate mobile client from the existing SwiftUI iOS app.

- SwiftUI app lives in `Mobile App/ios`
- Expo app lives in `Mobile App/stitchsense-expo`

Use the Expo app when you want to test quickly on your iPhone with Expo Go.

## First-time setup

Open a terminal and run:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm install
```

## Start the Expo dev server

Standard start:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm start
```

Recommended LAN start for iPhone testing:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm start -- --lan --port 8082
```

Keep that terminal window open while testing.

## Open on iPhone with Expo Go

1. Open Expo Go on your iPhone
2. Run the start command above on your Mac
3. Scan the QR code shown in the terminal

If needed, manually enter the Expo URL shown in terminal, for example:

```text
exp://172.20.10.3:8082
```

## Useful run commands

Start Expo:

```bash
npm start
```

Start Expo on LAN with fixed port:

```bash
npm start -- --lan --port 8082
```

Open iOS simulator:

```bash
npm run ios
```

Open Android emulator:

```bash
npm run android
```

Open web preview:

```bash
npm run web
```

Run lint:

```bash
npm run lint
```

Run TypeScript check:

```bash
npx tsc --noEmit
```

## If Expo Go says to run `npx expo start`

That usually means the dev server is not currently running.

Run:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm start -- --lan --port 8082
```

## If your iPhone cannot connect

Check these:

1. Mac and iPhone are on the same Wi-Fi
2. VPN is off on both devices if possible
3. macOS firewall is not blocking Node / Expo
4. Use `--lan` mode, not tunnel

## Current live API used by the Expo app

The Expo app currently points to:

```text
https://stitchsense.zu-auto.co.uk
```

WordPress bridge base:

```text
https://catlowyarns.co.uk
```

## Current app scope

Already wired:

- branded Expo app shell
- sign in
- secure token storage
- WordPress fallback login
- Library sync
- Pattern detail shell

Still to be ported fully:

- chat
- rewrite
- Stitch Vision
- tools
- paywall/subscription parity

## Recommended daily workflow

When coming back to this project later:

```bash
cd "/Users/andrewmagill/DEV/StitchSense/Mobile App/stitchsense-expo"
npm start -- --lan --port 8082
```

Then:

1. open Expo Go on your phone
2. scan the QR code
3. test changes live

