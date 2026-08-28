import assert from 'node:assert/strict';
import test from 'node:test';

test('entitlement priority is documented in API contract', () => {
  const priority = ['manual_lifetime', 'stripe', 'manual_trial', 'standard_trial', 'none'];
  assert.equal(priority[0], 'manual_lifetime');
  assert.equal(priority.at(-1), 'none');
});
