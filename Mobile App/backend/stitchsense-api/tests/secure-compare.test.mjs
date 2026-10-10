import assert from 'node:assert/strict';
import test from 'node:test';

import { secureStringEquals } from '../dist/services/secureCompare.js';

test('secure string comparison accepts only exact string matches', () => {
  assert.equal(secureStringEquals('shared-secret', 'shared-secret'), true);
  assert.equal(secureStringEquals('shared-secret', 'wrong-secret'), false);
  assert.equal(secureStringEquals('shared-secret', 'shared-secret-extra'), false);
  assert.equal(secureStringEquals('shared-secret', undefined), false);
  assert.equal(secureStringEquals('shared-secret', ['shared-secret']), false);
});
