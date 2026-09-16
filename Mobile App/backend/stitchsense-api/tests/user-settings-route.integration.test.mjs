import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('user settings routes preserve scoped preferences and partial updates', {
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
       ('settings-owner@example.test', 'Settings Owner'),
       ('settings-other@example.test', 'Settings Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'settings-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'settings-other@example.test').id;

  await client.query(
    `INSERT INTO user_settings (user_id, default_skill, measurement_unit, language, preferences)
     VALUES ($1, 'beginner', 'metric', 'uk', '{"private":true}'::jsonb)`,
    [otherId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;

  const defaults = await app.inject({
    method: 'GET',
    url: '/user/settings',
    headers: { authorization },
  });
  assert.equal(defaults.statusCode, 200, defaults.body);
  assert.deepEqual(defaults.json(), {
    settings: {
      default_skill: 'beginner',
      measurement_unit: 'metric',
      language: 'uk',
      preferences: {},
    },
  });

  const created = await app.inject({
    method: 'PUT',
    url: '/user/settings',
    headers: { authorization },
    payload: {
      defaultSkill: 'advanced',
      measurementUnit: 'imperial',
      language: 'us',
      preferences: {
        reduceMotion: true,
        stitchVision: { contrast: 'high' },
      },
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().settings.user_id, ownerId);
  assert.equal(created.json().settings.default_skill, 'advanced');
  assert.equal(created.json().settings.measurement_unit, 'imperial');
  assert.equal(created.json().settings.language, 'us');
  assert.deepEqual(created.json().settings.preferences, {
    reduceMotion: true,
    stitchVision: { contrast: 'high' },
  });

  const partial = await app.inject({
    method: 'PUT',
    url: '/user/settings',
    headers: { authorization },
    payload: {
      language: 'uk',
    },
  });
  assert.equal(partial.statusCode, 200, partial.body);
  assert.equal(partial.json().settings.default_skill, 'advanced');
  assert.equal(partial.json().settings.measurement_unit, 'imperial');
  assert.equal(partial.json().settings.language, 'uk');
  assert.deepEqual(partial.json().settings.preferences, {
    reduceMotion: true,
    stitchVision: { contrast: 'high' },
  });

  const preferencesOnly = await app.inject({
    method: 'PUT',
    url: '/user/settings',
    headers: { authorization },
    payload: {
      preferences: {
        reduceMotion: false,
        betaFlags: ['project-focus'],
      },
    },
  });
  assert.equal(preferencesOnly.statusCode, 200, preferencesOnly.body);
  assert.equal(preferencesOnly.json().settings.default_skill, 'advanced');
  assert.equal(preferencesOnly.json().settings.measurement_unit, 'imperial');
  assert.equal(preferencesOnly.json().settings.language, 'uk');
  assert.deepEqual(preferencesOnly.json().settings.preferences, {
    reduceMotion: false,
    betaFlags: ['project-focus'],
  });

  const reloaded = await app.inject({
    method: 'GET',
    url: '/user/settings',
    headers: { authorization },
  });
  assert.equal(reloaded.statusCode, 200, reloaded.body);
  assert.equal(reloaded.json().settings.default_skill, 'advanced');
  assert.equal(reloaded.json().settings.measurement_unit, 'imperial');
  assert.equal(reloaded.json().settings.language, 'uk');

  const otherSettings = await client.query(
    `SELECT default_skill, measurement_unit, language, preferences
     FROM user_settings
     WHERE user_id = $1`,
    [otherId],
  );
  assert.deepEqual(otherSettings.rows[0], {
    default_skill: 'beginner',
    measurement_unit: 'metric',
    language: 'uk',
    preferences: { private: true },
  });
});
