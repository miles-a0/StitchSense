import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('WordPress sync does not resurrect stale deleted Ravelry patterns', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret';
  process.env.WORDPRESS_SITE_URL = 'http://wordpress.test';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let pool;
  const originalFetch = globalThis.fetch;
  let wordpressPayload;

  t.after(async () => {
    globalThis.fetch = originalFetch;
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
       VALUES ('wordpress-sync-regression@example.test', 'WordPress Sync Regression')
       RETURNING id`,
    )
  ).rows[0].id;

  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wp|42', '{"wpUserId":42}')`,
    [userId],
  );

  const deletedPatternId = (
    await client.query(
      `INSERT INTO user_patterns
       (user_id, title, original_filename, source, metadata, deleted_at, updated_at)
       VALUES (
         $1,
         'Deleted stale Ravelry import',
         'deleted-stale-ravelry.pdf',
         'ravelry',
         '{"ravelry_id":"12345","external_service":"ravelry","wordpress_pattern_id":"wp-stale"}',
         '2026-09-14T09:00:00Z',
         '2026-09-14T09:00:00Z'
       )
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://wordpress.test/wp-json/stitchsense/v1/platform-export');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['x-stitchsense-wordpress-secret'], 'test-wordpress-secret');
    return new Response(JSON.stringify(wordpressPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const { syncWordPressLibraryForUser } = await import('../dist/services/wordpressSync.js');
  const poolModule = await import('../dist/db/pool.js');
  pool = poolModule.pool;

  wordpressPayload = {
    user: { legacy_wp_user_id: 42 },
    patterns: [
      {
        id: 'wp-stale',
        title: 'Deleted stale Ravelry import',
        original_filename: 'deleted-stale-ravelry.pdf',
        source: 'ravelry',
        metadata: {
          ravelry_id: '12345',
          external_service: 'ravelry',
        },
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-14T08:59:00Z',
      },
    ],
  };

  const staleSync = await syncWordPressLibraryForUser(userId);
  assert.deepEqual(staleSync, { synced: true, patterns: 1, chats: 0, rewrites: 0 });

  let pattern = await client.query(
    `SELECT title, deleted_at, updated_at, metadata
     FROM user_patterns
     WHERE id = $1`,
    [deletedPatternId],
  );
  assert.equal(pattern.rowCount, 1);
  assert.equal(pattern.rows[0].title, 'Deleted stale Ravelry import');
  assert.equal(pattern.rows[0].deleted_at.toISOString(), '2026-09-14T09:00:00.000Z');
  assert.equal(pattern.rows[0].updated_at.toISOString(), '2026-09-14T09:00:00.000Z');
  assert.equal(pattern.rows[0].metadata.wordpress_pattern_id, 'wp-stale');

  wordpressPayload = {
    user: { legacy_wp_user_id: 42 },
    patterns: [
      {
        id: 'wp-stale',
        title: 'Updated Ravelry import',
        original_filename: 'updated-ravelry.pdf',
        source: 'ravelry',
        metadata: {
          ravelry_id: '12345',
          external_service: 'ravelry',
          stored_pdf_url: 'https://patterns.example.test/updated-ravelry.pdf',
        },
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-14T09:01:00Z',
      },
    ],
  };

  const newerSync = await syncWordPressLibraryForUser(userId);
  assert.deepEqual(newerSync, { synced: true, patterns: 1, chats: 0, rewrites: 0 });

  pattern = await client.query(
    `SELECT title, original_filename, deleted_at, updated_at, metadata
     FROM user_patterns
     WHERE id = $1`,
    [deletedPatternId],
  );
  assert.equal(pattern.rowCount, 1);
  assert.equal(pattern.rows[0].title, 'Updated Ravelry import');
  assert.equal(pattern.rows[0].original_filename, 'updated-ravelry.pdf');
  assert.equal(pattern.rows[0].deleted_at, null);
  assert.equal(pattern.rows[0].updated_at.toISOString(), '2026-09-14T09:01:00.000Z');
  assert.equal(pattern.rows[0].metadata.ravelry_id, '12345');
  assert.equal(pattern.rows[0].metadata.stored_pdf_url, 'https://patterns.example.test/updated-ravelry.pdf');
});
