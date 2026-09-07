import assert from 'node:assert/strict';
import test from 'node:test';

const databaseUrl = process.env.TEST_DATABASE_URL;
const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;

test('readiness endpoint verifies database and object storage', {
  skip: databaseUrl && objectStorageEndpoint ? false : 'TEST_DATABASE_URL and OBJECT_STORAGE_ENDPOINT are not configured',
}, async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.READINESS_CHECK_TIMEOUT_MS = '2000';

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const app = await buildApp();

  const response = await app.inject({ method: 'GET', url: '/ready' });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'stitchsense-api',
    checks: {
      database: true,
      storage: true,
    },
  });

  await app.close();
  await pool.end();
});
