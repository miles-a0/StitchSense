# StitchSense Privacy And Data Safety Worksheet

Use this worksheet to align the public privacy policy, Apple privacy labels, and Google Data Safety answers with the actual SDKs and backend behaviour. Final wording still needs business/legal approval before public launch.

## Data Collection Inventory

| Data type | Examples | Purpose | Linked to user | Shared externally | Notes |
| --- | --- | --- | --- | --- | --- |
| Account information | Email, display name, StitchSense user ID | Authentication, support, account management | Yes | WordPress bridge where linked | Do not include passwords or tokens in support exports |
| Authentication data | Password hash, refresh/reset tokens | Sign-in and session security | Yes | No | Stored only server-side |
| User content | Patterns, project notes, counters, stash records, photos, chat/rewrite prompts and results | App functionality and AI assistance | Yes | n8n/AI workflows as required to answer user requests | Keep pattern context scoped to selected pattern |
| Files and images | Uploaded PDFs, project/stash photos, Stitch Vision images | Pattern storage, project/stash media, image analysis | Yes | Object storage and AI/image workflow providers | Files are private unless explicitly shared by the user |
| Purchase data | RevenueCat app user ID, product ID, entitlement status, store transaction metadata | Subscription access and support | Yes | RevenueCat, Apple, Google | Do not store store credentials or payment card data |
| Diagnostics | Request ID, route, status, timing, operational error class | Reliability, abuse detection, support | Potentially | Monitoring/alerting systems | Logs must not include secrets or full user-generated content |

## Apple Privacy Labels Draft

| Category | Collected | Linked to user | Used for tracking | Notes |
| --- | --- | --- | --- | --- |
| Contact Info | Yes | Yes | No | Email/display name for account and support |
| User Content | Yes | Yes | No | Patterns, projects, stash, chats, photos |
| Purchases | Yes | Yes | No | Subscription status through Apple/RevenueCat |
| Identifiers | Yes | Yes | No | User ID, RevenueCat app user ID |
| Diagnostics | Yes | Potentially | No | Request/error diagnostics, crash reporting once configured |
| Usage Data | Limited | Potentially | No | Operational events/audit records only |

## Google Data Safety Draft

| Question area | Draft answer | Notes |
| --- | --- | --- |
| Data encrypted in transit | Yes | App/API and WordPress endpoints must use HTTPS |
| Users can request deletion | Yes | App supports synced-data deletion and full account deletion |
| Data shared with third parties | Yes, for service functionality | RevenueCat, Apple/Google billing, n8n/AI workflows, object storage, WordPress bridge where linked |
| Data used for advertising | No | No ad SDK is part of the launch build |
| Data used for tracking | No | Do not add tracking SDKs without updating this worksheet and legal copy |

## SDK And Permission Declarations

| SDK / permission | Platform | Purpose | Store-facing wording |
| --- | --- | --- | --- |
| RevenueCat | iOS / Android | Native subscription purchase and entitlement sync | Subscriptions and restore purchases |
| Camera | iOS / Android | Stitch Vision image capture | Analyse knitting/crochet images chosen by the user |
| Photo library / media images | iOS / Android | Choose images and files for Stitch Vision, project, and stash media | Upload selected images only |
| Secure storage | iOS / Android | Store local session tokens | Keep the user signed in |

## Launch Approval

| Field | Value |
| --- | --- |
| Privacy policy URL |  |
| Terms URL |  |
| Subscription terms URL |  |
| Legal/business approver |  |
| Approval date |  |
| Follow-up issues |  |
