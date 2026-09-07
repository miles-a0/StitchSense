const configured = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

module.exports = ({ config }) => ({
  ...config,
  name: configured(process.env.STITCHSENSE_EXPO_NAME) || config.name || 'StitchSense Expo',
  extra: {
    ...config.extra,
    apiBaseUrl: configured(process.env.EXPO_PUBLIC_API_BASE_URL) || configured(config.extra?.apiBaseUrl),
    wordpressBaseUrl:
      configured(process.env.EXPO_PUBLIC_WORDPRESS_BASE_URL) || configured(config.extra?.wordpressBaseUrl),
    revenueCatIosApiKey:
      configured(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) ||
      configured(config.extra?.revenueCatIosApiKey),
    revenueCatAndroidApiKey:
      configured(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) ||
      configured(config.extra?.revenueCatAndroidApiKey),
    revenueCatEntitlementId:
      configured(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID) ||
      configured(config.extra?.revenueCatEntitlementId) ||
      'pro',
  },
});
