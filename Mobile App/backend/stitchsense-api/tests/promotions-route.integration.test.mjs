import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('active promotions route scopes WordPress bridge requests and fails closed', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret-with-32-characters';
  process.env.WORDPRESS_SITE_URL = 'http://wordpress.test/site/';

  let app;
  let pool;
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const queuedResponses = [];
  const client = new pg.Client({ connectionString: databaseUrl });
  t.after(async () => {
    globalThis.fetch = originalFetch;
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    await client.end();
  });

  globalThis.fetch = async (input, init) => {
    fetchCalls.push({ input: String(input), init });
    const next = queuedResponses.shift();
    if (!next) {
      throw new Error('unexpected WordPress promo request');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };

  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('promos-owner@example.test', 'Promos Owner'),
       ('promos-other@example.test', 'Promos Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'promos-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'promos-other@example.test').id;

  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wp|456', '{"siteUrl":"http://wordpress.test/site"}'::jsonb)`,
    [ownerId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/promotions/active',
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const unlinked = await app.inject({
    method: 'GET',
    url: '/promotions/active',
    headers: { authorization: otherAuthorization },
  });
  assert.equal(unlinked.statusCode, 200, unlinked.body);
  assert.deepEqual(unlinked.json(), { promotions: [] });
  assert.equal(fetchCalls.length, 0);

  queuedResponses.push(
    new Response(
      JSON.stringify({
        promotions: [
          {
            id: 'launch-courtesy',
            title: 'Launch courtesy access',
            source: 'wordpress',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  const bridged = await app.inject({
    method: 'GET',
    url: '/promotions/active',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(bridged.statusCode, 200, bridged.body);
  assert.deepEqual(bridged.json(), {
    promotions: [
      {
        id: 'launch-courtesy',
        title: 'Launch courtesy access',
        source: 'wordpress',
      },
    ],
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, 'http://wordpress.test/site/wp-json/stitchsense/v1/platform-promotions?wpUserId=456');
  assert.equal(fetchCalls[0].init.method, 'GET');
  assert.equal(fetchCalls[0].init.redirect, 'error');
  assert.equal(fetchCalls[0].init.headers.accept, 'application/json');
  assert.equal(fetchCalls[0].init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret-with-32-characters');

  queuedResponses.push(new Response(JSON.stringify({ error: 'temporarily unavailable' }), { status: 503 }));
  const upstreamError = await app.inject({
    method: 'GET',
    url: '/promotions/active',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(upstreamError.statusCode, 200, upstreamError.body);
  assert.deepEqual(upstreamError.json(), { promotions: [] });

  queuedResponses.push(new Response('not-json', { status: 200 }));
  const invalidJson = await app.inject({
    method: 'GET',
    url: '/promotions/active',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(invalidJson.statusCode, 200, invalidJson.body);
  assert.deepEqual(invalidJson.json(), { promotions: [] });

  queuedResponses.push(new Error('network failure'));
  const networkFailure = await app.inject({
    method: 'GET',
    url: '/promotions/active',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(networkFailure.statusCode, 200, networkFailure.body);
  assert.deepEqual(networkFailure.json(), { promotions: [] });
});
