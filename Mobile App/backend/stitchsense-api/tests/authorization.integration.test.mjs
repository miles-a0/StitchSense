import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('authenticated users cannot read, change, or delete another user\'s records', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('owner@example.test', 'Owner'),
       ('attacker@example.test', 'Attacker')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'owner@example.test').id;
  const attackerId = users.rows.find((row) => row.email === 'attacker@example.test').id;
  await client.query(
    `INSERT INTO manual_entitlements (user_id, type, reason)
     VALUES ($1, 'lifetime_pro', 'authorization integration test')`,
    [attackerId],
  );
  const patternId = (await client.query(
    `INSERT INTO user_patterns (user_id, title) VALUES ($1, 'Owner pattern') RETURNING id`,
    [ownerId],
  )).rows[0].id;
  const projectId = (await client.query(
    `INSERT INTO projects (user_id, pattern_id, title) VALUES ($1, $2, 'Owner project') RETURNING id`,
    [ownerId, patternId],
  )).rows[0].id;
  const stashId = (await client.query(
    `INSERT INTO stash_items (user_id, category, name) VALUES ($1, 'yarn', 'Owner yarn') RETURNING id`,
    [ownerId],
  )).rows[0].id;
  const chatId = (await client.query(
    `INSERT INTO chat_sessions (user_id, pattern_id, title) VALUES ($1, $2, 'Owner chat') RETURNING id`,
    [ownerId, patternId],
  )).rows[0].id;
  await client.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', 'private owner message')`,
    [chatId],
  );
  await client.query(
    `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result)
     VALUES ($1, $2, 'private owner prompt', 'private owner rewrite')`,
    [ownerId, patternId],
  );

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: attackerId })}`;

  const guardedRequests = [
    ['GET', `/patterns/${patternId}`, undefined, 404],
    ['PUT', `/patterns/${patternId}`, { title: 'stolen' }, 404],
    ['DELETE', `/patterns/${patternId}`, undefined, 404],
    ['GET', `/patterns/${patternId}/file-url`, undefined, 404],
    ['GET', `/patterns/${patternId}/file`, undefined, 404],
    ['GET', `/patterns/${patternId}/thumbnail`, undefined, 404],
    ['GET', `/projects/${projectId}`, undefined, 404],
    ['PUT', `/projects/${projectId}`, { title: 'stolen' }, 404],
    ['DELETE', `/projects/${projectId}`, undefined, 404],
    ['PUT', `/stash/${stashId}`, { name: 'stolen' }, 404],
    ['DELETE', `/stash/${stashId}`, undefined, 404],
    ['POST', `/chats/${chatId}/messages`, { content: 'steal this chat' }, 404],
  ];

  for (const [method, url, payload, expectedStatus] of guardedRequests) {
    await t.test(`${method} ${url}`, async () => {
      const response = await app.inject({ method, url, headers: { authorization }, payload });
      assert.equal(response.statusCode, expectedStatus, response.body);
    });
  }

  await t.test('chat message listing returns no cross-user data', async () => {
    const response = await app.inject({ method: 'GET', url: `/chats/${chatId}/messages`, headers: { authorization } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { messages: [] });
  });

  await t.test('rewrite listing returns no cross-user data', async () => {
    const response = await app.inject({ method: 'GET', url: `/patterns/${patternId}/rewrites`, headers: { authorization } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { rewrites: [] });
  });

  await t.test('standard users cannot access administrator routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/users/access', headers: { authorization } });
    assert.equal(response.statusCode, 403);
  });

  await t.test('repeated Ravelry creates update the existing library row', async () => {
    const ravelryId = 'ravelry-idempotency-test';
    const first = await app.inject({
      method: 'POST',
      url: '/patterns',
      headers: { authorization },
      payload: {
        title: 'First Ravelry import',
        source: 'ravelry',
        metadata: { external_service: 'ravelry', ravelry_id: ravelryId },
      },
    });
    assert.equal(first.statusCode, 201, first.body);

    const second = await app.inject({
      method: 'POST',
      url: '/patterns',
      headers: { authorization },
      payload: {
        title: 'Updated Ravelry import',
        source: 'ravelry',
        metadata: { external_service: 'ravelry', ravelry_id: ravelryId },
      },
    });
    assert.equal(second.statusCode, 201, second.body);
    assert.equal(second.json().pattern.id, first.json().pattern.id);
    assert.equal(second.json().pattern.title, 'Updated Ravelry import');

    const rows = await client.query(
      `SELECT id, title
       FROM user_patterns
       WHERE user_id = $1 AND metadata->>'ravelry_id' = $2 AND deleted_at IS NULL`,
      [attackerId, ravelryId],
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].title, 'Updated Ravelry import');
  });

  const unchanged = await client.query(
    `SELECT
       (SELECT title FROM user_patterns WHERE id = $1) AS pattern_title,
       (SELECT title FROM projects WHERE id = $2) AS project_title,
       (SELECT name FROM stash_items WHERE id = $3) AS stash_name`,
    [patternId, projectId, stashId],
  );
  assert.deepEqual(unchanged.rows[0], {
    pattern_title: 'Owner pattern',
    project_title: 'Owner project',
    stash_name: 'Owner yarn',
  });

  await app.close();
  await pool.end();
  await client.end();
});
