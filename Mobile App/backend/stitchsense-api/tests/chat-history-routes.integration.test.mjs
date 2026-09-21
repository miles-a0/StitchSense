import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('chat history routes cover scoped sessions, imported messages, ordering, and validation', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';

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
       ('chat-history-owner@example.test', 'Chat History Owner'),
       ('chat-history-other@example.test', 'Chat History Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'chat-history-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'chat-history-other@example.test').id;

  const ownerPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, pattern_summary_text)
       VALUES ($1, 'Owner chat pattern', 'upload', 'Owner-only pattern context')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, pattern_summary_text)
       VALUES ($1, 'Other chat pattern', 'upload', 'Other-user pattern context')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;
  const otherSessionId = (
    await client.query(
      `INSERT INTO chat_sessions (user_id, pattern_id, title, skill_level)
       VALUES ($1, $2, 'Other private session', 'advanced')
       RETURNING id`,
      [otherId, otherPatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode)
     VALUES ($1, 'user', 'Other private message', 'message', 'pattern_chat')`,
    [otherSessionId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;

  const unauthenticatedCreate = await app.inject({
    method: 'POST',
    url: '/chats',
    payload: { patternId: ownerPatternId, title: 'Should fail' },
  });
  assert.equal(unauthenticatedCreate.statusCode, 401, unauthenticatedCreate.body);

  const crossUserPatternCreate = await app.inject({
    method: 'POST',
    url: '/chats',
    headers: { authorization: ownerAuthorization },
    payload: { patternId: otherPatternId, title: 'Should not bind' },
  });
  assert.equal(crossUserPatternCreate.statusCode, 404, crossUserPatternCreate.body);
  assert.deepEqual(crossUserPatternCreate.json(), { error: 'Pattern not found' });

  const createdPatternChat = await app.inject({
    method: 'POST',
    url: '/chats',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: ownerPatternId,
      title: 'Owner pattern chat',
      skillLevel: 'intermediate',
    },
  });
  assert.equal(createdPatternChat.statusCode, 201, createdPatternChat.body);
  const patternSession = createdPatternChat.json().session;
  assert.equal(patternSession.user_id, ownerId);
  assert.equal(patternSession.pattern_id, ownerPatternId);
  assert.equal(patternSession.title, 'Owner pattern chat');
  assert.equal(patternSession.skill_level, 'intermediate');

  const createdGeneralChat = await app.inject({
    method: 'POST',
    url: '/chats',
    headers: { authorization: ownerAuthorization },
    payload: {},
  });
  assert.equal(createdGeneralChat.statusCode, 201, createdGeneralChat.body);
  assert.equal(createdGeneralChat.json().session.pattern_id, null);
  assert.equal(createdGeneralChat.json().session.title, 'Untitled chat');
  assert.equal(createdGeneralChat.json().session.skill_level, 'beginner');

  const patternChatList = await app.inject({
    method: 'GET',
    url: `/patterns/${ownerPatternId}/chats`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(patternChatList.statusCode, 200, patternChatList.body);
  assert.deepEqual(
    patternChatList.json().sessions.map((session) => session.id),
    [patternSession.id],
  );

  const crossUserPatternList = await app.inject({
    method: 'GET',
    url: `/patterns/${otherPatternId}/chats`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(crossUserPatternList.statusCode, 200, crossUserPatternList.body);
  assert.deepEqual(crossUserPatternList.json(), { sessions: [] });

  const invalidImport = await app.inject({
    method: 'PUT',
    url: `/chats/${patternSession.id}/messages`,
    headers: { authorization: ownerAuthorization },
    payload: { messages: [] },
  });
  assert.equal(invalidImport.statusCode, 400, invalidImport.body);

  const crossUserImport = await app.inject({
    method: 'PUT',
    url: `/chats/${otherSessionId}/messages`,
    headers: { authorization: ownerAuthorization },
    payload: {
      messages: [{ role: 'user', content: 'Should not import' }],
    },
  });
  assert.equal(crossUserImport.statusCode, 404, crossUserImport.body);
  assert.deepEqual(crossUserImport.json(), { error: 'Session not found' });

  const imported = await app.inject({
    method: 'PUT',
    url: `/chats/${patternSession.id}/messages`,
    headers: { authorization: ownerAuthorization },
    payload: {
      messages: [
        {
          role: 'assistant',
          content: 'Earlier assistant note',
          kind: 'imported',
          toolMode: 'pattern_chat',
          createdAt: '2026-09-20T10:00:00.000Z',
        },
        {
          role: 'user',
          content: 'Later user note',
          kind: 'message',
          createdAt: '2026-09-20T10:05:00.000Z',
        },
      ],
    },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  assert.equal(imported.json().imported, 2);
  assert.equal(imported.json().ids.length, 2);
  assert.ok(imported.json().ids[1] > imported.json().ids[0]);

  const listedMessages = await app.inject({
    method: 'GET',
    url: `/chats/${patternSession.id}/messages`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(listedMessages.statusCode, 200, listedMessages.body);
  assert.deepEqual(
    listedMessages.json().messages.map((message) => ({
      role: message.role,
      content: message.content,
      kind: message.kind,
      tool_mode: message.tool_mode,
      created_at: new Date(message.created_at).toISOString(),
    })),
    [
      {
        role: 'assistant',
        content: 'Earlier assistant note',
        kind: 'imported',
        tool_mode: 'pattern_chat',
        created_at: '2026-09-20T10:00:00.000Z',
      },
      {
        role: 'user',
        content: 'Later user note',
        kind: 'message',
        tool_mode: null,
        created_at: '2026-09-20T10:05:00.000Z',
      },
    ],
  );

  const crossUserMessages = await app.inject({
    method: 'GET',
    url: `/chats/${otherSessionId}/messages`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(crossUserMessages.statusCode, 200, crossUserMessages.body);
  assert.deepEqual(crossUserMessages.json(), { messages: [] });

  const otherOwnerMessages = await app.inject({
    method: 'GET',
    url: `/chats/${otherSessionId}/messages`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(otherOwnerMessages.statusCode, 200, otherOwnerMessages.body);
  assert.deepEqual(
    otherOwnerMessages.json().messages.map((message) => message.content),
    ['Other private message'],
  );
});
