# Architecture and Sync Plan

## Target Architecture

```text
iOS SwiftUI App          Android Compose App          WordPress Web App
       |                         |                         |
       +------------- StitchSense API ---------------------+
                              |
           +------------------+------------------+
           |                  |                  |
       PostgreSQL       Object Storage          n8n
           |                  |                  |
       user data        pattern files       AI workflows
```

## Why This Architecture

The mobile app and web app need to stay in sync. The safest way to achieve that is to make both web and mobile clients talk to the same backend and database. The current WordPress plugin already has good concepts, but the mobile app needs token-based auth, signed file access, billing entitlements, and stable API contracts. Those are better owned by a dedicated API service.

## Existing Data To Preserve

Current PostgreSQL tables:
- `user_patterns`
- `chat_sessions`
- `chat_messages`
- `rewrite_sessions`
- `user_connections`
- `user_settings`

Current fallback store:
- WordPress user meta keys prefixed with `stitchsense_library_`

Migration plan:
1. Export WordPress fallback pattern data.
2. Map WordPress user IDs to shared backend users.
3. Import patterns, chats, messages, rewrites, settings.
4. Preserve existing file URLs initially.
5. Optionally copy files into object storage and replace URLs with storage keys.

## Identity Strategy

Short term:
- Support current WordPress users.
- API can accept WordPress-issued session/JWT bridge for web.
- WordPress can call `POST /auth/wordpress` server-to-server with `x-stitchsense-wordpress-secret` to exchange a verified WP user identity for normal StitchSense API tokens.

Long term:
- Dedicated StitchSense accounts.
- Link WordPress account to StitchSense account.
- Support Apple, Google, and email login.

Recommended tables:
- `users`
- `linked_accounts`
- `subscriptions`
- `entitlements`
- `manual_entitlements`
- `audit_events`

## Storage Strategy

Best long-term option:
- S3-compatible storage such as Cloudflare R2, AWS S3, or MinIO.
- Store private files by key, not public permanent URL.
- Generate short-lived signed URLs for viewing/downloading.

Current compatibility:
- Existing `file_url` can continue to work while migrating.
- New uploads should write to object storage and store `file_key`.

Recommended schema additions:
- `user_patterns.file_key`
- `user_patterns.file_size`
- `user_patterns.file_mime_type`
- `user_patterns.file_extension`
- `user_patterns.storage_provider`
- `user_patterns.source_url`

## Sync Model

Mobile maintains:
- Local metadata cache.
- Recently opened files.
- Pending write queue.

Backend exposes:
- `GET /sync?since=timestamp`
- `POST /sync/events`

Sync rules:
- Pattern metadata: latest `updated_at` wins.
- Chat messages: append-only.
- Rewrite sessions: append-only.
- Deleted/archived items: tombstone records with `deleted_at` or `is_archived`.
- Files: upload once, store immutable file key.

## n8n Workflow Integration

Mobile should never call n8n directly.

Flow:
1. Mobile sends request to StitchSense API.
2. API checks auth, entitlement, limits.
3. API creates workflow job record.
4. API calls n8n with secret server-side.
5. n8n returns result or posts completion webhook.
6. API stores result and returns it to client.

This gives:
- Central rate limiting.
- Billing enforcement.
- Better error reporting.
- No exposed workflow secrets.

## Billing Entitlements

The API should answer a simple question for every client: what can this user do right now?

Example entitlement response:

```json
{
  "plan": "pro_monthly",
  "status": "active",
  "trialEndsAt": "2026-07-16T00:00:00Z",
  "accessSource": "stripe",
  "features": {
    "patternUploads": true,
    "aiChat": true,
    "rewrite": true,
    "stitchVision": true,
    "ravelryImport": true
  }
}
```

Entitlement checks should happen on:
- Upload analysis.
- Chat.
- Rewrite.
- Stitch Vision.
- Ravelry import.

Billing inputs:
- Stripe Checkout/webhooks update `subscriptions` for web purchases.
- RevenueCat Android/iOS webhooks update `subscriptions` for Play Store and App Store purchases.
- Mobile clients identify RevenueCat users with the StitchSense `users.id` value so backend webhooks can map purchases to the same account used by web, iOS, and Android.
- Admin grants remain in `manual_entitlements` and take priority over paid subscriptions.

## Admin-Granted Access

The backend should support manual access grants so admins can bypass or extend the paywall for specific users.

Recommended `manual_entitlements` fields:
- `id`
- `user_id`
- `type`: `lifetime_pro`, `extended_trial`, `courtesy_access`
- `starts_at`
- `expires_at`, nullable for lifetime access
- `reason`
- `granted_by_user_id`
- `revoked_at`
- `revoked_by_user_id`
- `created_at`
- `updated_at`

Resolution order:
1. If a non-revoked lifetime grant exists, return full Pro access.
2. If a paid subscription is active, return paid Pro access.
3. If a non-revoked manual timed grant is active, return full Pro access until `expires_at`.
4. If the standard trial is active, return trial access.
5. Otherwise return expired access and require payment.

Admin UI requirements:
- Search user by email/name.
- Grant lifetime access.
- Grant access until a selected date.
- Revoke access.
- View reason, grant history, and current entitlement source.
- Log all grants/revocations to `audit_events`.

## WordPress Plugin Relationship

Phase 1:
- Leave plugin working as-is.
- Mobile backend can read/migrate current data.

Phase 2:
- Plugin starts using the shared API for library data.
- Existing WordPress UI remains familiar.
- Plugin authenticates users through the WordPress bridge endpoint, then calls shared API routes with the returned bearer token.
- The plugin exposes the platform API base URL, bridge secret, and enable toggle under the existing StitchSense Pro admin settings. The toggle defaults off so the existing WordPress/PostgreSQL fallback behaviour remains unchanged until deliberately enabled.

Phase 3:
- WordPress plugin becomes a web client of the StitchSense platform.
- Admin screens can show platform data rather than local fallback data.
