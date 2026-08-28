const appJson = require('./app.json');

const expo = appJson.expo ?? {};
const extra = expo.extra ?? {};

module.exports = () => ({
  ...expo,
  name: process.env.STITCHSENSE_EXPO_NAME || expo.name || 'StitchSense Expo',
  extra: {
    ...extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiBaseUrl,
    wordpressBaseUrl: process.env.EXPO_PUBLIC_WORDPRESS_BASE_URL || extra.wordpressBaseUrl,
  },
});
