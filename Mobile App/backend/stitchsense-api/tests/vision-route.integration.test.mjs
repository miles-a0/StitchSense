import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('Stitch Vision route gates entitlement and handles WordPress bridge fallback', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret-with-32-characters';
  process.env.WORDPRESS_SITE_URL = 'http://wordpress.test/site';
  process.env.N8N_IMAGE_URL = 'http://workflow.test/image';
  process.env.N8N_SHARED_SECRET = 'test-workflow-secret-with-32-characters';

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
      throw new Error(`unexpected upstream request to ${String(input)}`);
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
       ('vision-owner@example.test', 'Vision Owner', NOW() + INTERVAL '14 days'),
       ('vision-unlinked@example.test', 'Vision Unlinked', NOW() + INTERVAL '14 days'),
       ('vision-expired@example.test', 'Vision Expired', NOW() - INTERVAL '1 day')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'vision-owner@example.test').id;
  const unlinkedId = users.rows.find((row) => row.email === 'vision-unlinked@example.test').id;
  const expiredId = users.rows.find((row) => row.email === 'vision-expired@example.test').id;

  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wp|789', '{"wpUserId":789, "siteUrl":"http://attacker.test"}'::jsonb)`,
    [ownerId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const unlinkedAuthorization = `Bearer ${app.jwt.sign({ sub: unlinkedId })}`;
  const expiredAuthorization = `Bearer ${app.jwt.sign({ sub: expiredId })}`;

  const unauthenticated = await app.inject({
    method: 'POST',
    url: '/vision/analyse',
    payload: {
      imageDataUri: 'data:image/png;base64,abc',
      question: 'What is wrong?',
    },
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);
  assert.equal(fetchCalls.length, 0);

  const denied = await app.inject({
    method: 'POST',
    url: '/vision/analyse',
    headers: { authorization: expiredAuthorization },
    payload: {
      imageDataUri: 'data:image/png;base64,abc',
      question: 'What is wrong?',
    },
  });
  assert.equal(denied.statusCode, 402, denied.body);
  assert.equal(denied.json().error, 'Subscription required');
  assert.equal(denied.json().entitlement.features.stitchVision, false);
  assert.equal(fetchCalls.length, 0);

  queuedResponses.push(
    new Response(JSON.stringify({ answer: 'This looks like twisted ribbing.', confidence: 0.91 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const bridged = await app.inject({
    method: 'POST',
    url: '/vision/analyse',
    headers: { authorization: ownerAuthorization },
    payload: {
      imageDataUri: 'data:image/png;base64,abc',
      question: '  What   stitch   is this?  ',
      skillLevel: 'intermediate',
      toolMode: 'freeform',
    },
  });
  assert.equal(bridged.statusCode, 201, bridged.body);
  assert.deepEqual(bridged.json(), {
    result: { answer: 'This looks like twisted ribbing.', confidence: 0.91 },
    source: 'wordpress-bridge',
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].input,
    'http://wordpress.test/site/wp-json/stitchsense/v1/platform-image-proxy?wpUserId=789',
  );
  assert.equal(fetchCalls[0].init.method, 'POST');
  assert.equal(fetchCalls[0].init.redirect, 'error');
  assert.equal(fetchCalls[0].init.headers.accept, 'application/json');
  assert.equal(fetchCalls[0].init.headers['content-type'], 'application/json');
  assert.equal(fetchCalls[0].init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret-with-32-characters');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), {
    imageDataUri: 'data:image/png;base64,abc',
    question: 'What stitch is this?',
    skillLevel: 'intermediate',
    toolMode: 'freeform',
    image_data_uri: 'data:image/png;base64,abc',
    tool_mode: 'stitch_image_analysis',
    requested_tool_mode: 'freeform',
    skill_level: 'intermediate',
    user_id: ownerId,
  });

  const beforeFallbackCalls = fetchCalls.length;
  queuedResponses.push(
    new Response(JSON.stringify({ error: 'No route found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
    new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
    new Response(JSON.stringify({ answer: 'Direct workflow answer' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const longQuestion = `${'purl '.repeat(400)}tail`;
  const fallback = await app.inject({
    method: 'POST',
    url: '/vision/analyse',
    headers: { authorization: ownerAuthorization },
    payload: {
      image_data_uri: 'data:image/jpeg;base64,def',
      question: longQuestion,
    },
  });
  assert.equal(fallback.statusCode, 201, fallback.body);
  assert.deepEqual(fallback.json(), { result: { answer: 'Direct workflow answer' } });
  const fallbackCalls = fetchCalls.slice(beforeFallbackCalls);
  assert.equal(fallbackCalls.length, 3);
  assert.equal(
    fallbackCalls[0].input,
    'http://wordpress.test/site/wp-json/stitchsense/v1/platform-image-proxy?wpUserId=789',
  );
  assert.equal(
    fallbackCalls[1].input,
    'http://wordpress.test/site/wp-json/stitchsense/v1/image-analysis?wpUserId=789',
  );
  assert.equal(fallbackCalls[2].input, 'http://workflow.test/image');
  assert.equal(fallbackCalls[2].init.headers['x-stitchsense-secret'], 'test-workflow-secret-with-32-characters');
  assert.equal(fallbackCalls[2].init.headers['x-pattern-helper-secret'], 'test-workflow-secret-with-32-characters');
  const directWorkflowBody = JSON.parse(fallbackCalls[2].init.body);
  assert.equal(directWorkflowBody.image_data_uri, 'data:image/jpeg;base64,def');
  assert.equal(directWorkflowBody.tool_mode, 'stitch_image_analysis');
  assert.equal(directWorkflowBody.requested_tool_mode, undefined);
  assert.equal(directWorkflowBody.skill_level, 'beginner');
  assert.equal(directWorkflowBody.user_id, ownerId);
  assert.equal(directWorkflowBody.secret, 'test-workflow-secret-with-32-characters');
  assert.equal(directWorkflowBody.question.length <= 1150, true);
  assert.equal(/\s{2,}/.test(directWorkflowBody.question), false);

  const beforeUnlinkedCalls = fetchCalls.length;
  queuedResponses.push(
    new Response(JSON.stringify({ answer: 'Unlinked direct answer' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const directOnly = await app.inject({
    method: 'POST',
    url: '/vision/analyse',
    headers: { authorization: unlinkedAuthorization },
    payload: {},
  });
  assert.equal(directOnly.statusCode, 201, directOnly.body);
  assert.deepEqual(directOnly.json(), { result: { answer: 'Unlinked direct answer' } });
  const unlinkedCalls = fetchCalls.slice(beforeUnlinkedCalls);
  assert.equal(unlinkedCalls.length, 1);
  assert.equal(unlinkedCalls[0].input, 'http://workflow.test/image');
  const unlinkedWorkflowBody = JSON.parse(unlinkedCalls[0].init.body);
  assert.equal(unlinkedWorkflowBody.question, 'What stitch or issue is visible?');
  assert.equal(unlinkedWorkflowBody.tool_mode, 'stitch_image_analysis');
  assert.equal(unlinkedWorkflowBody.skill_level, 'beginner');
  assert.equal(unlinkedWorkflowBody.user_id, unlinkedId);

  queuedResponses.push(
    new Response(JSON.stringify({ error: 'WordPress image service unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const bridgeFailure = await app.inject({
    method: 'POST',
    url: '/vision/analyse',
    headers: { authorization: ownerAuthorization },
    payload: {
      imageDataUri: 'data:image/png;base64,abc',
    },
  });
  assert.equal(bridgeFailure.statusCode, 502, bridgeFailure.body);
  assert.deepEqual(bridgeFailure.json(), { error: 'WordPress image service unavailable' });
});
