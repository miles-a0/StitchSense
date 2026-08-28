# StitchSense Pro Mobile Platform

This folder contains the new mobile/platform build for StitchSense Pro.

Structure:

- `backend/stitchsense-api`: shared API used by mobile and, eventually, the WordPress web app.
- `ios/StitchSensePro`: SwiftUI iOS app source.
- `android`: Android/Kotlin Compose app source.
- `shared/api-contracts`: API contracts shared by clients and backend.
- `shared/design-tokens`: brand/design tokens shared by clients.
- `docs`: PDR, architecture, and build checklist.

The current WordPress plugin remains outside this folder and should stay stable while the mobile platform is built.
