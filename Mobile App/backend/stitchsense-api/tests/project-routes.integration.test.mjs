import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('project routes cover owner lifecycle, linked pattern guards, and child records', {
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
       ('project-owner@example.test', 'Project Owner'),
       ('project-other@example.test', 'Project Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'project-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'project-other@example.test').id;

  const ownerPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, craft_type, original_filename, source, metadata)
       VALUES ($1, 'Owner Cardigan', 'knitting', 'owner-cardigan.pdf', 'upload', '{"thumbnail_url":"https://example.test/cardigan.png"}')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const deletedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source, deleted_at)
       VALUES ($1, 'Deleted Pattern', 'upload', NOW())
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source)
       VALUES ($1, 'Other Pattern', 'upload')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;

  const missingLinkedPattern = await app.inject({
    method: 'POST',
    url: '/projects',
    headers: { authorization },
    payload: { patternId: otherPatternId },
  });
  assert.equal(missingLinkedPattern.statusCode, 404, missingLinkedPattern.body);
  assert.deepEqual(missingLinkedPattern.json(), { error: 'Linked pattern not found' });

  const deletedLinkedPattern = await app.inject({
    method: 'POST',
    url: '/projects',
    headers: { authorization },
    payload: { patternId: deletedPatternId },
  });
  assert.equal(deletedLinkedPattern.statusCode, 404, deletedLinkedPattern.body);
  assert.deepEqual(deletedLinkedPattern.json(), { error: 'Linked pattern not found' });

  const created = await app.inject({
    method: 'POST',
    url: '/projects',
    headers: { authorization },
    payload: {
      patternId: ownerPatternId,
      title: '  Gift Cardigan  ',
      recipient: '  Mum  ',
      occasion: 'Birthday',
      isGift: true,
      yarnDetails: 'DK wool',
      needleHookDetails: '4mm circulars',
      deadlineAt: '2026-12-24T12:00:00.000Z',
      isFavorite: true,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const project = created.json().project;
  assert.equal(project.title, 'Gift Cardigan');
  assert.equal(project.pattern_id, ownerPatternId);
  assert.equal(project.craft_type, 'knitting');
  assert.equal(project.status, 'active');
  assert.equal(project.stage_label, 'Getting started');
  assert.equal(project.recipient, 'Mum');
  assert.equal(project.is_gift, true);
  assert.equal(project.is_favorite, true);
  assert.equal(project.linked_pattern_title, 'Owner Cardigan');

  const projectId = project.id;

  const listed = await app.inject({
    method: 'GET',
    url: '/projects?search=cardigan&status=active',
    headers: { authorization },
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().projects.length, 1);
  assert.equal(listed.json().projects[0].id, projectId);

  const counterCreated = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/counters`,
    headers: { authorization },
    payload: {
      label: 'Sleeve rows',
      counterType: 'rows',
      currentValue: 12,
      targetValue: 48,
      stepValue: 2,
    },
  });
  assert.equal(counterCreated.statusCode, 201, counterCreated.body);
  const counterId = counterCreated.json().counter.id;

  const counterUpdated = await app.inject({
    method: 'PUT',
    url: `/projects/${projectId}/counters/${counterId}`,
    headers: { authorization },
    payload: { currentValue: 14, notes: 'Finished increase section' },
  });
  assert.equal(counterUpdated.statusCode, 200, counterUpdated.body);
  assert.equal(counterUpdated.json().counter.current_value, 14);
  assert.equal(counterUpdated.json().counter.notes, 'Finished increase section');

  const workLogCreated = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/work-log`,
    headers: { authorization },
    payload: {
      entryType: 'progress',
      title: 'Sleeve session',
      body: 'Two repeats done',
      progressPercent: 45,
      minutesSpent: 75,
    },
  });
  assert.equal(workLogCreated.statusCode, 201, workLogCreated.body);
  const workLogId = workLogCreated.json().entry.id;

  const markCreated = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/marks`,
    headers: { authorization },
    payload: {
      type: 'resume',
      pageNumber: 4,
      locationLabel: 'Sleeve chart',
      note: 'Start at row 15',
    },
  });
  assert.equal(markCreated.statusCode, 201, markCreated.body);
  const markId = markCreated.json().mark.id;
  assert.equal(markCreated.json().mark.label, 'Reading position');

  const markUpdated = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/marks`,
    headers: { authorization },
    payload: {
      type: 'resume',
      pageNumber: 5,
      locationLabel: 'Sleeve chart',
      note: 'Moved to row 20',
    },
  });
  assert.equal(markUpdated.statusCode, 201, markUpdated.body);
  assert.equal(markUpdated.json().mark.id, markId);
  assert.equal(markUpdated.json().mark.page_number, 5);

  const updated = await app.inject({
    method: 'PUT',
    url: `/projects/${projectId}`,
    headers: { authorization },
    payload: {
      status: 'completed',
      progressPercent: 100,
      stageLabel: 'Blocked and wrapped',
      lastWorkedAt: '2026-12-20T18:30:00.000Z',
    },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().project.status, 'completed');
  assert.equal(updated.json().project.progress_percent, 100);
  assert.equal(updated.json().project.stage_label, 'Blocked and wrapped');
  assert.ok(updated.json().project.completed_at);
  assert.equal(updated.json().project.top_counter_label, 'Sleeve rows');
  assert.equal(updated.json().project.latest_log_title, 'Sleeve session');

  const validation = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/sync-validation`,
    headers: { authorization },
  });
  assert.equal(validation.statusCode, 200, validation.body);
  assert.equal(validation.json().project.activeOnPlatform, true);
  assert.equal(validation.json().project.linkedPatternExists, true);
  assert.deepEqual(validation.json().childRecords, {
    counters: 1,
    workLogEntries: 1,
    photos: 0,
    marks: 1,
  });
  assert.equal(validation.json().checks.createVisibleInPlatform, true);
  assert.equal(validation.json().checks.linkedPatternIntegrity, true);

  const counters = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/counters`,
    headers: { authorization },
  });
  assert.equal(counters.statusCode, 200, counters.body);
  assert.equal(counters.json().counters.length, 1);

  const entries = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/work-log`,
    headers: { authorization },
  });
  assert.equal(entries.statusCode, 200, entries.body);
  assert.equal(entries.json().entries.length, 1);

  const marks = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/marks`,
    headers: { authorization },
  });
  assert.equal(marks.statusCode, 200, marks.body);
  assert.equal(marks.json().marks.length, 1);

  const deletedCounter = await app.inject({
    method: 'DELETE',
    url: `/projects/${projectId}/counters/${counterId}`,
    headers: { authorization },
  });
  assert.equal(deletedCounter.statusCode, 204, deletedCounter.body);

  const deletedWorkLog = await app.inject({
    method: 'DELETE',
    url: `/projects/${projectId}/work-log/${workLogId}`,
    headers: { authorization },
  });
  assert.equal(deletedWorkLog.statusCode, 204, deletedWorkLog.body);

  const deletedMark = await app.inject({
    method: 'DELETE',
    url: `/projects/${projectId}/marks/${markId}`,
    headers: { authorization },
  });
  assert.equal(deletedMark.statusCode, 204, deletedMark.body);

  const deletedProject = await app.inject({
    method: 'DELETE',
    url: `/projects/${projectId}`,
    headers: { authorization },
  });
  assert.equal(deletedProject.statusCode, 204, deletedProject.body);

  const deletedProjectRead = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}`,
    headers: { authorization },
  });
  assert.equal(deletedProjectRead.statusCode, 404, deletedProjectRead.body);

  const postDeleteValidation = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/sync-validation`,
    headers: { authorization },
  });
  assert.equal(postDeleteValidation.statusCode, 200, postDeleteValidation.body);
  assert.equal(postDeleteValidation.json().project.activeOnPlatform, false);
  assert.equal(postDeleteValidation.json().checks.createVisibleInPlatform, false);

  const activeRows = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM projects WHERE user_id = $1 AND deleted_at IS NULL) AS active_projects,
       (SELECT COUNT(*)::int FROM project_counters WHERE user_id = $1 AND deleted_at IS NULL) AS active_counters,
       (SELECT COUNT(*)::int FROM project_work_log WHERE user_id = $1 AND deleted_at IS NULL) AS active_work_log,
       (SELECT COUNT(*)::int FROM project_pattern_marks WHERE user_id = $1 AND deleted_at IS NULL) AS active_marks`,
    [ownerId],
  );
  assert.deepEqual(activeRows.rows[0], {
    active_projects: 0,
    active_counters: 0,
    active_work_log: 0,
    active_marks: 0,
  });

});
