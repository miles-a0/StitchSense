import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('pattern file URL access is scoped to active owned patterns only', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
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
       ('file-owner@example.test', 'File Owner'),
       ('file-other@example.test', 'File Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'file-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'file-other@example.test').id;

  const activePatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, file_url, source)
       VALUES ($1, 'Active file pattern', 'https://example.test/active.pdf', 'upload')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const deletedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, file_url, source, deleted_at)
       VALUES ($1, 'Deleted file pattern', 'https://example.test/deleted.pdf', 'upload', NOW())
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;

  const ownerActive = await app.inject({
    method: 'GET',
    url: `/patterns/${activePatternId}/file-url`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerActive.statusCode, 200, ownerActive.body);
  assert.deepEqual(ownerActive.json(), {
    fileUrl: 'https://example.test/active.pdf',
    fileKey: null,
    expiresIn: null,
  });

  const otherActive = await app.inject({
    method: 'GET',
    url: `/patterns/${activePatternId}/file-url`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(otherActive.statusCode, 404, otherActive.body);

  const ownerDeleted = await app.inject({
    method: 'GET',
    url: `/patterns/${deletedPatternId}/file-url`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerDeleted.statusCode, 404, ownerDeleted.body);

  await app.close();
  await pool.end();
  await client.end();
});
