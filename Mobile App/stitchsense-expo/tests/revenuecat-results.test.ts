import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapRevenueCatPurchaseError,
  revenueCatNetworkErrorMessage,
  revenueCatUnavailableMessage,
} from '../src/lib/revenuecat-results';

test('RevenueCat purchase errors map store edge states to stable app states', () => {
  assert.equal(mapRevenueCatPurchaseError({ userCancelled: true }), 'cancelled');
  assert.equal(mapRevenueCatPurchaseError({ code: '1' }), 'cancelled');
  assert.equal(mapRevenueCatPurchaseError({ userInfo: { readableErrorCode: 'PURCHASE_CANCELLED_ERROR' } }), 'cancelled');

  assert.equal(mapRevenueCatPurchaseError({ code: 20 }), 'pending');
  assert.equal(mapRevenueCatPurchaseError({ userInfo: { readableErrorCode: 'PAYMENT_PENDING_ERROR' } }), 'pending');

  assert.equal(mapRevenueCatPurchaseError({ code: '6' }), 'already_purchased');
  assert.equal(mapRevenueCatPurchaseError({ userInfo: { readableErrorCode: 'PRODUCT_ALREADY_PURCHASED_ERROR' } }), 'already_purchased');
});

test('RevenueCat purchase errors distinguish network and configuration failures', () => {
  assert.equal(mapRevenueCatPurchaseError({ code: '10' }), 'network');
  assert.equal(mapRevenueCatPurchaseError({ code: '35' }), 'network');
  assert.equal(mapRevenueCatPurchaseError({ userInfo: { readableErrorCode: 'PRODUCT_REQUEST_TIMED_OUT_ERROR' } }), 'network');
  assert.match(revenueCatNetworkErrorMessage(), /check your connection/i);

  assert.equal(mapRevenueCatPurchaseError({ code: '5' }), 'configuration');
  assert.equal(mapRevenueCatPurchaseError({ code: '23' }), 'configuration');
  assert.equal(mapRevenueCatPurchaseError({ userInfo: { readableErrorCode: 'INVALID_CREDENTIALS_ERROR' } }), 'configuration');
  assert.match(revenueCatUnavailableMessage(), /store product configuration/i);

  assert.equal(mapRevenueCatPurchaseError({ code: 'unexpected' }), 'unknown');
  assert.equal(mapRevenueCatPurchaseError(null), 'unknown');
});
