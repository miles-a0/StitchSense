import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('rewrite route covers entitlements, pattern guards, and WordPress fallback', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.N8N_CHAT_URL = 'http://workflow.test/pattern-rewrite';
  process.env.N8N_CHAT_SHARED_SECRET = 'test-chat-secret';
  process.env.WORDPRESS_SITE_URL = 'https://wordpress.example.test';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret';

  let app;
  let pool;
  const client = new pg.Client({ connectionString: databaseUrl });
  const originalFetch = globalThis.fetch;
  const workflowRequests = [];
  const wordpressRequests = [];

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

  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('rewrite-route-owner@example.test', 'Rewrite Route Owner'),
       ('rewrite-route-other@example.test', 'Rewrite Route Other'),
       ('rewrite-route-unpaid@example.test', 'Rewrite Route Unpaid')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'rewrite-route-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'rewrite-route-other@example.test').id;
  const unpaidId = users.rows.find((row) => row.email === 'rewrite-route-unpaid@example.test').id;

  await client.query(
    `INSERT INTO manual_entitlements (user_id, type, reason)
     VALUES ($1, 'lifetime_pro', 'rewrite route integration test')`,
    [ownerId],
  );
  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wordpress|42', '{"wpUserId":"42"}'::jsonb)`,
    [ownerId],
  );

  const validPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, pattern_summary_text, metadata)
       VALUES ($1, 'Owner rewrite source', 'upload', 'Pattern has sleeve shaping and collar notes.', '{"source":"owned"}'::jsonb)
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const metadataOnlyPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, metadata)
       VALUES (
         $1,
         'Paid metadata only pattern',
         'ravelry',
         '{"ravelry_availability":"paid","ravelry_is_free":false,"pdf_url":"https://example.test/paid.pdf"}'::jsonb
       )
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const emptyPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, metadata)
       VALUES ($1, 'Empty source pattern', 'upload', '{}'::jsonb)
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, pattern_summary_text)
       VALUES ($1, 'Other rewrite source', 'upload', 'Other user content')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === 'http://workflow.test/pattern-rewrite') {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['content-type'], 'application/json');
      assert.equal(init.headers['x-stitchsense-secret'], 'test-chat-secret');
      const payload = JSON.parse(String(init.body));
      workflowRequests.push(payload);
      return new Response(JSON.stringify({ error: 'direct workflow unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    assert.equal(url, 'https://wordpress.example.test/wp-json/stitchsense/v1/platform-chat-proxy?wpUserId=42');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.accept, 'application/json');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret');
    const payload = JSON.parse(String(init.body));
    wordpressRequests.push(payload);
    return new Response(
      JSON.stringify({
        success: true,
        answer: 'Fallback rewrite answer',
        source: 'wordpress-proxy',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const unpaidAuthorization = `Bearer ${app.jwt.sign({ sub: unpaidId })}`;

  const unauthenticated = await app.inject({
    method: 'POST',
    url: '/rewrites',
    payload: {
      patternId: validPatternId,
      prompt: 'Rewrite this clearly.',
    },
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const unpaid = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: { authorization: unpaidAuthorization },
    payload: {
      patternId: validPatternId,
      prompt: 'Rewrite this clearly.',
    },
  });
  assert.equal(unpaid.statusCode, 402, unpaid.body);
  assert.equal(unpaid.json().error, 'Subscription required');

  const crossUserPattern = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: otherPatternId,
      prompt: 'Rewrite someone else pattern.',
    },
  });
  assert.equal(crossUserPattern.statusCode, 404, crossUserPattern.body);
  assert.deepEqual(crossUserPattern.json(), { error: 'Pattern not found' });

  const metadataOnly = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: metadataOnlyPatternId,
      prompt: 'Rewrite the paid source.',
    },
  });
  assert.equal(metadataOnly.statusCode, 409, metadataOnly.body);
  assert.match(metadataOnly.json().error, /purchase the pattern and re-import/i);

  const emptyScopedContent = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: emptyPatternId,
      prompt: 'Rewrite with no indexed content.',
    },
  });
  assert.equal(emptyScopedContent.statusCode, 409, emptyScopedContent.body);
  assert.match(emptyScopedContent.json().error, /re-upload or re-import/i);
  assert.equal(workflowRequests.length, 0);
  assert.equal(wordpressRequests.length, 0);

  const fallbackRewrite = await app.inject({
    method: 'POST',
    url: '/rewrites',
    headers: {
      authorization: ownerAuthorization,
      'x-stitchsense-client-surface': 'ios-test',
    },
    payload: {
      patternId: validPatternId,
      prompt: '  Rewrite the sleeve shaping in plain English.  ',
    },
  });
  assert.equal(fallbackRewrite.statusCode, 201, fallbackRewrite.body);
  assert.equal(fallbackRewrite.json().rewrite.user_id, ownerId);
  assert.equal(fallbackRewrite.json().rewrite.pattern_id, validPatternId);
  assert.equal(fallbackRewrite.json().rewrite.prompt, '  Rewrite the sleeve shaping in plain English.  ');
  assert.equal(fallbackRewrite.json().rewrite.rewrite_result, 'Fallback rewrite answer');
  assert.deepEqual(fallbackRewrite.json().workflow, {
    success: true,
    answer: 'Fallback rewrite answer',
    source: 'wordpress-proxy',
  });

  assert.equal(workflowRequests.length, 1);
  assert.equal(workflowRequests[0].pattern_id, validPatternId);
  assert.equal(workflowRequests[0].patternId, validPatternId);
  assert.equal(workflowRequests[0].tool_mode, 'pattern_rewrite');
  assert.equal(workflowRequests[0].user_id, `pattern:${ownerId}:${validPatternId}`);
  assert.equal(workflowRequests[0].platform_user_id, ownerId);
  assert.equal(workflowRequests[0].secret, 'test-chat-secret');
  assert.match(workflowRequests[0].question, /Reply in English only/);
  assert.match(workflowRequests[0].question, /Rewrite the sleeve shaping in plain English/);
  assert.match(workflowRequests[0].uploaded_pattern_summary, /sleeve shaping/);

  assert.equal(wordpressRequests.length, 1);
  assert.equal(wordpressRequests[0].pattern_id, validPatternId);
  assert.equal(wordpressRequests[0].tool_mode, 'pattern_rewrite');
  assert.equal(wordpressRequests[0].user_id, `pattern:${ownerId}:${validPatternId}`);

  const storedRewrite = (
    await client.query(
      `SELECT user_id, pattern_id, prompt, rewrite_result
       FROM rewrite_sessions
       WHERE user_id = $1 AND pattern_id = $2`,
      [ownerId, validPatternId],
    )
  ).rows[0];
  assert.deepEqual(storedRewrite, {
    user_id: ownerId,
    pattern_id: validPatternId,
    prompt: '  Rewrite the sleeve shaping in plain English.  ',
    rewrite_result: 'Fallback rewrite answer',
  });
});
