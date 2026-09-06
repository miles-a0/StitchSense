# StitchSense Stripe Subscriptions Setup

Status: legacy / web-only fallback.

StitchSense mobile subscriptions should now be managed through RevenueCat, with Apple App Store and Google Play handling customer payments and payouts. Keep this Stripe guide only for existing Stripe subscribers, permitted non-store web checkout, or legacy account migration. Do not use Stripe Checkout as the primary iOS or Android digital-subscription purchase path.

This guide sets up StitchSense app subscriptions in a Stripe account that is completely separate from WooCommerce.

The subscription flow is:

1. New users get a free trial for up to 1 month.
2. After the trial ends, Pro features are locked until the user subscribes.
3. Users can buy either:
   - Monthly: `GBP 10 / month`
   - Annual: `GBP 96 / year`
4. Existing Stripe subscribers manage changes in the Stripe Customer Portal.
5. Users can cancel at any point, but there are no automatic refunds.
6. Cancelled users keep Pro access until the end of the paid billing period.

Important: do not use your WooCommerce Stripe account keys unless you intentionally want StitchSense subscriptions to use the same Stripe account. The recommended setup is a separate Stripe account or separate Stripe business/account profile for StitchSense subscriptions.

## 1. Create Or Open The Separate Stripe Account

1. Go to Stripe Dashboard.
2. Make sure you are in the Stripe account you want to use for StitchSense app subscriptions.
3. Confirm this is not the WooCommerce Stripe account.
4. Start in test mode. Do not begin in live mode.

You should see a Test mode toggle in Stripe Dashboard. Keep it on for the first setup.

## 2. Create The Monthly Product And Price

1. In Stripe Dashboard, open Product catalog.
2. Create a product called `StitchSense Pro`.
3. Add a recurring monthly price:
   - Currency: `GBP`
   - Amount: `10.00`
   - Billing period: `Monthly`
4. Save it.
5. Copy the monthly price ID. It starts with `price_`.

You need this value later as:

```bash
STRIPE_MONTHLY_PRICE_ID=price_...
```

## 3. Create The Annual Price

Use the same `StitchSense Pro` product.

1. Add another recurring price.
2. Set:
   - Currency: `GBP`
   - Amount: `96.00`
   - Billing period: `Yearly`
3. Save it.
4. Copy the annual price ID. It starts with `price_`.

You need this value later as:

```bash
STRIPE_ANNUAL_PRICE_ID=price_...
```

## 4. Configure The Stripe Customer Portal

The Customer Portal is what lets users manage billing from inside the app.

1. In Stripe Dashboard, open Billing.
2. Open Customer portal.
3. Enable the portal.
4. Allow customers to:
   - Update payment method
   - View invoices
   - Cancel subscriptions
   - Change plans between monthly and annual
5. For cancellation, choose cancellation at the end of the billing period.
6. Do not configure automatic refunds.
7. Save the portal settings.

This gives the behaviour you want:

- If a monthly user cancels, they keep access until the current month ends.
- If an annual user cancels, they keep access until the current year ends.
- No refund is automatically issued.
- The app reads the Stripe subscription period and keeps access active until it expires.

## 5. Create The Stripe Webhook

The webhook is what tells StitchSense when a user has paid, renewed, changed plan, or cancelled.

1. In Stripe Dashboard, open Developers.
2. Open Webhooks.
3. Add an endpoint.
4. Endpoint URL:

```text
https://stitchsense.zu-auto.co.uk/billing/webhook
```

5. Add these events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

6. Save the webhook.
7. Open the webhook you just created.
8. Reveal and copy the signing secret. It starts with `whsec_`.

You need this value later as:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 6. Copy Your Stripe API Keys

In Stripe Dashboard:

1. Open Developers.
2. Open API keys.
3. Copy the publishable key. It starts with `pk_test_` in test mode.
4. Copy or create a secret key. It starts with `sk_test_` in test mode.

You need the secret key later as:

```bash
STRIPE_SECRET_KEY=sk_test_...
```

The WordPress admin page also has a field for the publishable key so you can keep the full subscription config visible in one place.

## 7. Configure WordPress Admin

Install or update the StitchSense Pro plugin version that includes the Stripe Subscriptions page.

Then in WordPress:

1. Open `StitchSense Pro`.
2. Open `Stripe Subscriptions`.
3. Set Mode to `Test / sandbox`.
4. Paste:
   - Publishable key
   - Secret key
   - Webhook signing secret
   - Monthly price ID
   - Annual price ID
5. Tick `Stripe Customer Portal is configured` after completing the portal setup.
6. Save.
7. Click `Test Stripe Price IDs`.

The status table should show:

- Platform API: OK
- Publishable key: OK
- Secret key: OK
- Webhook signing secret: OK
- Monthly price ID: OK
- Annual price ID: OK
- Customer portal: OK
- Stripe monthly price check: OK
- Stripe annual price check: OK

This WordPress page is for setup visibility and debugging. The mobile API still reads the live runtime Stripe values from the VPS `.env.vps` file.

## 8. Configure The VPS API Environment

SSH into the VPS:

```bash
ssh root@173.249.40.161
```

Open the backend folder:

```bash
cd /opt/stitchsense-mobile/backend
```

Edit the API environment file:

```bash
nano stitchsense-api/.env.vps
```

