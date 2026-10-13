// Sentry's Expo Metro config adds stable debug IDs so crash reports map back to source.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
