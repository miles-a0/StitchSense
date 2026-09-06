import Constants from 'expo-constants';

const expoConfig = Constants.expoConfig;
const extra = expoConfig?.extra as
  | {
      apiBaseUrl?: string;
      wordpressBaseUrl?: string;
      revenueCatIosApiKey?: string;
      revenueCatAndroidApiKey?: string;
      revenueCatEntitlementId?: string;
    }
  | undefined;

export const config = {
  apiBaseUrl: extra?.apiBaseUrl ?? 'https://stitchsense.zu-auto.co.uk',
  wordpressBaseUrl: extra?.wordpressBaseUrl ?? 'https://catlowyarns.co.uk',
  revenueCat: {
    iosApiKey: extra?.revenueCatIosApiKey ?? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
    androidApiKey: extra?.revenueCatAndroidApiKey ?? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
    entitlementId: extra?.revenueCatEntitlementId ?? process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'pro',
  },
};
