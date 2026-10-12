import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'validate-release-config.mjs');

type AppConfigOptions = {
  androidPackage?: string;
  apiBaseUrl?: string;
  entitlementId?: string;
  iosBundleIdentifier?: string;
  revenueCatAndroidApiKey?: string;
  revenueCatIosApiKey?: string;
  revenueCatTestStoreApiKey?: string;
  wordpressBaseUrl?: string;
};

const validOptions: Required<AppConfigOptions> = {
  androidPackage: 'uk.co.zuauto.stitchsense',
  apiBaseUrl: 'https://stitchsense.zu-auto.co.uk',
  entitlementId: 'pro',
  iosBundleIdentifier: 'uk.co.zuauto.stitchsense',
  revenueCatAndroidApiKey: 'goog_livepublic123',
  revenueCatIosApiKey: 'appl_livepublic123',
  revenueCatTestStoreApiKey: '',
  wordpressBaseUrl: 'https://catlowyarns.co.uk',
};

const writeAppJson = (directory: string, overrides: AppConfigOptions = {}) => {
  const options = { ...validOptions, ...overrides };
  writeFileSync(
    path.join(directory, 'app.json'),
    JSON.stringify(
      {
        expo: {
          android: {
            package: options.androidPackage,
          },
          extra: {
            apiBaseUrl: options.apiBaseUrl,
            revenueCatAndroidApiKey: options.revenueCatAndroidApiKey,
            revenueCatEntitlementId: options.entitlementId,
            revenueCatIosApiKey: options.revenueCatIosApiKey,
            revenueCatTestStoreApiKey: options.revenueCatTestStoreApiKey,
            wordpressBaseUrl: options.wordpressBaseUrl,
          },
          ios: {
            bundleIdentifier: options.iosBundleIdentifier,
          },
        },
      },
      null,
      2,
    ),
  );
};

const runReleaseConfig = (
  overrides: AppConfigOptions = {},
  args = ['--require-revenuecat'],
  envOverrides: Record<string, string> = {},
) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'stitchsense-release-config-'));
  try {
    writeAppJson(directory, overrides);
    return spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_API_BASE_URL: '',
        EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: '',
        EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: '',
        EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '',
        EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: '',
        EXPO_PUBLIC_WORDPRESS_BASE_URL: '',
        ...envOverrides,
      },
    });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

test('release config accepts production identifiers, public HTTPS URLs, and RevenueCat keys', () => {
  const result = runReleaseConfig();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release configuration check passed/);
});

test('release config rejects local, private, and placeholder release endpoints', () => {
  const result = runReleaseConfig({
    apiBaseUrl: 'https://localhost:4445',
    wordpressBaseUrl: 'https://192.168.1.20',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPO_PUBLIC_API_BASE_URL must point at a public release host/);
  assert.match(result.stderr, /EXPO_PUBLIC_WORDPRESS_BASE_URL must point at a public release host/);

  const placeholderResult = runReleaseConfig({
    apiBaseUrl: 'https://example.com',
  });
  assert.notEqual(placeholderResult.status, 0);
  assert.match(placeholderResult.stderr, /EXPO_PUBLIC_API_BASE_URL must not use placeholder values/);
});

test('release config rejects placeholder RevenueCat keys and unsafe app identifiers', () => {
  const result = runReleaseConfig({
    androidPackage: 'com.example.stitchsense',
    entitlementId: 'todo',
    iosBundleIdentifier: 'com.example.stitchsense',
    revenueCatAndroidApiKey: 'goog_test',
    revenueCatIosApiKey: 'appl_test',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /iOS bundleIdentifier must remain uk\.co\.zuauto\.stitchsense/);
  assert.match(result.stderr, /Android package must remain uk\.co\.zuauto\.stitchsense/);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID must not use placeholder values/);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY must use a real RevenueCat public SDK key/);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY must use a real RevenueCat public SDK key/);
});

test('release config does not accept Test Store key as a production RevenueCat key', () => {
  const result = runReleaseConfig(
    {
      revenueCatAndroidApiKey: '',
      revenueCatIosApiKey: '',
    },
    ['--require-revenuecat'],
    {
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: 'rc_test_public_key',
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY must be configured for store builds/);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY must be configured for store builds/);
});

test('release config rejects Test Store key even when production RevenueCat keys are present', () => {
  const result = runReleaseConfig(
    {},
    ['--require-revenuecat'],
    {
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: 'rc_test_public_key',
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY must not be configured for store builds/);
});

test('EAS hook skips development builds even with a Test Store key', () => {
  const result = runReleaseConfig(
    { revenueCatAndroidApiKey: '', revenueCatIosApiKey: '', revenueCatTestStoreApiKey: 'rc_test_public_key' },
    ['--eas-hook'],
    { EAS_BUILD_PROFILE: 'development' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipped for EAS development profile/);
});

test('EAS hook enforces store rules for preview, production, and unknown profiles', () => {
  for (const profile of ['preview', 'production', 'release-candidate', '']) {
    const result = runReleaseConfig({}, ['--eas-hook'], {
      EAS_BUILD_PROFILE: profile,
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: 'rc_test_public_key',
    });

    assert.notEqual(result.status, 0, `profile "${profile}" should fail closed`);
    assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY must not be configured for store builds/);
  }

  const production = runReleaseConfig({}, ['--eas-hook'], { EAS_BUILD_PROFILE: 'production' });
  assert.equal(production.status, 0, production.stderr);
});

test('release config rejects app config Test Store key for store builds', () => {
  const result = runReleaseConfig({
    revenueCatTestStoreApiKey: 'rc_test_public_key',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY must not be configured for store builds/);
});
