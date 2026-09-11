import assert from 'node:assert/strict';
import test from 'node:test';

import { APIError } from '../src/lib/api-error';
import { getUserFacingErrorMessage } from '../src/lib/errors';

test('API errors map auth expiry to a sign-in prompt without leaking server text', () => {
  const message = getUserFacingErrorMessage(
    new APIError({
      statusCode: 401,
      message: 'JWT expired for user 123',
      requestId: 'req-auth-expired',
    }),
  );

  assert.equal(message, 'Your session needs refreshing. Please sign in again.');
});

test('API errors map payment required to the Pro entitlement prompt', () => {
  const message = getUserFacingErrorMessage(
    new APIError({
      statusCode: 402,
      message: 'Feature blocked',
      requestId: 'req-pro',
    }),
  );

  assert.equal(message, 'This feature needs an active StitchSense Pro plan.');
});

test('API errors preserve useful support codes for not-found and server-side failures', () => {
  assert.equal(
    getUserFacingErrorMessage(
      new APIError({
        statusCode: 404,
        message: 'Pattern not found',
        requestId: 'req-pattern-missing',
      }),
    ),
    'Pattern not found (support code: req-pattern-missing)',
  );

  assert.equal(
    getUserFacingErrorMessage(
      new APIError({
        statusCode: 502,
        message: '',
        requestId: 'req-bad-gateway',
      }),
      { fallback: 'Could not load library.' },
    ),
    'Could not load library. (support code: req-bad-gateway)',
  );
});

test('API route-not-found and rate-limit errors use launch-friendly copy', () => {
  assert.equal(
    getUserFacingErrorMessage(
      new APIError({
        statusCode: 404,
        message: 'Route GET:/workflows/upload not found',
        requestId: 'req-old-api',
      }),
    ),
    'This feature needs the latest StitchSense WordPress plugin and API bridge deployed before it can work.',
  );

  assert.equal(
    getUserFacingErrorMessage(
      new APIError({
        statusCode: 429,
        message: 'Rate limit exceeded',
        requestId: 'req-rate-limit',
      }),
    ),
    'You’re doing a lot at once. Please wait a moment and try again.',
  );
});

test('non-API errors keep clear device-side recovery guidance', () => {
  assert.equal(
    getUserFacingErrorMessage(new Error('Invalid key provided to SecureStore')),
    'Secure storage hit a device-side problem. Please fully close and reopen the app, then try again.',
  );

  assert.equal(getUserFacingErrorMessage(null, { fallback: 'Try again later.' }), 'Try again later.');
});
