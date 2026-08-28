# Security Review Checklist

## Authentication

- [ ] Access tokens expire quickly.
- [ ] Refresh tokens rotate and can be revoked.
- [ ] WordPress bridge secret is stored server-side only.
- [ ] Mobile clients never store workflow secrets.
- [ ] Admin endpoints require admin role.

## Authorization

- [ ] Users can access only their own patterns.
- [ ] Users can access only their own chat sessions and messages.
- [ ] Users can access only their own rewrites.
- [ ] Signed file URL route checks ownership before issuing a URL.
- [ ] Admin entitlement grants and revocations are audit logged.

## Billing

- [ ] Stripe webhook signature validation is enabled in production.
- [ ] RevenueCat webhook authorization is enabled in production.
- [ ] App Store and Play purchases map to the correct StitchSense user ID.
- [ ] Manual lifetime access overrides expired subscriptions.
- [ ] Expired trials cannot call paid AI workflows.

## Storage

- [ ] Object storage bucket is private.
- [ ] Signed URLs have short expiry.
- [ ] Existing WordPress file URLs are reviewed before migration.
- [ ] Upload file size and type limits are enforced.

## AI Workflows

- [ ] n8n URLs are server-side only.
- [ ] n8n shared secret is server-side only.
- [ ] AI routes check entitlements before workflow calls.
- [ ] Workflow errors do not leak secrets or provider credentials.

## Privacy

- [ ] Privacy policy matches collected data.
- [ ] App Store privacy labels match SDKs and backend behaviour.
- [ ] Google Play Data safety answers match SDKs and backend behaviour.
- [ ] Account export works.
- [ ] Account delete works.

## Mobile Builds

- [ ] iOS RevenueCat package added in Xcode.
- [ ] iOS release build tested on physical iPhone.
- [ ] Android Gradle wrapper added.
- [ ] Android build tested with JDK 17+.
- [ ] No test RevenueCat keys in production builds.

## WordPress Sync

- [ ] Platform API toggle defaults off.
- [ ] Platform bridge secret is not printed to the browser.
- [ ] Web upload then mobile open passes.
- [ ] Mobile upload then web open passes.
- [ ] Chat/rewrite sync expectations are verified.