Add or update these values using the real values from Stripe:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_ANNUAL_PRICE_ID=price_...
```

Save the file.

Restart the API:

```bash
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d --build api
```

Check the API:

```bash
curl -i https://stitchsense.zu-auto.co.uk/health
```

You should get `200 OK`.

## 9. Test Checkout In The App

Start Expo:

```bash
cd "/Users/andrewmagill/DEV/StitchSense"
./tools/start-stitchsense-expo.sh
```

In the app:

1. Sign in as a test user.
2. Open Account.
3. Open the Pro/paywall screen.
4. Choose Monthly or Annual.
5. Continue to Stripe checkout.
6. Use Stripe test card:

```text
4242 4242 4242 4242
```

Use any future expiry date, any CVC, and any postcode.

After payment:

1. Return to the app.
2. Tap `Refresh account status`.
3. The account should show active Pro access.

## 10. Test Webhook Delivery

In Stripe Dashboard:

1. Open Developers.
2. Open Webhooks.
3. Open your StitchSense webhook endpoint.
4. Check Recent deliveries.

You should see successful `2xx` deliveries for:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
```

If Stripe shows failed delivery:

1. Check the webhook URL is exactly:

```text
https://stitchsense.zu-auto.co.uk/billing/webhook
```

2. Check `STRIPE_WEBHOOK_SECRET` in `.env.vps`.
3. Restart the API.
4. Retry the webhook in Stripe.

## 11. Test Monthly To Annual Change

For an existing Stripe subscriber, the app should not create a second checkout.

Instead:

1. Open the Pro/paywall screen.
2. Tap `Manage or change plan`.
3. Stripe Customer Portal opens.
4. Change from monthly to annual.
5. Confirm the change in Stripe.
6. Return to the app.
7. Tap `Refresh account status`.

The entitlement should remain active and the plan should update after Stripe sends the webhook.

## 12. Test Cancellation

In the app:

1. Open Account.
2. Open the Pro/paywall screen.
3. Tap `Manage Stripe billing` or `Manage or change plan`.
4. In Stripe Customer Portal, cancel the subscription.
5. Confirm cancellation.

Expected behaviour:

- The user is not refunded automatically.
- The Stripe subscription is marked to cancel at period end.
- The app continues to show Pro access until the paid period ends.
- After the period ends, Stripe sends the final subscription update/deletion.
- The app entitlement becomes expired.
- Pro features then require a new subscription.

## 13. Switch From Test Mode To Live Mode

Only switch to live after testing:

- Monthly checkout
- Annual checkout
- Webhook success
- Refresh account status
- Monthly to annual plan change
- Cancellation at period end
- Access remains active until period end

Then:

1. In Stripe Dashboard, turn off test mode.
2. Recreate or confirm the live monthly and annual prices.
3. Create the live webhook endpoint:

```text
https://stitchsense.zu-auto.co.uk/billing/webhook
```

4. Copy the live values:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_ANNUAL_PRICE_ID=price_...
```

5. In WordPress `StitchSense Pro > Stripe Subscriptions`, switch Mode to `Live`.
6. Save the live publishable key, secret key, webhook secret, and live price IDs.
7. Click `Test Stripe Price IDs`.
8. Update `/opt/stitchsense-mobile/backend/stitchsense-api/.env.vps` with the same live values.
9. Restart the API:

```bash
cd /opt/stitchsense-mobile/backend
docker compose --env-file stitchsense-api/.env.vps -f docker-compose.vps.yml up -d --build api
```

## 14. Useful VPS Debug Commands

Check API health:

```bash
curl -i https://stitchsense.zu-auto.co.uk/health
```

Check recent API logs:

```bash
cd /opt/stitchsense-mobile/backend
docker logs stitchsense-api --tail 150
```

Confirm Stripe variables are present without printing the secret values:

```bash
cd /opt/stitchsense-mobile/backend
docker exec stitchsense-api sh -lc 'node -e "for (const key of [\"STRIPE_SECRET_KEY\",\"STRIPE_WEBHOOK_SECRET\",\"STRIPE_MONTHLY_PRICE_ID\",\"STRIPE_ANNUAL_PRICE_ID\"]) console.log(key, process.env[key] ? \"set\" : \"missing\")"'
```

## 15. What Each System Does

Stripe:

- Takes payment.
- Stores the subscription.
- Hosts checkout.
- Hosts the customer billing portal.
- Sends webhooks when subscriptions change.

StitchSense API:

- Creates Stripe checkout sessions.
- Creates Stripe customer portal sessions.
- Receives Stripe webhooks.
- Stores subscription state.
- Decides whether the user has Pro access.

StitchSense mobile app:

- Shows the paywall.
- Sends new users to checkout.
- Sends existing Stripe subscribers to the billing portal.
- Lets users refresh their account status.
- Locks Pro features when access expires.

WordPress plugin:

- Shows the separate StitchSense Stripe subscription setup page.
- Stores setup values for admin visibility.
- Runs price ID diagnostics.
- Keeps this separate from WooCommerce Stripe.

## 16. Official Stripe References

Use these if Stripe moves a screen or you want to double-check the setup:

- Stripe Customer Portal: https://docs.stripe.com/customer-management
- Stripe test cards and sandbox testing: https://docs.stripe.com/testing
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe subscription checkout: https://docs.stripe.com/billing/subscriptions/build-subscriptions
