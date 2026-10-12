import assert from 'node:assert/strict';
import test from 'node:test';

test('external service error log context omits raw upstream messages', async () => {
  const { externalServiceErrorLogContext } = await import('../dist/services/externalServiceErrorLog.js');
  const error = new Error('N8N_UPLOAD_SHARED_SECRET leaked upstream detail');
  error.code = 'ERR_UPSTREAM';
  error.statusCode = 503;

  const context = externalServiceErrorLogContext(error);

  assert.deepEqual(context, {
    errorType: 'Error',
    errorCode: 'ERR_UPSTREAM',
    statusCode: 503,
    hasErrorMessage: true,
    errorMessageLength: error.message.length,
  });
  assert.doesNotMatch(JSON.stringify(context), /N8N_UPLOAD_SHARED_SECRET|leaked upstream detail/);
});
