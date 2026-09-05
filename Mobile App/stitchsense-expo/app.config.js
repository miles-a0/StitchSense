module.exports = ({ config }) => ({
  ...config,
  name: process.env.STITCHSENSE_EXPO_NAME || config.name || 'StitchSense Expo',
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || config.extra?.apiBaseUrl,
    wordpressBaseUrl: process.env.EXPO_PUBLIC_WORDPRESS_BASE_URL || config.extra?.wordpressBaseUrl,
  },
});
