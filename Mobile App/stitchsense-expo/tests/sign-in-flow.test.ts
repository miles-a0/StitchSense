import assert from 'node:assert/strict';
import test from 'node:test';

import { runSignInFlow, signInInputError } from '../src/lib/sign-in-flow';

class FakeAPIError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

function createDependencies(outcomes: { email?: unknown; wordpress?: unknown }) {
  const calls: string[] = [];
  const settle = (outcome: unknown, name: string, identifier: string) => {
    calls.push(`${name}:${identifier}`);
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome ?? { via: name });
  };
  return {
    calls,
    deps: {
      signInWithEmail: (email: string) => settle(outcomes.email, 'email', email),
      signInWithWordPress: (identifier: string) => settle(outcomes.wordpress, 'wordpress', identifier),
      isFallbackError: (error: unknown) =>
        error instanceof FakeAPIError && [400, 401, 404, 500, 502, 503].includes(error.statusCode),
    },
  };
}

test('empty sign-in fields are reported before any request', () => {
  assert.equal(signInInputError('  ', 'secret'), 'Enter your email or username.');
  assert.equal(signInInputError('admin', ''), 'Enter your password.');
  assert.equal(signInInputError('admin', 'secret'), null);
});

test('email sign-in uses the platform account first', async () => {
  const { calls, deps } = createDependencies({});
  assert.deepEqual(await runSignInFlow(' maker@example.com ', 'secret', deps), { via: 'email' });
  assert.deepEqual(calls, ['email:maker@example.com']);
});

test('email sign-in falls back to WordPress and reports the WordPress error', async () => {
  const wordpressError = new FakeAPIError(401, 'We could not verify your account');
  const { calls, deps } = createDependencies({
    email: new FakeAPIError(401, 'Invalid email or password'),
    wordpress: wordpressError,
  });
  await assert.rejects(runSignInFlow('maker@example.com', 'secret', deps), wordpressError);
  assert.deepEqual(calls, ['email:maker@example.com', 'wordpress:maker@example.com']);
});

test('email sign-in stops on an error that is not a fallback case', async () => {
  const networkError = new Error('Network request failed');
  const { calls, deps } = createDependencies({ email: networkError });
  await assert.rejects(runSignInFlow('maker@example.com', 'secret', deps), networkError);
  assert.deepEqual(calls, ['email:maker@example.com']);
});

test('username sign-in goes to WordPress only and keeps its error', async () => {
  const wordpressError = new FakeAPIError(400, 'WordPress site URL does not match the configured bridge site');
  const { calls, deps } = createDependencies({ wordpress: wordpressError });
  await assert.rejects(runSignInFlow('admin', 'secret', deps), wordpressError);
  assert.deepEqual(calls, ['wordpress:admin']);
});
