import assert from 'node:assert/strict';
import test from 'node:test';

import { restoreSessionFromTokens } from '../src/lib/session-restoration';
import type { Entitlement, User } from '../src/lib/models';

const user: User = {
  id: 'user-1',
  email: 'maker@example.com',
  displayName: 'Maker',
  role: 'user',
};

const entitlement: Entitlement = {
  plan: 'pro',
  status: 'active',
  accessSource: 'apple',
  features: {
    patternUploads: true,
    aiChat: true,
    rewrite: true,
    stitchVision: true,
    ravelryImport: true,
  },
};

function createDependencies(overrides: Partial<Parameters<typeof restoreSessionFromTokens>[1]> = {}) {
  const calls: string[] = [];

  return {
    calls,
    dependencies: {
      async me(accessToken: string) {
        calls.push(`me:${accessToken}`);
        return { user };
      },
      async entitlement(accessToken: string) {
        calls.push(`entitlement:${accessToken}`);
        return { entitlement };
      },
      async refresh(refreshToken: string) {
        calls.push(`refresh:${refreshToken}`);
        return {
          user,
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
        };
      },
      async saveTokens(accessToken: string, refreshToken: string) {
        calls.push(`save:${accessToken}:${refreshToken}`);
      },
      async clearTokens() {
        calls.push('clear');
      },
      ...overrides,
    },
  };
}

test('saved access tokens restore account and entitlement state without refresh rotation', async () => {
  const { calls, dependencies } = createDependencies();

  const restored = await restoreSessionFromTokens(
    { accessToken: 'saved-access', refreshToken: 'saved-refresh' },
    dependencies,
  );

  assert.deepEqual(restored, {
    user,
    entitlement,
    accessToken: 'saved-access',
    refreshToken: 'saved-refresh',
  });
  assert.deepEqual(calls, ['me:saved-access', 'entitlement:saved-access']);
});

test('expired saved access tokens rotate through the stored refresh token', async () => {
  const { calls, dependencies } = createDependencies({
    async me(accessToken: string) {
      calls.push(`me:${accessToken}`);
      throw { statusCode: 401 };
    },
  });

  const restored = await restoreSessionFromTokens(
    { accessToken: 'expired-access', refreshToken: 'saved-refresh' },
    dependencies,
  );

  assert.deepEqual(restored, {
    user,
    entitlement,
    accessToken: 'fresh-access',
    refreshToken: 'fresh-refresh',
  });
  assert.deepEqual(calls, [
    'me:expired-access',
    'entitlement:expired-access',
    'refresh:saved-refresh',
    'save:fresh-access:fresh-refresh',
    'entitlement:fresh-access',
  ]);
});

test('refresh-only saved sessions hydrate account state and persist rotated tokens', async () => {
  const { calls, dependencies } = createDependencies();

  const restored = await restoreSessionFromTokens(
    { accessToken: null, refreshToken: 'saved-refresh' },
    dependencies,
  );

  assert.equal(restored?.accessToken, 'fresh-access');
  assert.equal(restored?.refreshToken, 'fresh-refresh');
  assert.deepEqual(calls, [
    'refresh:saved-refresh',
    'save:fresh-access:fresh-refresh',
    'entitlement:fresh-access',
  ]);
});

test('invalid refresh tokens clear saved credentials and leave the session signed out', async () => {
  const { calls, dependencies } = createDependencies({
    async refresh(refreshToken: string) {
      calls.push(`refresh:${refreshToken}`);
      throw { statusCode: 401 };
    },
  });

  const restored = await restoreSessionFromTokens(
    { accessToken: null, refreshToken: 'bad-refresh' },
    dependencies,
  );

  assert.equal(restored, null);
  assert.deepEqual(calls, ['refresh:bad-refresh', 'clear']);
});
