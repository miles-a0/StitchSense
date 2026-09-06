import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
process.env.CORS_ORIGINS = 'https://catlowyarns.co.uk';
process.env.TRUST_PROXY = '127.0.0.1';

test('API hardening controls', async (t) => {
  const { buildApp } = await import('../dist/app.js');
  const app = await buildApp();

  await t.test('maps malformed request bodies to 400 without leaking internals', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: 'short' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Invalid request');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  });

  await t.test('allows only configured browser origins in production', async () => {
    const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://catlowyarns.co.uk' } });
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://catlowyarns.co.uk');

    const denied = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://attacker.example' } });
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  });

  await t.test('returns a stable request id for API traceability', async () => {
    const generated = await app.inject({ method: 'GET', url: '/health' });
    assert.match(generated.headers['x-request-id'], /^[0-9a-f-]{36}$/);

    const supplied = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'stitchsense-test-request' },
    });
    assert.equal(supplied.headers['x-request-id'], 'stitchsense-test-request');
  });

  await t.test('rate limits repeated login attempts', async () => {
    let response;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: '198.51.100.24',
        payload: { email: 'invalid', password: 'invalid' },
      });
    }
    assert.equal(response.statusCode, 429);
  });

  await app.close();
});

test('production startup rejects missing security configuration', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import('./dist/config.js').then(({validateProductionConfig}) => validateProductionConfig())",
    ], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_ENV: 'production' },
    }),
    /Invalid production configuration/,
  );
});
