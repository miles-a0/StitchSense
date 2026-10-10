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
  } finally {
    await app.close();
    await pool.end();
    await client.end();
  }
});
