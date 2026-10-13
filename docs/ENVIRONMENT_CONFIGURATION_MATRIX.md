# StitchSense Environment Configuration Matrix

Use this to verify development, staging, preview, and production configuration without recording secret values.

Use `docs/EAS_ENVIRONMENT_SETUP_CHECKLIST.md` for the detailed EAS environment and public app config setup before creating preview or production native builds.

## Backend

| Setting area | Development | Staging | Production | Evidence / notes |
| --- | --- | --- | --- | --- |
| API base URL | Local dev or production default for Expo Go | `https://staging-stitchsense.zu-auto.co.uk` | `https://stitchsense.zu-auto.co.uk` | Staging URL is present in `.env.staging.example`; production URL is the app default and service inventory endpoint. |
| Database | Local/test | Separate staging | Production | Staging uses `stitchsense_staging`; production uses `stitchsense_mobile`; secret values are not recorded. |
| Object storage | Local/test MinIO where needed | Separate bucket | Production bucket | Staging bucket is `stitchsense-patterns-staging`; production bucket is `stitchsense-patterns`. |
| WordPress bridge host | Approved dev/test host only | `https://staging.catlowyarns.co.uk` | `https://catlowyarns.co.uk` | Staging must never use the live WordPress host; see `docs/STAGING_ENVIRONMENT.md`. |
| n8n workflow URLs | Local/mock or configured dev URLs | HTTPS `staging-*` n8n webhook URLs | HTTPS production URLs | Exact production/staging workflow contracts still need release rehearsal evidence. |
| RevenueCat webhook auth | Not required for Expo Go | Configured in backend and RevenueCat | Configured in backend and RevenueCat | Values must remain backend/RevenueCat only, never EAS public config. |
| RevenueCat REST API key | Not required for Expo Go unless testing backend sync | Configured in backend | Configured in backend | Backend-only secret used by `/billing/revenuecat/sync`; never put this in EAS public config. |
| Metrics secret | Optional | Configured where scraped | Configured | Values must remain backend/monitoring only. |

## Mobile / EAS

| Setting area | Development | Preview/Internal | Production | Evidence / notes |
| --- | --- | --- | --- | --- |
| EAS channel | development | preview | production |  |
| API URL | Configurable for Expo Go | `https://staging-stitchsense.zu-auto.co.uk` or approved acceptance API | `https://stitchsense.zu-auto.co.uk` | Must be verified from the built app before submission. |
| WordPress base URL | `https://catlowyarns.co.uk` | `https://catlowyarns.co.uk` | `https://catlowyarns.co.uk` | Approved WordPress host. |
| RevenueCat iOS public key | Optional for Expo Go | Pending EAS value | Pending EAS value | Public SDK key only; no backend secrets. |
| RevenueCat Android public key | Optional for Expo Go | Pending EAS value | Pending EAS value | Public SDK key only; no backend secrets. |
| Entitlement ID | `pro` | `pro` | `pro` |  |

## Decision

| Field | Value |
| --- | --- |
| Environment decision | Hold |
| Decision owner |  |
| Decision time | 2026-10-06 |
| Follow-up issues | Confirm EAS environment values, RevenueCat SDK keys, staging workflow contracts, and production build config before creating signed release candidates. |
