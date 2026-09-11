import assert from 'node:assert/strict';
import test from 'node:test';

import {
  entitlementCopy,
  entitlementHeadline,
  formatAccessSource,
  hasActiveEntitlementAccess,
  paywallAccessCopy,
  paywallAccessHeadline,
  paywallTrialLabel,
  purchaseStatusMessage,
  trialCountdown,
} from '../src/lib/entitlement-access';

const now = Date.UTC(2026, 8, 11, 12, 0, 0);

test('active entitlement access requires a non-expired non-free source', () => {
  assert.equal(hasActiveEntitlementAccess(null), false);
  assert.equal(hasActiveEntitlementAccess({ status: 'expired', accessSource: 'apple' }), false);
  assert.equal(hasActiveEntitlementAccess({ status: 'active', accessSource: 'none' }), false);
  assert.equal(hasActiveEntitlementAccess({ status: 'trialing', accessSource: 'standard_trial' }), true);
  assert.equal(hasActiveEntitlementAccess({ status: 'active', accessSource: 'manual_lifetime' }), true);
  assert.equal(hasActiveEntitlementAccess({ status: 'active', accessSource: 'stripe' }), true);
  assert.equal(hasActiveEntitlementAccess({ status: 'active', accessSource: 'apple' }), true);
  assert.equal(hasActiveEntitlementAccess({ status: 'active', accessSource: 'google' }), true);
});

test('account access labels cover launch billing states', () => {
  assert.equal(formatAccessSource('manual_lifetime'), 'Lifetime access');
  assert.equal(formatAccessSource('manual_trial'), 'Extended trial');
  assert.equal(formatAccessSource('courtesy_access'), 'Courtesy access');
  assert.equal(formatAccessSource('stripe'), 'Stripe subscription');
  assert.equal(formatAccessSource('apple'), 'Apple subscription');
  assert.equal(formatAccessSource('google'), 'Google subscription');
  assert.equal(formatAccessSource('standard_trial'), 'Free trial');
  assert.equal(formatAccessSource('none'), 'No active entitlement');
  assert.equal(formatAccessSource(undefined), 'Pending');

  assert.equal(entitlementHeadline('manual_lifetime'), 'Lifetime Pro');
  assert.equal(entitlementHeadline('stripe'), 'Paid Pro plan');
  assert.equal(entitlementHeadline('none'), 'Upgrade to keep full access');
  assert.equal(entitlementCopy('standard_trial'), 'Your free trial is active and all Pro features are currently unlocked.');
});

test('paywall copy distinguishes manual, store, trial, and free states', () => {
  assert.equal(paywallAccessHeadline('manual_lifetime'), 'Lifetime Pro access');
  assert.equal(paywallAccessHeadline('apple'), 'Your Pro plan is active');
  assert.equal(paywallAccessHeadline('standard_trial'), 'Free trial active');
  assert.equal(paywallAccessHeadline('none'), 'Keep StitchSense unlocked');
  assert.match(paywallAccessCopy('google'), /active Pro billing/);
  assert.match(paywallAccessCopy('none'), /Choose a plan/);
});

test('trial countdowns are stable at boundaries', () => {
  assert.equal(trialCountdown(null, now), null);
  assert.equal(trialCountdown('2026-09-11T11:59:59.000Z', now), 'Ends today');
  assert.equal(trialCountdown('2026-09-12T11:59:59.000Z', now), '1 day remaining');
  assert.equal(trialCountdown('2026-09-13T12:00:00.000Z', now), '2 days remaining');

  assert.equal(paywallTrialLabel(null, now), null);
  assert.equal(paywallTrialLabel('not-a-date', now), null);
  assert.equal(paywallTrialLabel('2026-09-11T11:59:59.000Z', now), 'Trial ended');
  assert.equal(paywallTrialLabel('2026-09-12T11:59:59.000Z', now), '1 day left in trial');
  assert.equal(paywallTrialLabel('2026-09-13T12:00:00.000Z', now), '2 days left in trial');
});

test('purchase status messaging preserves pending and cancelled store states', () => {
  assert.equal(purchaseStatusMessage('active', false), 'Purchase complete. Syncing your StitchSense access...');
  assert.equal(purchaseStatusMessage('unknown', true), 'Purchase complete. Syncing your StitchSense access...');
  assert.equal(
    purchaseStatusMessage('pending', false),
    'Purchase is pending with the store. We’ll refresh your access as soon as Apple or Google confirms it.',
  );
  assert.equal(purchaseStatusMessage('cancelled', false), 'Purchase cancelled. No payment was taken.');
  assert.equal(purchaseStatusMessage('unknown', false), 'Purchase sent to the store. Syncing your StitchSense access...');
});
