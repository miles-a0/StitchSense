import assert from 'node:assert/strict';
import test from 'node:test';

import {
  annualSavingsLabel,
  revenueCatPlanPriceFromProduct,
  type RevenueCatPlanPricing,
} from '../src/lib/revenuecat-pricing';

test('RevenueCat plan pricing keeps store display strings and numeric price metadata', () => {
  assert.deepEqual(
    revenueCatPlanPriceFromProduct({
      priceString: '€9.99',
      price: 9.99,
      currencyCode: 'eur',
    }),
    {
      priceString: '€9.99',
      price: 9.99,
      currencyCode: 'EUR',
    },
  );

  assert.equal(revenueCatPlanPriceFromProduct({ priceString: '' }), null);
});

test('annual savings label is calculated only when comparable store prices are present', () => {
  const gbpPricing: RevenueCatPlanPricing = {
    monthly: { priceString: '£10.00', price: 10, currencyCode: 'GBP' },
    annual: { priceString: '£96.00', price: 96, currencyCode: 'GBP' },
  };
  assert.equal(annualSavingsLabel(gbpPricing), 'Save £24');

  assert.equal(
    annualSavingsLabel({
      monthly: { priceString: '$10.00', price: 10, currencyCode: 'USD' },
      annual: { priceString: '€96.00', price: 96, currencyCode: 'EUR' },
    }),
    null,
  );
  assert.equal(annualSavingsLabel({ monthly: gbpPricing.monthly }), null);
  assert.equal(
    annualSavingsLabel({
      monthly: { priceString: '£8.00', price: 8, currencyCode: 'GBP' },
      annual: { priceString: '£96.00', price: 96, currencyCode: 'GBP' },
    }),
    null,
  );
});
