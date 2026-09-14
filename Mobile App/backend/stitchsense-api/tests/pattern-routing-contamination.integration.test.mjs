import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('pattern-aware chat and rewrite payloads stay scoped to the selected pattern', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = '';
  process.env.N8N_CHAT_URL = 'http://workflow.test/pattern-chat';
  process.env.N8N_CHAT_SHARED_SECRET = 'test-chat-secret';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let app;
  let pool;
  const originalFetch = globalThis.fetch;
  const workflowPayloads = [];

  t.after(async () => {
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    if (pool) await pool.end();
    await client.end();
  });

  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const userId = (
    await client.query(
      `INSERT INTO users (email, display_name)
       VALUES ('pattern-contamination@example.test', 'Pattern Contamination')
       RETURNING id`,
    )
  ).rows[0].id;

  await client.query(
    `INSERT INTO manual_entitlements (user_id, type, reason)
     VALUES ($1, 'lifetime_pro', 'pattern routing integration test')`,
    [userId],
  );

  const patternA = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, original_filename, source, pattern_summary_text, metadata)
       VALUES (
         $1,
         'Pattern A cardigan',
         'pattern-a-cardigan.pdf',
         'upload',
         'Pattern A contains cardigan sleeve rows and blue ribbing notes.',
         '{"source":"pattern-a"}'
       )
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;

  const patternB = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, original_filename, source, pattern_summary_text, metadata)
       VALUES (
         $1,
         'Pattern B socks',
         'pattern-b-socks.pdf',
         'upload',
         'Pattern B contains sock heel turn rows and green cuff notes.',
         '{"source":"pattern-b"}'
       )
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://workflow.test/pattern-chat');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['x-stitchsense-secret'], 'test-chat-secret');
    const payload = JSON.parse(String(init.body));
    workflowPayloads.push(payload);
    return new Response(
      JSON.stringify({
        success: true,
        answer: `Scoped answer for ${payload.pattern_id}`,
        context_count: 1,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const { buildApp } = await import('../dist/app.js');
  const poolModule = await import('../dist/db/pool.js');
  pool = poolModule.pool;
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: userId })}`;

  const createChat = async (patternId) => {
    const response = await app.inject({
      method: 'POST',
      url: '/chats',
      headers: { authorization },
      payload: { patternId, title: 'Pattern conversation' },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json().session.id;
  };

  const chatA = await createChat(patternA);
  const chatB = await createChat(patternB);

  const mismatch = await app.inject({
    method: 'POST',
    url: `/chats/${chatA}/messages`,
    headers: { authorization },
    payload: {
      content: 'Answer using the other pattern.',
      patternId: patternB,
    },
  });
  assert.equal(mismatch.statusCode, 409, mismatch.body);

  const chatMessageA = await app.inject({
    method: 'POST',
    url: `/chats/${chatA}/messages`,
    headers: { authorization },
    payload: {
      content: 'What are the sleeve rows?',
      patternId: patternA,
    },
  });
  assert.equal(chatMessageA.statusCode, 201, chatMessageA.body);

  const chatMessageB = await app.inject({
    method: 'POST',
    url: `/chats/${chatB}/messages`,
    headers: { authorization },
    payload: {
      content: 'What is the heel turn?',
      patternId: patternB,
    },
  });
  assert.equal(chatMessageB.statusCode, 201, chatMessageB.body);

  const rewriteA = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: { authorization },
    payload: {
      patternId: patternA,
      prompt: 'Rewrite the sleeve section clearly.',
    },
  });
  assert.equal(rewriteA.statusCode, 201, rewriteA.body);

  const rewriteB = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: { authorization },
    payload: {
      patternId: patternB,
      prompt: 'Rewrite the heel turn clearly.',
    },
  });
  assert.equal(rewriteB.statusCode, 201, rewriteB.body);

  assert.equal(workflowPayloads.length, 4);
  assert.equal(workflowPayloads[0].pattern_id, patternA);
  assert.equal(workflowPayloads[0].user_id, `pattern:${userId}:${patternA}:${chatA}`);
  assert.equal(workflowPayloads[0].session_id, chatA);
  assert.match(workflowPayloads[0].uploaded_pattern_summary, /cardigan sleeve rows/);
  assert.doesNotMatch(workflowPayloads[0].uploaded_pattern_summary, /heel turn/);

  assert.equal(workflowPayloads[1].pattern_id, patternB);
  assert.equal(workflowPayloads[1].user_id, `pattern:${userId}:${patternB}:${chatB}`);
  assert.equal(workflowPayloads[1].session_id, chatB);
  assert.match(workflowPayloads[1].uploaded_pattern_summary, /sock heel turn rows/);
  assert.doesNotMatch(workflowPayloads[1].uploaded_pattern_summary, /sleeve rows/);

  assert.equal(workflowPayloads[2].pattern_id, patternA);
  assert.equal(workflowPayloads[2].user_id, `pattern:${userId}:${patternA}`);
  assert.equal(workflowPayloads[2].tool_mode, 'pattern_rewrite');
  assert.match(workflowPayloads[2].uploaded_pattern_summary, /cardigan sleeve rows/);
  assert.doesNotMatch(workflowPayloads[2].uploaded_pattern_summary, /heel turn/);

  assert.equal(workflowPayloads[3].pattern_id, patternB);
  assert.equal(workflowPayloads[3].user_id, `pattern:${userId}:${patternB}`);
  assert.equal(workflowPayloads[3].tool_mode, 'pattern_rewrite');
  assert.match(workflowPayloads[3].uploaded_pattern_summary, /sock heel turn rows/);
  assert.doesNotMatch(workflowPayloads[3].uploaded_pattern_summary, /sleeve rows/);
});
