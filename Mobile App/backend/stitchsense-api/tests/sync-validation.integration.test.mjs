import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('sync validation reports platform counts, deletes, and project integrity', {
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
  await client.connect();
  t.after(async () => {
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
       VALUES ('sync-validation@example.test', 'Sync Validation')
       RETURNING id`,
    )
  ).rows[0].id;

  const activePatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, original_filename, source, updated_at)
       VALUES ($1, 'Active cardigan', 'active-cardigan.pdf', 'upload', '2026-09-11T08:00:00Z')
       RETURNING id`,
      [userId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO user_patterns (user_id, title, original_filename, source, deleted_at, updated_at)
     VALUES ($1, 'Deleted cardigan', 'deleted-cardigan.pdf', 'upload', '2026-09-11T08:30:00Z', '2026-09-11T08:30:00Z')`,
    [userId],
  );

  const activeProjectId = (
    await client.query(
      `INSERT INTO projects (user_id, pattern_id, title, status, updated_at)
       VALUES ($1, $2, 'Active project', 'active', '2026-09-11T09:00:00Z')
       RETURNING id`,
      [userId, activePatternId],
    )
  ).rows[0].id;
  const deletedProjectId = (
    await client.query(
      `INSERT INTO projects (user_id, pattern_id, title, status, deleted_at, updated_at)
       VALUES ($1, $2, 'Deleted project', 'archived', '2026-09-11T09:15:00Z', '2026-09-11T09:15:00Z')
       RETURNING id`,
      [userId, activePatternId],
    )
  ).rows[0].id;

  await client.query(
    `INSERT INTO project_counters (user_id, project_id, label, current_value, updated_at)
     VALUES ($1, $2, 'Sleeve rows', 12, '2026-09-11T09:05:00Z')`,
    [userId, activeProjectId],
  );
  await client.query(
    `INSERT INTO project_work_log (user_id, project_id, title, body, created_at)
     VALUES ($1, $2, 'First session', 'Cast on', '2026-09-11T09:06:00Z')`,
    [userId, activeProjectId],
  );
  await client.query(
    `INSERT INTO project_photos (user_id, project_id, file_key, file_mime_type, updated_at)
     VALUES ($1, $2, 'projects/photo.jpg', 'image/jpeg', '2026-09-11T09:07:00Z')`,
    [userId, activeProjectId],
  );
  await client.query(
    `INSERT INTO project_pattern_marks (user_id, project_id, pattern_id, mark_type, label, updated_at)
     VALUES ($1, $2, $3, 'bookmark', 'Neckline', '2026-09-11T09:08:00Z')`,
    [userId, activeProjectId, activePatternId],
  );

  await client.query(
    `INSERT INTO project_counters (user_id, project_id, label, current_value, updated_at)
     VALUES ($1, $2, 'Deleted project counter', 1, '2026-09-11T09:16:00Z')`,
    [userId, deletedProjectId],
  );
  await client.query(
    `INSERT INTO project_work_log (user_id, project_id, title, body, created_at)
     VALUES ($1, $2, 'Deleted project work', 'Should be flagged', '2026-09-11T09:17:00Z')`,
    [userId, deletedProjectId],
  );
  await client.query(
    `INSERT INTO project_photos (user_id, project_id, file_key, file_mime_type, updated_at)
     VALUES ($1, $2, 'projects/deleted-photo.jpg', 'image/jpeg', '2026-09-11T09:18:00Z')`,
    [userId, deletedProjectId],
  );
  await client.query(
    `INSERT INTO project_pattern_marks (user_id, project_id, pattern_id, mark_type, label, updated_at)
     VALUES ($1, $2, $3, 'bookmark', 'Deleted project mark', '2026-09-11T09:19:00Z')`,
    [userId, deletedProjectId, activePatternId],
  );

  const chatId = (
    await client.query(
      `INSERT INTO chat_sessions (user_id, pattern_id, title, updated_at)
       VALUES ($1, $2, 'Pattern chat', '2026-09-11T09:20:00Z')
       RETURNING id`,
      [userId, activePatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO chat_messages (session_id, role, content, created_at)
     VALUES ($1, 'user', 'Where am I?', '2026-09-11T09:21:00Z')`,
    [chatId],
  );
  await client.query(
    `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result, created_at)
     VALUES ($1, $2, 'Make it simpler', 'Simplified steps', '2026-09-11T09:22:00Z')`,
    [userId, activePatternId],
  );

  const { buildApp } = await import('../dist/app.js');
  const poolModule = await import('../dist/db/pool.js');
  pool = poolModule.pool;
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: userId })}`;

  const response = await app.inject({
    method: 'GET',
    url: '/sync/validation',
    headers: { authorization },
  });

  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.wordpress.configured, false);
  assert.equal(body.parity.wordpressMirror.available, false);
  assert.equal(body.library.patterns.count, 1);
  assert.equal(body.library.chatSessions.count, 1);
  assert.equal(body.library.chatMessages.count, 1);
  assert.equal(body.library.rewrites.count, 1);
  assert.equal(body.projects.projects.count, 1);
  assert.equal(body.projects.counters.count, 2);
  assert.equal(body.projects.workLogEntries.count, 2);
  assert.equal(body.projects.photos.count, 2);
  assert.equal(body.projects.marks.count, 2);
  assert.equal(body.parity.projects.recentProjects.length, 1);
  assert.equal(body.parity.projects.recentProjects[0].title, 'Active project');
  assert.equal(body.parity.projects.recentDeletedProjects.length, 1);
  assert.equal(body.parity.projects.recentDeletedProjects[0].title, 'Deleted project');
  assert.deepEqual(body.parity.projects.integrity, {
    orphanProjects: 0,
    orphanCounters: 1,
    orphanWorkLogEntries: 1,
    orphanPhotos: 1,
    orphanMarks: 1,
  });
  assert.equal(body.parity.projects.createUpdateDeleteValidation.passed, false);
  assert.equal(body.parity.projects.createUpdateDeleteValidation.orphanCount, 4);
});
