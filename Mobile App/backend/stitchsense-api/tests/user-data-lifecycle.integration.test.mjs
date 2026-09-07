import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('user data export and deletion are scoped to the authenticated user', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = '';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('export-owner@example.test', 'Export Owner'),
       ('export-other@example.test', 'Export Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'export-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'export-other@example.test').id;

  const ownerPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, metadata)
       VALUES ($1, 'Owner pattern', 'upload', '{"scope":"owner"}')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, metadata)
       VALUES ($1, 'Other pattern', 'upload', '{"scope":"other"}')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  const ownerProjectId = (
    await client.query(
      `INSERT INTO projects (user_id, pattern_id, title)
       VALUES ($1, $2, 'Owner project')
       RETURNING id`,
      [ownerId, ownerPatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO projects (user_id, pattern_id, title)
     VALUES ($1, $2, 'Other project')`,
    [otherId, otherPatternId],
  );

  await client.query(
    `INSERT INTO project_counters (user_id, project_id, label)
     VALUES ($1, $2, 'Rows')`,
    [ownerId, ownerProjectId],
  );
  await client.query(
    `INSERT INTO project_work_log (user_id, project_id, title, body)
     VALUES ($1, $2, 'Progress', 'Owner project note')`,
    [ownerId, ownerProjectId],
  );
  await client.query(
    `INSERT INTO project_pattern_marks (user_id, project_id, pattern_id, mark_type, label)
     VALUES ($1, $2, $3, 'bookmark', 'Sleeve')`,
    [ownerId, ownerProjectId, ownerPatternId],
  );
  await client.query(
    `INSERT INTO project_photos (user_id, project_id, file_key, caption)
     VALUES ($1, $2, 'owner/project-photo.jpg', 'Owner photo')`,
    [ownerId, ownerProjectId],
  );
  await client.query(
    `INSERT INTO stash_items (user_id, category, name, notes)
     VALUES ($1, 'yarn', 'Owner stash', 'Owner stash note'),
            ($2, 'yarn', 'Other stash', 'Other stash note')`,
    [ownerId, otherId],
  );

  const ownerChatId = (
    await client.query(
      `INSERT INTO chat_sessions (user_id, pattern_id, title)
       VALUES ($1, $2, 'Owner chat')
       RETURNING id`,
      [ownerId, ownerPatternId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO chat_sessions (user_id, pattern_id, title)
     VALUES ($1, $2, 'Other chat')`,
    [otherId, otherPatternId],
  );
  await client.query(
    `INSERT INTO chat_messages (session_id, role, content)
     VALUES ($1, 'user', 'Owner message')`,
    [ownerChatId],
  );
  await client.query(
    `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result)
     VALUES ($1, $2, 'Owner prompt', 'Owner rewrite'),
            ($3, $4, 'Other prompt', 'Other rewrite')`,
    [ownerId, ownerPatternId, otherId, otherPatternId],
  );
  await client.query(
    `INSERT INTO user_settings (user_id, default_skill, measurement_unit, language, preferences)
     VALUES ($1, 'advanced', 'metric', 'uk', '{"theme":"warm"}')`,
    [ownerId],
  );
  await client.query(
    `INSERT INTO user_connections (user_id, service, access_token, refresh_token, metadata)
     VALUES ($1, 'ravelry', 'secret-access-token', 'secret-refresh-token', '{"username":"owner"}')`,
    [ownerId],
  );

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;

  const exportResponse = await app.inject({ method: 'GET', url: '/user/export', headers: { authorization } });
  assert.equal(exportResponse.statusCode, 200, exportResponse.body);
  const exported = exportResponse.json();
  assert.equal(exported.userId, ownerId);
  assert.equal(exported.patterns.length, 1);
  assert.equal(exported.projects.length, 1);
  assert.equal(exported.projectCounters.length, 1);
  assert.equal(exported.projectWorkLog.length, 1);
  assert.equal(exported.projectPatternMarks.length, 1);
  assert.equal(exported.projectPhotos.length, 1);
  assert.equal(exported.stashItems.length, 1);
  assert.equal(exported.chatSessions.length, 1);
  assert.equal(exported.chatMessages.length, 1);
  assert.equal(exported.rewriteSessions.length, 1);
  assert.equal(exported.settings.user_id, ownerId);
  assert.equal(exported.connections.length, 1);
  assert.equal(exported.connections[0].service, 'ravelry');
  assert.equal('access_token' in exported.connections[0], false);
  assert.equal('refresh_token' in exported.connections[0], false);

  const missingConfirmation = await app.inject({
    method: 'POST',
    url: '/user/delete-data',
    headers: { authorization },
    payload: { confirm: 'delete' },
  });
  assert.equal(missingConfirmation.statusCode, 400, missingConfirmation.body);

  const deleteResponse = await app.inject({
    method: 'POST',
    url: '/user/delete-data',
    headers: { authorization },
    payload: { confirm: 'DELETE' },
  });
  assert.equal(deleteResponse.statusCode, 202, deleteResponse.body);
  assert.deepEqual(deleteResponse.json(), { deleted: true });

  const ownerDeleted = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM rewrite_sessions WHERE user_id = $1) AS rewrites,
       (SELECT COUNT(*)::int FROM chat_sessions WHERE user_id = $1) AS chats,
       (SELECT COUNT(*)::int FROM user_connections WHERE user_id = $1) AS connections,
       (SELECT COUNT(*)::int FROM user_settings WHERE user_id = $1) AS settings,
       (SELECT COUNT(*)::int FROM user_patterns WHERE user_id = $1 AND deleted_at IS NULL) AS active_patterns,
       (SELECT COUNT(*)::int FROM projects WHERE user_id = $1 AND deleted_at IS NULL) AS active_projects,
       (SELECT COUNT(*)::int FROM project_counters WHERE user_id = $1 AND deleted_at IS NULL) AS active_counters,
       (SELECT COUNT(*)::int FROM project_work_log WHERE user_id = $1 AND deleted_at IS NULL) AS active_work_log,
       (SELECT COUNT(*)::int FROM project_pattern_marks WHERE user_id = $1 AND deleted_at IS NULL) AS active_marks,
       (SELECT COUNT(*)::int FROM project_photos WHERE user_id = $1 AND deleted_at IS NULL) AS active_photos,
       (SELECT COUNT(*)::int FROM stash_items WHERE user_id = $1 AND deleted_at IS NULL) AS active_stash`,
    [ownerId],
  );
  assert.deepEqual(ownerDeleted.rows[0], {
    rewrites: 0,
    chats: 0,
    connections: 0,
    settings: 0,
    active_patterns: 0,
    active_projects: 0,
    active_counters: 0,
    active_work_log: 0,
    active_marks: 0,
    active_photos: 0,
    active_stash: 0,
  });

  const otherStillActive = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM user_patterns WHERE user_id = $1 AND deleted_at IS NULL) AS active_patterns,
       (SELECT COUNT(*)::int FROM projects WHERE user_id = $1 AND deleted_at IS NULL) AS active_projects,
       (SELECT COUNT(*)::int FROM stash_items WHERE user_id = $1 AND deleted_at IS NULL) AS active_stash,
       (SELECT COUNT(*)::int FROM rewrite_sessions WHERE user_id = $1) AS rewrites`,
    [otherId],
  );
  assert.deepEqual(otherStillActive.rows[0], {
    active_patterns: 1,
    active_projects: 1,
    active_stash: 1,
    rewrites: 1,
  });

  const deleteAccountUser = await client.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ('delete-account@example.test', 'Delete Account', crypt('delete-account-password', gen_salt('bf')))
     RETURNING id`,
  );
  const deleteAccountUserId = deleteAccountUser.rows[0].id;
  const deleteAccountPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source)
       VALUES ($1, 'Delete account pattern', 'upload')
       RETURNING id`,
      [deleteAccountUserId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO projects (user_id, pattern_id, title)
     VALUES ($1, $2, 'Delete account project')`,
    [deleteAccountUserId, deleteAccountPatternId],
  );
  await client.query(
    `INSERT INTO stash_items (user_id, category, name)
     VALUES ($1, 'tool', 'Delete account tool')`,
    [deleteAccountUserId],
  );
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'delete-account@example.test', password: 'delete-account-password' },
  });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  const login = loginResponse.json();
  const deleteAccountAuthorization = `Bearer ${login.accessToken}`;

  const missingDeleteAccountConfirmation = await app.inject({
    method: 'POST',
    url: '/user/delete-account',
    headers: { authorization: deleteAccountAuthorization },
    payload: { confirm: 'DELETE' },
  });
  assert.equal(missingDeleteAccountConfirmation.statusCode, 400, missingDeleteAccountConfirmation.body);

  const deleteAccountResponse = await app.inject({
    method: 'POST',
    url: '/user/delete-account',
    headers: { authorization: deleteAccountAuthorization },
    payload: { confirm: 'DELETE_ACCOUNT' },
  });
  assert.equal(deleteAccountResponse.statusCode, 202, deleteAccountResponse.body);
  assert.deepEqual(deleteAccountResponse.json(), { deleted: true, accountDeleted: true });

  const deletedAccountState = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE id = $1) AS users,
       (SELECT COUNT(*)::int FROM refresh_tokens WHERE user_id = $1) AS refresh_tokens,
       (SELECT COUNT(*)::int FROM subscriptions WHERE user_id = $1) AS subscriptions`,
    [deleteAccountUserId],
  );
  assert.deepEqual(deletedAccountState.rows[0], {
    users: 0,
    refresh_tokens: 0,
    subscriptions: 0,
  });

  const meAfterAccountDeletion = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: deleteAccountAuthorization },
  });
  assert.equal(meAfterAccountDeletion.statusCode, 401, meAfterAccountDeletion.body);

  await app.close();
  await pool.end();
  await client.end();
});
