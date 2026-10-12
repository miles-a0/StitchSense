import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const parseEnvExample = (filePath) => {
  const env = { PATH: process.env.PATH };
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    env[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return env;
};

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
process.env.CORS_ORIGINS = 'https://catlowyarns.co.uk';
process.env.TRUST_PROXY = '127.0.0.1';
process.env.METRICS_SHARED_SECRET = 'test-only-metrics-secret-with-more-than-32-characters';

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

  await t.test('guards operational metrics and records low-cardinality request data', async () => {
    const unauthorized = await app.inject({ method: 'GET', url: '/metrics' });
    assert.equal(unauthorized.statusCode, 401);
    assert.match(unauthorized.json().requestId, /^[0-9a-f-]{36}$/);

    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/missing-route' });

    const metrics = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${process.env.METRICS_SHARED_SECRET}` },
    });
    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.headers['content-type'], /^text\/plain/);
    assert.match(metrics.body, /stitchsense_api_requests_total\{method="GET",route="\/health",status_class="2xx"\} \d+/);
    assert.match(metrics.body, /stitchsense_api_requests_total\{method="GET",route="unmatched",status_class="4xx"\} \d+/);
    assert.match(metrics.body, /stitchsense_api_request_duration_seconds_bucket\{method="GET",route="\/health",status_class="2xx",le="\+Inf"\} \d+/);
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

test('production startup rejects missing billing webhook secrets', async () => {
  const baseEnv = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://stitchsense:stitchsense@db.example.test:5432/stitchsense',
    JWT_SECRET: 'test-only-jwt-secret-with-more-than-32-characters',
    PUBLIC_API_BASE_URL: 'https://stitchsense.example.test',
    CORS_ORIGINS: 'https://catlowyarns.co.uk',
    TRUST_PROXY: '127.0.0.1',
    N8N_CHAT_URL: 'https://workflow.example.test/chat',
    N8N_UPLOAD_URL: 'https://workflow.example.test/upload',
    N8N_LIBRARY_PROXY_URL: 'https://workflow.example.test/library',
    N8N_IMAGE_URL: 'https://workflow.example.test/image',
    N8N_SHARED_SECRET: 'test-only-n8n-secret-with-more-than-32-characters',
    N8N_CHAT_SHARED_SECRET: 'test-only-chat-secret-with-more-than-32-characters',
    N8N_UPLOAD_SHARED_SECRET: 'test-only-upload-secret-with-more-than-32-characters',
    OBJECT_STORAGE_ENDPOINT: 'https://storage.example.test',
    OBJECT_STORAGE_BUCKET: 'stitchsense-patterns',
    OBJECT_STORAGE_ACCESS_KEY: 'not-the-dev-access-key',
    OBJECT_STORAGE_SECRET_KEY: 'not-the-dev-secret-key',
  };

  await assert.rejects(
    execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import('./dist/config.js').then(({validateProductionConfig}) => validateProductionConfig())",
    ], {
      cwd: process.cwd(),
      env: baseEnv,
    }),
    /REVENUECAT_WEBHOOK_AUTHORIZATION/,
  );

  await assert.rejects(
    execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import('./dist/config.js').then(({validateProductionConfig}) => validateProductionConfig())",
    ], {
      cwd: process.cwd(),
      env: {
        ...baseEnv,
        REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer revenuecat-test-secret-with-more-than-32-characters',
        STRIPE_SECRET_KEY: 'stripe-secret-key-configured-for-test',
      },
    }),
    /STRIPE_WEBHOOK_SECRET/,
  );
});

test('production startup validates workflow secrets and accepts a complete launch config', async () => {
  const completeEnv = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://stitchsense:stitchsense@db.example.test:5432/stitchsense',
    JWT_SECRET: 'test-only-jwt-secret-with-more-than-32-characters',
    PUBLIC_API_BASE_URL: 'https://stitchsense.example.test',
    CORS_ORIGINS: 'https://catlowyarns.co.uk',
    TRUST_PROXY: '127.0.0.1',
    N8N_CHAT_URL: 'https://workflow.example.test/chat',
    N8N_UPLOAD_URL: 'https://workflow.example.test/upload',
    N8N_LIBRARY_PROXY_URL: 'https://workflow.example.test/library',
    N8N_IMAGE_URL: 'https://workflow.example.test/image',
    N8N_SHARED_SECRET: 'test-only-n8n-secret-with-more-than-32-characters',
    N8N_CHAT_SHARED_SECRET: 'test-only-chat-secret-with-more-than-32-characters',
    N8N_UPLOAD_SHARED_SECRET: 'test-only-upload-secret-with-more-than-32-characters',
    OBJECT_STORAGE_ENDPOINT: 'https://storage.example.test',
    OBJECT_STORAGE_BUCKET: 'stitchsense-patterns',
    OBJECT_STORAGE_ACCESS_KEY: 'not-the-dev-access-key',
    OBJECT_STORAGE_SECRET_KEY: 'not-the-dev-secret-key',
    REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer revenuecat-test-secret-with-more-than-32-characters',
    REVENUECAT_API_KEY: 'test-revenuecat-api-key-with-more-than-32-characters',
    REVENUECAT_API_BASE_URL: 'https://api.revenuecat.example.test/v1',
    REVENUECAT_ENTITLEMENT_ID: 'pro',
    WORDPRESS_SITE_URL: 'https://catlowyarns.co.uk',
    WORDPRESS_BRIDGE_SHARED_SECRET: 'test-wordpress-secret-with-more-than-32-characters',
  };

  await assert.rejects(
    execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import('./dist/config.js').then(({validateProductionConfig}) => validateProductionConfig())",
    ], {
      cwd: process.cwd(),
      env: {
        ...completeEnv,
        N8N_CHAT_URL: 'http://workflow.example.test/chat',
        N8N_UPLOAD_SHARED_SECRET: 'short',
      },
    }),
    /N8N_CHAT_URL/,
  );

  await execFileAsync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import('./dist/config.js').then(({validateProductionConfig}) => validateProductionConfig())",
  ], {
    cwd: process.cwd(),
    env: completeEnv,
  });
});

test('production-like env examples satisfy startup validation placeholders', async () => {
  for (const envExample of ['.env.vps.example', '.env.staging.example']) {
    await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import('./dist/config.js').then(({validateProductionConfig}) => validateProductionConfig())",
    ], {
      cwd: process.cwd(),
      env: parseEnvExample(envExample),
    });
  }
});
