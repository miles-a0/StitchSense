import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('WordPress sync status and pending routes report scoped counts and pending mirror gaps', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret-with-32-characters';
  process.env.WORDPRESS_SITE_URL = 'http://wordpress.test/site';

  let app;
  let pool;
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const queuedPayloads = [];
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
    const next = queuedPayloads.shift();
    if (!next) {
      throw new Error(`unexpected WordPress export request to ${String(input)}`);
    }
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('wordpress-status-owner@example.test', 'WordPress Status Owner'),
       ('wordpress-status-other@example.test', 'WordPress Status Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'wordpress-status-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'wordpress-status-other@example.test').id;

  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wp|42', '{"wpUserId":42,"siteUrl":"http://attacker.test","lastWordpressSyncAt":"2026-09-17T08:00:00.000Z"}'::jsonb)`,
    [ownerId],
  );

  const syncedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, original_filename, source, metadata)
       VALUES ($1, 'Synced WP Pattern', 'synced.pdf', 'wordpress_sync', '{"wordpress_pattern_id":"wp-synced"}'::jsonb)
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO user_patterns (user_id, title, source, metadata)
     VALUES ($1, 'Other User Pattern', 'wordpress_sync', '{"wordpress_pattern_id":"wp-other-user"}'::jsonb)`,
    [otherId],
  );
  const chatId = (
    await client.query(
      `INSERT INTO chat_sessions (user_id, pattern_id, title)
       VALUES ($1, $2, 'Synced chat')
       RETURNING id`,
      [ownerId, syncedPatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result)
     VALUES ($1, $2, 'Prompt', 'Rewrite')`,
    [ownerId, syncedPatternId],
  );
  await client.query(
    `INSERT INTO chat_sessions (user_id, title)
     VALUES ($1, 'Other user chat')`,
    [otherId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/sync/wordpress/status',
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const status = await app.inject({
    method: 'GET',
    url: '/sync/wordpress/status',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(status.statusCode, 200, status.body);
  assert.deepEqual(status.json(), {
    configured: true,
    linked: true,
    siteUrl: 'http://attacker.test',
    wpUserId: '42',
    lastWordpressSyncAt: '2026-09-17T08:00:00.000Z',
    counts: {
      patterns: 1,
      chats: 1,
      rewrites: 1,
    },
  });
  assert.equal(fetchCalls.length, 0);

  const unlinkedStatus = await app.inject({
    method: 'GET',
    url: '/sync/wordpress/status',
    headers: { authorization: otherAuthorization },
  });
  assert.equal(unlinkedStatus.statusCode, 200, unlinkedStatus.body);
  assert.equal(unlinkedStatus.json().configured, true);
  assert.equal(unlinkedStatus.json().linked, false);
  assert.deepEqual(unlinkedStatus.json().counts, {
    patterns: 1,
    chats: 1,
    rewrites: 0,
  });

  const unlinkedPending = await app.inject({
    method: 'GET',
    url: '/sync/wordpress/pending',
    headers: { authorization: otherAuthorization },
  });
  assert.equal(unlinkedPending.statusCode, 200, unlinkedPending.body);
  assert.deepEqual(unlinkedPending.json(), {
    available: false,
    reason: 'no_linked_wordpress_account',
    hasPending: false,
    counts: {
      patterns: 0,
      chats: 0,
      rewrites: 0,
    },
  });
  assert.equal(fetchCalls.length, 0);

  queuedPayloads.push({
    patterns: [
      {
        id: 'wp-synced',
        title: 'Synced WP Pattern',
        original_filename: 'synced.pdf',
        source: 'wordpress_sync',
      },
      {
        id: 'wp-missing',
        title: 'Missing WP Pattern',
        original_filename: 'missing.pdf',
        source: 'wordpress_sync',
      },
    ],
    chat_sessions: [{ id: 'wp-chat-1' }, { id: 'wp-chat-2' }, { id: 'wp-chat-3' }],
    chat_messages: {
      'wp-chat-1': [{ id: 1 }, { id: 2 }],
      'wp-chat-2': [{ id: 3 }],
    },
    rewrite_sessions: [{ id: 'wp-rewrite-1' }, { id: 'wp-rewrite-2' }],
  });

  const pending = await app.inject({
    method: 'GET',
    url: '/sync/wordpress/pending',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(pending.statusCode, 200, pending.body);
  assert.equal(pending.json().available, true);
  assert.equal(pending.json().siteUrl, 'http://wordpress.test/site');
  assert.equal(pending.json().wpUserId, '42');
  assert.equal(pending.json().hasPending, true);
  assert.deepEqual(pending.json().counts, {
    patterns: 1,
    chats: 2,
    rewrites: 1,
  });
  assert.match(pending.json().checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, 'http://wordpress.test/site/wp-json/stitchsense/v1/platform-export');
  assert.equal(fetchCalls[0].init.method, 'POST');
  assert.equal(fetchCalls[0].init.redirect, 'error');
  assert.equal(fetchCalls[0].init.headers.accept, 'application/json');
  assert.equal(fetchCalls[0].init.headers['content-type'], 'application/json');
  assert.equal(fetchCalls[0].init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret-with-32-characters');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { wpUserId: '42' });

  const chatRows = await client.query('SELECT COUNT(*)::int AS count FROM chat_messages WHERE session_id = $1', [chatId]);
  assert.equal(chatRows.rows[0].count, 0);
});
