# StitchSense RevenueCat Subscriptions And Starling Payouts

RevenueCat is now the primary subscription-management layer for StitchSense mobile builds. Apple App Store and Google Play still process the customer payment; RevenueCat manages products, offerings, entitlements, restores, and webhook sync back into the StitchSense API.

## Target setup

- Subscription manager: RevenueCat.
- iOS payment processor: Apple in-app purchase / StoreKit.
- Android payment processor: Google Play Billing.
- Payout bank account: Starling Business, entered separately in App Store Connect and Google Play Console.
- StitchSense entitlement ID: `pro`.
- StitchSense user mapping: RevenueCat `appUserID` must equal the StitchSense backend user ID.
- Product cadence: monthly and annual Pro subscriptions.

## What is already implemented

- Expo app dependency: `react-native-purchases`.
- Mobile paywall/account/promo checkout actions use RevenueCat on iOS and Android.
- Restore purchases is available from the mobile paywall/account flow.
- Store subscription management opens the App Store / Google Play management URL when RevenueCat returns one.
- Stripe checkout remains available only as legacy/web fallback.
- Backend RevenueCat webhook endpoint exists at:

```text
https://stitchsense.zu-auto.co.uk/billing/revenuecat/webhook
```

## RevenueCat dashboard checklist

1. Create or open the StitchSense RevenueCat project.
2. Add an iOS app with bundle ID:

```text
uk.co.zuauto.stitchsense
```

3. Add an Android app with package name:

```text
uk.co.zuauto.stitchsense
```

4. Create the entitlement:

```text
pro
```

5. Create monthly and annual products in Apple App Store Connect and Google Play Console.
6. Import or connect those products in RevenueCat.
7. Attach both products to the `pro` entitlement.
8. Create a default offering that includes monthly and annual packages.
9. Add the RevenueCat webhook:

```text
POST https://stitchsense.zu-auto.co.uk/billing/revenuecat/webhook
Authorization: <REVENUECAT_WEBHOOK_AUTHORIZATION value from VPS env>
```

10. Copy the public app-specific RevenueCat SDK keys for iOS and Android into the Expo/EAS build environment:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

Only public RevenueCat SDK keys belong in the mobile app. The webhook authorization secret belongs only on the backend/VPS.

## Payout setup

RevenueCat does not collect or store StitchSense payout banking details. Use the Starling Business account in the store payment systems:

1. App Store Connect:
   - Sign the Paid Apps Agreement.
   - Add tax forms.
   - Enter the Starling Business bank details under banking information.
2. Google Play Console:
   - Complete merchant/payment profile setup.
   - Enter the Starling Business bank account as the payout destination.
   - Finish tax/identity verification.

## Testing checklist

- RevenueCat Test Store purchase in a development build.
- iOS sandbox purchase on a physical device or TestFlight build.
- Android licence-tester/internal-track purchase.
- Restore purchase after reinstall.
- Restore purchase after sign-out/sign-in.
- Cancel subscription and confirm Pro remains active until expiry.
- Expire/refund/revoke subscription and confirm backend entitlement is removed.
- Confirm RevenueCat webhook `app_user_id` maps only to the matching StitchSense user.

Expo Go can preview the screens, but real in-app purchases require an Expo development build, TestFlight, or Android internal/closed testing build.
