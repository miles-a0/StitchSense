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

  const editedAfterArchiveId = (
    await client.query(
      `INSERT INTO user_patterns (id, user_id, title, source, metadata, updated_at)
       VALUES ('0b9d2c6e-4f3a-4c1d-9e8f-1a2b3c4d5e6f', $1, 'Edited in the app after web archive', 'upload',
               '{"wordpress_pattern_id":"0b9d2c6e-4f3a-4c1d-9e8f-1a2b3c4d5e6f"}', '2026-10-01T12:00:00Z')
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;

  wordpressPayload = {
    user: { legacy_wp_user_id: 42 },
    patterns: [
      {
        id: 'wp-stale',
        title: 'Updated Ravelry import',
        source: 'ravelry',
        metadata: { ravelry_id: '12345', external_service: 'ravelry' },
        is_archived: true,
        updated_at: '2026-09-14 09:05:00',
      },
      {
        id: 'wp-archived-never-imported',
        title: 'Archived on the web before the app existed',
        source: 'upload',
        is_archived: true,
        updated_at: '2026-06-01 10:00:00',
      },
      {
        id: editedAfterArchiveId,
        title: 'Edited in the app after web archive',
        source: 'upload',
        is_archived: true,
        updated_at: '2026-09-20 10:00:00',
      },
    ],
    chat_sessions: [{ id: 'wp-chat-on-archived', pattern_id: 'wp-archived-never-imported', title: 'Archived chat' }],
    chat_messages: [{ session_id: 'wp-chat-on-archived', role: 'user', content: 'Archived question' }],
  };

  await syncWordPressLibraryForUser(userId);

  pattern = await client.query('SELECT deleted_at, metadata FROM user_patterns WHERE id = $1', [deletedPatternId]);
  assert.notEqual(pattern.rows[0].deleted_at, null, 'an archived WordPress pattern retires the matching platform pattern');
  assert.equal(pattern.rows[0].metadata.wordpress_tombstone_source, 'wordpress_archived');
  const neverImported = await client.query(
    `SELECT COUNT(*)::int AS count FROM user_patterns WHERE metadata->>'wordpress_pattern_id' = 'wp-archived-never-imported'`,
  );
  assert.equal(neverImported.rows[0].count, 0, 'archived WordPress patterns are never imported as active');
  const archivedChats = await client.query(`SELECT COUNT(*)::int AS count FROM chat_sessions WHERE title = 'Archived chat'`);
  assert.equal(archivedChats.rows[0].count, 0);
  const edited = await client.query('SELECT deleted_at FROM user_patterns WHERE id = $1', [editedAfterArchiveId]);
  assert.equal(edited.rows[0].deleted_at, null, 'a pattern changed in the app after the web archive stays active');

  wordpressPayload.patterns[0].updated_at = '2026-12-31 23:59:59';
  await syncWordPressLibraryForUser(userId);
  pattern = await client.query('SELECT deleted_at FROM user_patterns WHERE id = $1', [deletedPatternId]);
  assert.notEqual(pattern.rows[0].deleted_at, null, 'a later archive timestamp never resurrects the pattern');

  const { wordpressPendingSyncForUser } = await import('../dist/services/wordpressSync.js');
  const pending = await wordpressPendingSyncForUser(userId);
  assert.equal(pending.counts.patterns, 0, 'archived WordPress patterns are not reported as missing from the platform');

  const renamedId = '5f1e2d3c-4b5a-4968-8776-655443322110';
  await client.query(
    `INSERT INTO user_patterns (id, user_id, title, source, pattern_summary_text, metadata, updated_at)
     VALUES ($1::uuid, $2, 'Renamed in the app', 'upload', 'Platform summary',
             jsonb_build_object('wordpress_pattern_id', $3::text, 'app_only', true), '2026-10-10T12:00:00Z')`,
    [renamedId, userId, renamedId],
  );
  wordpressPayload = {
    user: { legacy_wp_user_id: 42 },
    patterns: [
      {
        id: renamedId,
        title: 'Original WordPress title',
        source: 'upload',
        pattern_summary_text: 'Older WordPress summary',
        updated_at: '2026-09-01 10:00:00',
      },
    ],
  };
  await syncWordPressLibraryForUser(userId);
  let renamed = await client.query('SELECT title, pattern_summary_text, metadata, updated_at FROM user_patterns WHERE id = $1', [renamedId]);
  assert.equal(renamed.rows[0].title, 'Renamed in the app', 'an older WordPress copy does not undo a newer platform edit');
  assert.equal(renamed.rows[0].pattern_summary_text, 'Platform summary');
  assert.equal(renamed.rows[0].metadata.app_only, true);
  assert.equal(renamed.rows[0].updated_at.toISOString(), '2026-10-10T12:00:00.000Z');

  wordpressPayload.patterns[0].title = 'Renamed on WordPress later';
  wordpressPayload.patterns[0].updated_at = '2026-10-12 09:00:00';
  await syncWordPressLibraryForUser(userId);
  renamed = await client.query('SELECT title, updated_at FROM user_patterns WHERE id = $1', [renamedId]);
  assert.equal(renamed.rows[0].title, 'Renamed on WordPress later', 'a newer WordPress edit still wins');
  assert.equal(renamed.rows[0].updated_at.toISOString(), '2026-10-12T09:00:00.000Z');
});
