const configured = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

module.exports = ({ config }) => {
  const easProjectId = configured(process.env.STITCHSENSE_EAS_PROJECT_ID) || configured(config.extra?.eas?.projectId);

  return {
    ...config,
    owner: configured(process.env.STITCHSENSE_EXPO_OWNER) || configured(config.owner),
    name: configured(process.env.STITCHSENSE_EXPO_NAME) || config.name || 'StitchSense Expo',
    updates: easProjectId
      ? {
          ...(config.updates ?? {}),
          url: `https://u.expo.dev/${easProjectId}`,
        }
      : config.updates,
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
      revenueCatTestStoreApiKey:
        configured(process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY) ||
        configured(config.extra?.revenueCatTestStoreApiKey),
      sentryDsn: configured(process.env.EXPO_PUBLIC_SENTRY_DSN) || configured(config.extra?.sentryDsn),
      revenueCatEntitlementId:
        configured(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID) ||
        configured(config.extra?.revenueCatEntitlementId) ||
        'pro',
      eas: easProjectId
        ? {
            ...(config.extra?.eas ?? {}),
            projectId: easProjectId,
          }
        : config.extra?.eas,
    },
  };
};
