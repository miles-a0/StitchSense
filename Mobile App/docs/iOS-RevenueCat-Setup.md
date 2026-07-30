# iOS RevenueCat Setup

The iOS app includes a guarded `BillingManager` wrapper. It compiles without RevenueCat present, then activates automatically once the RevenueCat Swift package is added and `REVENUECAT_IOS_API_KEY` is set.

## Xcode Package

Add this Swift Package Manager dependency in Xcode:

- URL: `https://github.com/RevenueCat/purchases-ios-spm.git`
- Dependency rule: `Up to Next Major Version`
- Minimum version: `5.0.0`
- Products: `RevenueCat`, `RevenueCatUI`

RevenueCat's current iOS docs recommend this SPM mirror and the `5.0.0 < 6.0.0` rule.

## Build Settings

Set these build settings for the app target:

- `REVENUECAT_IOS_API_KEY`: public Apple app-specific RevenueCat SDK key.
- `REVENUECAT_ENTITLEMENT_ID`: `pro` unless the RevenueCat dashboard uses a different entitlement identifier.

Do not use a RevenueCat secret key in the app. The backend webhook uses `REVENUECAT_WEBHOOK_AUTHORIZATION` separately.
