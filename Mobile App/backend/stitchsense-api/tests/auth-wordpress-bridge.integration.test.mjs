import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('WordPress bridge auth requires the shared secret and trusted site URL', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret-with-more-than-32-characters';
  process.env.WORDPRESS_SITE_URL = 'http://wordpress.test/site';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const app = await buildApp();
  const originalFetch = globalThis.fetch;

  const payload = {
    wpUserId: 42,
    email: 'wp-bridge@example.test',
    displayName: 'WP Bridge',
    siteUrl: 'http://wordpress.test/site',
    roles: ['subscriber'],
  };

  try {
    const missingSecret = await app.inject({
      method: 'POST',
      url: '/auth/wordpress',
      payload,
    });
    assert.equal(missingSecret.statusCode, 401, missingSecret.body);

    const wrongSecret = await app.inject({
      method: 'POST',
      url: '/auth/wordpress',
      headers: { 'x-stitchsense-wordpress-secret': 'wrong-secret' },
      payload,
    });
    assert.equal(wrongSecret.statusCode, 401, wrongSecret.body);

    const wrongSite = await app.inject({
      method: 'POST',
      url: '/auth/wordpress',
      headers: { 'x-stitchsense-wordpress-secret': 'test-wordpress-secret-with-more-than-32-characters' },
      payload: { ...payload, siteUrl: 'http://attacker.test/site' },
    });
    assert.equal(wrongSite.statusCode, 400, wrongSite.body);

    globalThis.fetch = async (input, init = {}) => {
      assert.equal(String(input), 'http://wordpress.test/site/wp-json/stitchsense/v1/platform-login');
      assert.equal(init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret-with-more-than-32-characters');
      return new Response(JSON.stringify({ error: 'Upload workflow rejected N8N_UPLOAD_SHARED_SECRET' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    };
    const failedLogin = await app.inject({
      method: 'POST',
      url: '/auth/wordpress-login',
      payload: {
        siteUrl: 'http://wordpress.test/site',
        identifier: 'wp-bridge@example.test',
        password: 'wrong-password',
      },
    });
    assert.equal(failedLogin.statusCode, 401, failedLogin.body);
    assert.match(failedLogin.json().error, /WordPress authentication failed/);
    assert.doesNotMatch(failedLogin.body, /N8N_UPLOAD_SHARED_SECRET|Upload workflow rejected/);

    globalThis.fetch = async (input, init = {}) => {
      assert.equal(String(input), 'http://wordpress.test/site/wp-json/stitchsense/v1/platform-register');
      assert.equal(init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret-with-more-than-32-characters');
      return new Response(JSON.stringify({ error: 'Database duplicate key leaked by WordPress upstream' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    };
    const failedRegister = await app.inject({
      method: 'POST',
      url: '/auth/wordpress-register',
      payload: {
        siteUrl: 'http://wordpress.test/site',
        email: 'wp-bridge@example.test',
        username: 'wpbridge',
        password: 'strong-password',
        displayName: 'WP Bridge',
      },
    });
    assert.equal(failedRegister.statusCode, 409, failedRegister.body);
    assert.match(failedRegister.json().error, /already in use/);
    assert.doesNotMatch(failedRegister.body, /Database duplicate key|upstream/);

    const authorized = await app.inject({
      method: 'POST',
      url: '/auth/wordpress',
      headers: { 'x-stitchsense-wordpress-secret': 'test-wordpress-secret-with-more-than-32-characters' },
      payload,
    });
    assert.equal(authorized.statusCode, 200, authorized.body);
    const body = authorized.json();
    assert.equal(body.user.email, 'wp-bridge@example.test');
    assert.equal(body.user.displayName, 'WP Bridge');
    assert.match(body.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.ok(body.refreshToken.length >= 32);

    const linked = await client.query(
      `SELECT provider, provider_user_id, metadata
       FROM linked_accounts
       WHERE user_id = $1`,
      [body.user.id],
    );
    assert.equal(linked.rowCount, 1);
    assert.equal(linked.rows[0].provider, 'wordpress');
    assert.equal(linked.rows[0].provider_user_id, 'http://wordpress.test/site|42');
    assert.equal(linked.rows[0].metadata.wpUserId, '42');
    assert.equal(linked.rows[0].metadata.siteUrl, 'http://wordpress.test/site');

    // A WordPress administrator is not made a StitchSense admin; admin rights are named, not inferred.
    const bridgeHeaders = { 'x-stitchsense-wordpress-secret': 'test-wordpress-secret-with-more-than-32-characters' };
    const wpAdmin = await app.inject({
      method: 'POST',
      url: '/auth/wordpress',
      headers: bridgeHeaders,
      payload: { ...payload, wpUserId: 7, email: 'wp-admin@example.test', roles: ['administrator'] },
    });
    assert.equal(wpAdmin.statusCode, 200, wpAdmin.body);
    assert.equal(wpAdmin.json().user.role, 'user');
    const wpAdminAccess = await app.inject({
      method: 'GET',
      url: '/admin/entitlements',
      headers: { authorization: `Bearer ${wpAdmin.json().accessToken}` },
    });
    assert.equal(wpAdminAccess.statusCode, 403, wpAdminAccess.body);

    // A named admin keeps the role across WordPress logins, whatever their WordPress role.
    await client.query(`UPDATE users SET role = 'admin' WHERE email = 'wp-bridge@example.test'`);
    const namedAdmin = await app.inject({ method: 'POST', url: '/auth/wordpress', headers: bridgeHeaders, payload });
    assert.equal(namedAdmin.statusCode, 200, namedAdmin.body);
    assert.equal(namedAdmin.json().user.role, 'admin');
    const namedAdminAccess = await app.inject({
      method: 'GET',
      url: '/admin/entitlements',
      headers: { authorization: `Bearer ${namedAdmin.json().accessToken}` },
    });
    assert.equal(namedAdminAccess.statusCode, 200, namedAdminAccess.body);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    await pool.end();
    await client.end();
  }
});
