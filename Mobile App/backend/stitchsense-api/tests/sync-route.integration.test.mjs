import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('sync route returns scoped changes since a timestamp and rejects invalid cursors', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = '';
  process.env.WORDPRESS_SITE_URL = '';

  let app;
  let pool;
  const client = new pg.Client({ connectionString: databaseUrl });
  t.after(async () => {
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    await client.end();
  });

  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('sync-owner@example.test', 'Sync Owner'),
       ('sync-other@example.test', 'Sync Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'sync-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'sync-other@example.test').id;

  const oldPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, updated_at)
       VALUES ($1, 'Old owner pattern', 'upload', '2026-09-10T08:00:00Z')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const changedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, updated_at)
       VALUES ($1, 'Changed owner pattern', 'upload', '2026-09-10T10:00:00Z')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const deletedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, deleted_at, updated_at)
       VALUES ($1, 'Deleted owner pattern', 'upload', '2026-09-10T10:30:00Z', '2026-09-10T10:30:00Z')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, updated_at)
       VALUES ($1, 'Other user pattern', 'upload', '2026-09-10T11:00:00Z')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  const changedChatId = (
    await client.query(
      `INSERT INTO chat_sessions (user_id, pattern_id, title, updated_at)
       VALUES ($1, $2, 'Changed owner chat', '2026-09-10T10:05:00Z')
       RETURNING id`,
      [ownerId, changedPatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO chat_sessions (user_id, pattern_id, title, updated_at)
     VALUES ($1, $2, 'Old owner chat', '2026-09-10T08:05:00Z')`,
    [ownerId, oldPatternId],
  );
  await client.query(
    `INSERT INTO chat_sessions (user_id, pattern_id, title, updated_at)
     VALUES ($1, $2, 'Other user chat', '2026-09-10T10:10:00Z')`,
    [otherId, otherPatternId],
  );

  const changedRewriteId = (
    await client.query(
      `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result, created_at)
       VALUES ($1, $2, 'Changed prompt', 'Changed rewrite', '2026-09-10T10:15:00Z')
       RETURNING id`,
      [ownerId, changedPatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result, created_at)
     VALUES ($1, $2, 'Old prompt', 'Old rewrite', '2026-09-10T08:15:00Z')`,
    [ownerId, oldPatternId],
  );
  await client.query(
    `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result, created_at)
     VALUES ($1, $2, 'Other prompt', 'Other rewrite', '2026-09-10T10:20:00Z')`,
    [otherId, otherPatternId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/sync',
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const invalidSince = await app.inject({
    method: 'GET',
    url: '/sync?since=not-a-date',
    headers: { authorization },
  });
  assert.equal(invalidSince.statusCode, 400, invalidSince.body);
  assert.deepEqual(invalidSince.json(), { error: 'Invalid since timestamp' });

  const response = await app.inject({
    method: 'GET',
    url: '/sync?since=2026-09-10T09%3A00%3A00.000Z',
    headers: { authorization },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.match(body.serverTime, /^\d{4}-\d{2}-\d{2}T/);

  assert.deepEqual(
    body.patterns.map((pattern) => ({
      id: pattern.id,
      title: pattern.title,
      deleted: pattern.deleted_at !== null,
    })),
    [
      { id: changedPatternId, title: 'Changed owner pattern', deleted: false },
      { id: deletedPatternId, title: 'Deleted owner pattern', deleted: true },
    ],
  );
  assert.deepEqual(
    body.chats.map((chat) => ({ id: chat.id, title: chat.title })),
    [{ id: changedChatId, title: 'Changed owner chat' }],
  );
  assert.deepEqual(
    body.rewrites.map((rewrite) => ({ id: rewrite.id, prompt: rewrite.prompt, rewrite_result: rewrite.rewrite_result })),
    [{ id: changedRewriteId, prompt: 'Changed prompt', rewrite_result: 'Changed rewrite' }],
  );

  const allReturnedIds = [
    ...body.patterns.map((pattern) => pattern.id),
    ...body.chats.map((chat) => chat.pattern_id),
    ...body.rewrites.map((rewrite) => rewrite.pattern_id),
  ];
  assert.equal(allReturnedIds.includes(oldPatternId), false);
  assert.equal(allReturnedIds.includes(otherPatternId), false);

  const initialSnapshot = await app.inject({
    method: 'GET',
    url: '/sync',
    headers: { authorization },
  });
  assert.equal(initialSnapshot.statusCode, 200, initialSnapshot.body);
  assert.equal(initialSnapshot.json().patterns.length, 3);
  assert.equal(initialSnapshot.json().chats.length, 2);
  assert.equal(initialSnapshot.json().rewrites.length, 2);
});
