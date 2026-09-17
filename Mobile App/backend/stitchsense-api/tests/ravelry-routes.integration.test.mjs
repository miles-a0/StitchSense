import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('Ravelry routes gate entitlement, proxy through the configured WordPress bridge, and guard import ownership', {
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
      throw new Error(`unexpected Ravelry bridge request to ${String(input)}`);
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
    `INSERT INTO users (email, display_name, standard_trial_ends_at) VALUES
       ('ravelry-owner@example.test', 'Ravelry Owner', NOW() + INTERVAL '14 days'),
       ('ravelry-other@example.test', 'Ravelry Other', NOW() + INTERVAL '14 days'),
       ('ravelry-expired@example.test', 'Ravelry Expired', NOW() - INTERVAL '1 day')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'ravelry-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'ravelry-other@example.test').id;
  const expiredId = users.rows.find((row) => row.email === 'ravelry-expired@example.test').id;

  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wp|321', '{"wpUserId":321, "siteUrl":"http://attacker.test"}'::jsonb)`,
    [ownerId],
  );
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, metadata)
       VALUES ($1, 'Other Ravelry pattern', 'ravelry', '{"external_service":"ravelry","ravelry_id":"other-1"}'::jsonb)
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const expiredAuthorization = `Bearer ${app.jwt.sign({ sub: expiredId })}`;

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/ravelry/status',
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);
  assert.equal(fetchCalls.length, 0);

  const denied = await app.inject({
    method: 'GET',
    url: '/ravelry/status',
    headers: { authorization: expiredAuthorization },
  });
  assert.equal(denied.statusCode, 402, denied.body);
  assert.equal(denied.json().error, 'Subscription required');
  assert.equal(denied.json().entitlement.features.ravelryImport, false);
  assert.equal(fetchCalls.length, 0);

  queuedResponses.push(
    new Response(JSON.stringify({ connected: true, username: 'testknitter' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const status = await app.inject({
    method: 'GET',
    url: '/ravelry/status',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(status.statusCode, 200, status.body);
  assert.deepEqual(status.json(), { connected: true, username: 'testknitter' });
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].input,
    'http://wordpress.test/site/wp-json/stitchsense/v1/platform-ravelry/status?wpUserId=321',
  );
  assert.equal(fetchCalls[0].init.method, 'GET');
  assert.equal(fetchCalls[0].init.redirect, 'error');
  assert.equal(fetchCalls[0].init.headers.accept, 'application/json');
  assert.equal(fetchCalls[0].init.headers['content-type'], 'application/json');
  assert.equal(fetchCalls[0].init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret-with-32-characters');
  assert.equal(fetchCalls[0].init.body, undefined);

  queuedResponses.push(
    new Response(JSON.stringify({ results: [{ id: 'rav-123', name: 'Cable hat' }], page: 2 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const search = await app.inject({
    method: 'GET',
    url: '/ravelry/search?q=cable%20hat&page=2&pageSize=24&craft=knitting&weight=dk&availability=free&sort=best',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(search.statusCode, 200, search.body);
  assert.deepEqual(search.json(), { results: [{ id: 'rav-123', name: 'Cable hat' }], page: 2 });
  assert.equal(
    fetchCalls[1].input,
    'http://wordpress.test/site/wp-json/stitchsense/v1/platform-ravelry/search?q=cable+hat&page=2&page_size=24&craft=knitting&weight=dk&availability=free&sort=best&wpUserId=321',
  );
  assert.equal(fetchCalls[1].init.method, 'GET');

  const invalidSearch = await app.inject({
    method: 'GET',
    url: '/ravelry/search?pageSize=99',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(invalidSearch.statusCode, 400, invalidSearch.body);
  assert.equal(fetchCalls.length, 2);

  queuedResponses.push(
    new Response(JSON.stringify({ saved: true, username: 'newname' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const username = await app.inject({
    method: 'POST',
    url: '/ravelry/username',
    headers: { authorization: ownerAuthorization },
    payload: { username: '  newname  ' },
  });
  assert.equal(username.statusCode, 200, username.body);
  assert.deepEqual(username.json(), { saved: true, username: 'newname' });
  assert.equal(
    fetchCalls[2].input,
    'http://wordpress.test/site/wp-json/stitchsense/v1/platform-ravelry/username?wpUserId=321',
  );
  assert.deepEqual(JSON.parse(fetchCalls[2].init.body), {
    wpUserId: '321',
    username: 'newname',
  });

  const invalidUsername = await app.inject({
    method: 'POST',
    url: '/ravelry/username',
    headers: { authorization: ownerAuthorization },
    payload: { username: '   ' },
  });
  assert.equal(invalidUsername.statusCode, 400, invalidUsername.body);
  assert.equal(fetchCalls.length, 3);

  const crossUserImport = await app.inject({
    method: 'POST',
    url: '/ravelry/import',
    headers: { authorization: ownerAuthorization },
    payload: {
      libraryPatternId: otherPatternId,
      pattern: { id: 'rav-cross-user', name: 'Cross user import' },
    },
  });
  assert.equal(crossUserImport.statusCode, 404, crossUserImport.body);
  assert.deepEqual(crossUserImport.json(), { error: 'Pattern not found' });
  assert.equal(fetchCalls.length, 3);
});
