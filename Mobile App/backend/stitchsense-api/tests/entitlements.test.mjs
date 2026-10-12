import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiContract = readFileSync(new URL('../../../shared/api-contracts/stitchsense-api.v1.yaml', import.meta.url), 'utf8');

const fullFeatures = {
  aiChat: true,
  patternUploads: true,
  ravelryImport: true,
  rewrite: true,
  stitchVision: true,
};

test('manual and store entitlement values are documented in API contract', () => {
  assert.match(
    apiContract,
    /enum: \[manual_lifetime, manual_trial, courtesy_access, stripe, apple, google, standard_trial, none\]/,
  );
  assert.match(apiContract, /ManualEntitlementGrantType:\n\s+type: string\n\s+enum: \[lifetime_pro, extended_trial, courtesy_access\]/);
  assert.match(apiContract, /ManualEntitlementGrantRequest:[\s\S]*reason:[\s\S]*maxLength: 500/);
  assert.match(apiContract, /\/me\/entitlements:[\s\S]*#\/components\/schemas\/EntitlementResponse/);
  assert.match(apiContract, /EntitlementResponse:[\s\S]*#\/components\/schemas\/Entitlement/);
  assert.match(apiContract, /\/billing\/revenuecat\/webhook:/);
  assert.match(apiContract, /RevenueCatWebhookRequest:[\s\S]*RevenueCatWebhookEvent/);
  assert.match(apiContract, /RevenueCatWebhookEvent:[\s\S]*required: \[id, type, app_user_id\]/);
  assert.match(apiContract, /store:[\s\S]*enum: \[APP_STORE, MAC_APP_STORE, PLAY_STORE\]/);
  assert.match(apiContract, /RevenueCatWebhookResponse:/);
  assert.match(apiContract, /\/admin\/users\/access:/);
  assert.match(apiContract, /AdminUserAccessList:[\s\S]*AdminUserAccessSummary/);
  assert.match(apiContract, /\/admin\/entitlements:/);
});

test('feature access requires active or trialing entitlement status', async () => {
  const { hasFeature } = await import('../dist/services/entitlements.js');
  const baseEntitlement = {
    accessSource: 'manual_lifetime',
    features: fullFeatures,
    plan: 'pro',
    trialEndsAt: null,
  };

  assert.equal(hasFeature({ ...baseEntitlement, status: 'active' }, 'aiChat'), true);
  assert.equal(hasFeature({ ...baseEntitlement, status: 'trialing' }, 'aiChat'), true);
  assert.equal(hasFeature({ ...baseEntitlement, status: 'expired' }, 'aiChat'), false);
  assert.equal(
    hasFeature(
      {
        ...baseEntitlement,
        features: { ...fullFeatures, aiChat: false },
        status: 'active',
      },
      'aiChat',
    ),
    false,
  );
});
