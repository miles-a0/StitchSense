import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planForRevenueCatProduct,
  providerForRevenueCatStore,
  statusForRevenueCatEvent,
} from '../dist/routes/billing.js';

test('RevenueCat store values map to platform providers', () => {
  assert.equal(providerForRevenueCatStore('APP_STORE'), 'apple');
  assert.equal(providerForRevenueCatStore('MAC_APP_STORE'), 'apple');
  assert.equal(providerForRevenueCatStore('PLAY_STORE'), 'google');
  assert.equal(providerForRevenueCatStore('STRIPE'), null);
  assert.equal(providerForRevenueCatStore(undefined), null);
});

test('RevenueCat product ids map to Pro plans', () => {
  assert.equal(planForRevenueCatProduct('stitchsense_pro_monthly'), 'pro_monthly');
  assert.equal(planForRevenueCatProduct('stitchsense_pro_annual'), 'pro_annual');
  assert.equal(planForRevenueCatProduct('stitchsense_pro_yearly'), 'pro_annual');
  assert.equal(planForRevenueCatProduct(undefined), 'pro_monthly');
});

test('RevenueCat event statuses preserve paid access until expiry', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  const future = new Date('2026-07-16T12:00:00Z');
  const past = new Date('2026-05-16T12:00:00Z');

  assert.equal(statusForRevenueCatEvent('INITIAL_PURCHASE', null, now), 'active');
  assert.equal(statusForRevenueCatEvent('RENEWAL', null, now), 'active');
  assert.equal(statusForRevenueCatEvent('UNCANCELLATION', null, now), 'active');
  assert.equal(statusForRevenueCatEvent('CANCELLATION', future, now), 'active');
  assert.equal(statusForRevenueCatEvent('CANCELLATION', past, now), 'expired');
  assert.equal(statusForRevenueCatEvent('EXPIRATION', future, now), 'expired');
  assert.equal(statusForRevenueCatEvent('TRANSFER', future, now), 'expired');
});
