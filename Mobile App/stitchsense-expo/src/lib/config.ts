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

const configured = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

export const config = {
  apiBaseUrl: configured(extra?.apiBaseUrl) ?? 'https://stitchsense.zu-auto.co.uk',
  wordpressBaseUrl: configured(extra?.wordpressBaseUrl) ?? 'https://catlowyarns.co.uk',
  revenueCat: {
    iosApiKey:
      configured(extra?.revenueCatIosApiKey) ?? configured(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) ?? '',
    androidApiKey:
      configured(extra?.revenueCatAndroidApiKey) ??
      configured(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) ??
      '',
    entitlementId:
      configured(extra?.revenueCatEntitlementId) ??
      configured(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID) ??
      'pro',
  },
};
