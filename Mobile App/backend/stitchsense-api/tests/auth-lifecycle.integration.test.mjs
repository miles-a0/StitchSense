import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('auth lifecycle registers, logs in, rotates refresh tokens, logs out, and handles password reset config safely', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = '';
  process.env.WORDPRESS_SITE_URL = '';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const app = await buildApp();

  const registerResponse = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'AUTH-LIFECYCLE@example.test',
      password: 'correct-horse-battery-staple',
      displayName: 'Auth Lifecycle',
    },
  });
  assert.equal(registerResponse.statusCode, 201, registerResponse.body);
  const registered = registerResponse.json();
  assert.equal(registered.user.email, 'auth-lifecycle@example.test');
  assert.equal(registered.user.displayName, 'Auth Lifecycle');
  assert.match(registered.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(registered.refreshToken.length >= 32);

  const storedAfterRegister = await client.query(
    `SELECT token_hash, revoked_at, expires_at
     FROM refresh_tokens
     WHERE user_id = $1`,
    [registered.user.id],
  );
  assert.equal(storedAfterRegister.rowCount, 1);
  assert.equal(storedAfterRegister.rows[0].revoked_at, null);
  assert.ok(storedAfterRegister.rows[0].expires_at instanceof Date);

  const invalidLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'auth-lifecycle@example.test', password: 'wrong-password' },
  });
  assert.equal(invalidLogin.statusCode, 401, invalidLogin.body);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'auth-lifecycle@example.test', password: 'correct-horse-battery-staple' },
  });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  const login = loginResponse.json();
  assert.equal(login.user.id, registered.user.id);
  assert.notEqual(login.refreshToken, registered.refreshToken);

  const refreshResponse = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: login.refreshToken },
  });
  assert.equal(refreshResponse.statusCode, 200, refreshResponse.body);
  const refresh = refreshResponse.json();
  assert.equal(refresh.user.id, registered.user.id);
  assert.notEqual(refresh.refreshToken, login.refreshToken);

  const reusedRefresh = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: login.refreshToken },
  });
  assert.equal(reusedRefresh.statusCode, 401, reusedRefresh.body);

  const logoutResponse = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    payload: { refreshToken: refresh.refreshToken },
  });
  assert.equal(logoutResponse.statusCode, 204, logoutResponse.body);

  const refreshAfterLogout = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: refresh.refreshToken },
  });
  assert.equal(refreshAfterLogout.statusCode, 401, refreshAfterLogout.body);

  const tokenState = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE revoked_at IS NULL)::int AS active
     FROM refresh_tokens
     WHERE user_id = $1`,
    [registered.user.id],
  );
  assert.equal(tokenState.rows[0].total, 3);
  assert.equal(tokenState.rows[0].active, 1);

  const passwordResetRequest = await app.inject({
    method: 'POST',
    url: '/auth/password-reset/request',
    payload: { email: 'auth-lifecycle@example.test' },
  });
  assert.equal(passwordResetRequest.statusCode, 200, passwordResetRequest.body);
  assert.match(passwordResetRequest.json().message, /If an account exists/i);

  const passwordResetConfirm = await app.inject({
    method: 'POST',
    url: '/auth/password-reset/confirm',
    payload: {
      email: 'auth-lifecycle@example.test',
      code: '123456',
      password: 'new-correct-horse-battery-staple',
    },
  });
  assert.equal(passwordResetConfirm.statusCode, 503, passwordResetConfirm.body);

  await app.close();
  await pool.end();
  await client.end();
});
