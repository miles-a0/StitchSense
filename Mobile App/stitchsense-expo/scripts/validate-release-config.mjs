import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const easHook = process.argv.includes('--eas-hook');
const easProfile = process.env.EAS_BUILD_PROFILE?.trim() ?? '';

if (easHook && easProfile === 'development') {
  console.log('Release configuration check skipped for EAS development profile');
  process.exit(0);
}

const requireRevenueCat = process.argv.includes('--require-revenuecat') || easHook;
const appJsonPath = path.join(process.cwd(), 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = appJson.expo ?? {};
const extra = expo.extra ?? {};

const configured = (value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined);
const fromEnvOrApp = (envName, appValue) => configured(process.env[envName]) ?? configured(appValue);

const errors = [];

const placeholderPattern = /\b(change-me|changeme|example|placeholder|todo|test-key|your-|xxx)\b/i;

const isPrivateIpv4 = (hostname) => {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
};

const requireHttpsUrl = (name, value) => {
  if (!value) {
    errors.push(`${name} must be configured`);
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      errors.push(`${name} must use HTTPS`);
    }
    if (
      parsed.hostname === 'localhost'
      || parsed.hostname.endsWith('.localhost')
      || parsed.hostname === '0.0.0.0'
      || isPrivateIpv4(parsed.hostname)
    ) {
      errors.push(`${name} must point at a public release host`);
    }
    if (placeholderPattern.test(value)) {
      errors.push(`${name} must not use placeholder values`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
};

const requireIdentifier = (name, value) => {
  if (!/^[a-zA-Z0-9._:-]+$/.test(value ?? '')) {
    errors.push(`${name} must be a non-empty identifier`);
    return;
  }
  if (placeholderPattern.test(value)) {
    errors.push(`${name} must not use placeholder values`);
  }
};

const requireRevenueCatKey = (name, value, prefix) => {
  if (!value?.startsWith(prefix)) {
    errors.push(`${name} must be configured for store builds`);
    return;
  }
  if (value.length < prefix.length + 8 || placeholderPattern.test(value)) {
    errors.push(`${name} must use a real RevenueCat public SDK key`);
  }
};

if (expo.ios?.bundleIdentifier !== 'uk.co.zuauto.stitchsense') {
  errors.push('iOS bundleIdentifier must remain uk.co.zuauto.stitchsense');
}

if (expo.android?.package !== 'uk.co.zuauto.stitchsense') {
  errors.push('Android package must remain uk.co.zuauto.stitchsense');
}

requireHttpsUrl('EXPO_PUBLIC_API_BASE_URL', fromEnvOrApp('EXPO_PUBLIC_API_BASE_URL', extra.apiBaseUrl));
requireHttpsUrl('EXPO_PUBLIC_WORDPRESS_BASE_URL', fromEnvOrApp('EXPO_PUBLIC_WORDPRESS_BASE_URL', extra.wordpressBaseUrl));

const entitlementId = fromEnvOrApp('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID', extra.revenueCatEntitlementId);
requireIdentifier('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID', entitlementId);

if (requireRevenueCat) {
  const iosKey = fromEnvOrApp('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY', extra.revenueCatIosApiKey);
  const androidKey = fromEnvOrApp('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY', extra.revenueCatAndroidApiKey);
  const testStoreKey = fromEnvOrApp('EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY', extra.revenueCatTestStoreApiKey);

  requireRevenueCatKey('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY', iosKey, 'appl_');
  requireRevenueCatKey('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY', androidKey, 'goog_');
  if (testStoreKey) {
    errors.push('EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY must not be configured for store builds');
  }
}

if (errors.length > 0) {
  console.error('Release configuration check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Release configuration check passed');
