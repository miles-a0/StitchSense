// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // SDK 57's React Compiler lint is stricter than the current Expo codebase.
      // Keep the production lint gate useful while the affected screens are
      // refactored incrementally behind focused tests instead of broad rewrites.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
