import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('rewrite import and listing routes preserve ownership and imported metadata', {
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
       ('rewrite-owner@example.test', 'Rewrite Owner'),
       ('rewrite-other@example.test', 'Rewrite Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'rewrite-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'rewrite-other@example.test').id;

  const ownerPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source)
       VALUES ($1, 'Owner rewrite pattern', 'upload')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source)
       VALUES ($1, 'Other rewrite pattern', 'upload')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  await client.query(
    `INSERT INTO rewrite_sessions
       (user_id, pattern_id, prompt, rewrite_result, rewrite_changes, rewrite_warnings, confidence_score, created_at)
     VALUES
       ($1, $2, 'Existing prompt', 'Existing rewrite', '[]'::jsonb, '[]'::jsonb, 50, '2026-09-17T09:00:00Z'),
       ($3, $4, 'Other prompt', 'Other rewrite', '[]'::jsonb, '[]'::jsonb, 60, '2026-09-17T09:30:00Z')`,
    [ownerId, ownerPatternId, otherId, otherPatternId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;

  const unauthenticated = await app.inject({
    method: 'POST',
    url: '/rewrites/import',
    payload: {
      patternId: ownerPatternId,
      rewriteResult: 'Imported rewrite',
    },
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const crossUserImport = await app.inject({
    method: 'POST',
    url: '/rewrites/import',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: otherPatternId,
      rewriteResult: 'Should not import',
    },
  });
  assert.equal(crossUserImport.statusCode, 404, crossUserImport.body);
  assert.deepEqual(crossUserImport.json(), { error: 'Pattern not found' });

  const invalidImport = await app.inject({
    method: 'POST',
    url: '/rewrites/import',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: ownerPatternId,
      rewriteResult: '',
    },
  });
  assert.equal(invalidImport.statusCode, 400, invalidImport.body);

  const imported = await app.inject({
    method: 'POST',
    url: '/rewrites/import',
    headers: { authorization: ownerAuthorization },
    payload: {
      patternId: ownerPatternId,
      prompt: 'Make the sleeve shaping clearer',
      rewriteResult: 'Work decreases every fourth row until 48 stitches remain.',
      rewriteChanges: [{ section: 'Sleeve', type: 'clarity' }],
      rewriteWarnings: ['Check size grading before publishing'],
      confidenceScore: 87,
      createdAt: '2026-09-17T10:00:00.000Z',
    },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  assert.equal(imported.json().imported, true);
  assert.equal(imported.json().rewrite.user_id, ownerId);
  assert.equal(imported.json().rewrite.pattern_id, ownerPatternId);
  assert.equal(imported.json().rewrite.prompt, 'Make the sleeve shaping clearer');
  assert.equal(imported.json().rewrite.rewrite_result, 'Work decreases every fourth row until 48 stitches remain.');
  assert.deepEqual(imported.json().rewrite.rewrite_changes, [{ section: 'Sleeve', type: 'clarity' }]);
  assert.deepEqual(imported.json().rewrite.rewrite_warnings, ['Check size grading before publishing']);
  assert.equal(imported.json().rewrite.confidence_score, 87);
  assert.match(imported.json().rewrite.created_at, /^2026-09-17T10:00:00/);

  const ownerList = await app.inject({
    method: 'GET',
    url: `/patterns/${ownerPatternId}/rewrites`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerList.statusCode, 200, ownerList.body);
  assert.deepEqual(
    ownerList.json().rewrites.map((rewrite) => ({
      prompt: rewrite.prompt,
      rewrite_result: rewrite.rewrite_result,
      user_id: rewrite.user_id,
    })),
    [
      {
        prompt: 'Make the sleeve shaping clearer',
        rewrite_result: 'Work decreases every fourth row until 48 stitches remain.',
        user_id: ownerId,
      },
      {
        prompt: 'Existing prompt',
        rewrite_result: 'Existing rewrite',
        user_id: ownerId,
      },
    ],
  );

  const otherList = await app.inject({
    method: 'GET',
    url: `/patterns/${ownerPatternId}/rewrites`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(otherList.statusCode, 200, otherList.body);
  assert.deepEqual(otherList.json(), { rewrites: [] });

  const stored = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM rewrite_sessions
     WHERE user_id = $1
       AND pattern_id = $2`,
    [otherId, ownerPatternId],
  );
  assert.equal(stored.rows[0].count, 0);
});
