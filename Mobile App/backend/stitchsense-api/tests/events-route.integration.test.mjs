import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('mobile events route records authenticated audit events with validated payloads', {
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
       ('events-owner@example.test', 'Events Owner'),
       ('events-other@example.test', 'Events Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'events-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'events-other@example.test').id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const authorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;

  const unauthenticated = await app.inject({
    method: 'POST',
    url: '/events',
    payload: {
      eventType: 'paywall_viewed',
      metadata: { source: 'settings' },
    },
  });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  const accepted = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization },
    payload: {
      eventType: 'paywall_viewed',
      metadata: {
        source: 'settings',
        screen: 'account',
        nested: { plan: 'pro_monthly' },
      },
    },
  });
  assert.equal(accepted.statusCode, 202, accepted.body);
  assert.deepEqual(accepted.json(), { accepted: true });

  const defaultMetadata = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization },
    payload: {
      eventType: 'subscription_restore_tapped',
    },
  });
  assert.equal(defaultMetadata.statusCode, 202, defaultMetadata.body);
  assert.deepEqual(defaultMetadata.json(), { accepted: true });

  const emptyEventType = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization },
    payload: {
      eventType: '',
    },
  });
  assert.equal(emptyEventType.statusCode, 400, emptyEventType.body);

  const longEventType = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization },
    payload: {
      eventType: 'x'.repeat(121),
    },
  });
  assert.equal(longEventType.statusCode, 400, longEventType.body);

  const auditRows = await client.query(
    `SELECT actor_user_id, target_user_id, event_type, metadata
     FROM audit_events
     ORDER BY created_at ASC`,
  );
  assert.deepEqual(
    auditRows.rows.map((row) => ({
      actor_user_id: row.actor_user_id,
      target_user_id: row.target_user_id,
      event_type: row.event_type,
      metadata: row.metadata,
    })),
    [
      {
        actor_user_id: ownerId,
        target_user_id: ownerId,
        event_type: 'mobile.paywall_viewed',
        metadata: {
          source: 'settings',
          screen: 'account',
          nested: { plan: 'pro_monthly' },
        },
      },
      {
        actor_user_id: ownerId,
        target_user_id: ownerId,
        event_type: 'mobile.subscription_restore_tapped',
        metadata: {},
      },
    ],
  );

  assert.equal(
    auditRows.rows.some((row) => row.actor_user_id === otherId || row.target_user_id === otherId),
    false,
  );
});
