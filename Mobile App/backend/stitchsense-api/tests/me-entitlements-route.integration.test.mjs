import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('me routes return scoped identity and current entitlement state', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.STRIPE_SECRET_KEY = '';

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
    `INSERT INTO users (email, display_name, role, standard_trial_ends_at, created_at) VALUES
       ('me-owner@example.test', 'Me Owner', 'user', NOW() - INTERVAL '1 day', '2026-09-17T08:00:00Z'),
       ('me-trial@example.test', 'Me Trial', 'user', NOW() + INTERVAL '14 days', '2026-09-17T08:05:00Z'),
       ('me-other@example.test', 'Me Other', 'admin', NOW() - INTERVAL '1 day', '2026-09-17T08:10:00Z')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'me-owner@example.test').id;
  const trialId = users.rows.find((row) => row.email === 'me-trial@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'me-other@example.test').id;

  await client.query(
    `INSERT INTO manual_entitlements (user_id, type, starts_at, expires_at, reason)
     VALUES ($1, 'courtesy_access', '2026-09-17T09:00:00Z', NOW() + INTERVAL '30 days', 'startup entitlement test')`,
    [ownerId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId, email: 'wrong-email@example.test' })}`;
  const trialAuthorization = `Bearer ${app.jwt.sign({ sub: trialId })}`;

  const unauthenticatedMe = await app.inject({
    method: 'GET',
    url: '/me',
  });
  assert.equal(unauthenticatedMe.statusCode, 401, unauthenticatedMe.body);

  const me = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json().user.id, ownerId);
  assert.equal(me.json().user.email, 'me-owner@example.test');
  assert.equal(me.json().user.display_name, 'Me Owner');
  assert.equal(me.json().user.role, 'user');
  assert.match(me.json().user.created_at, /^2026-09-17T08:00:00/);
  assert.equal(me.json().user.password_hash, undefined);

  const ownerEntitlement = await app.inject({
    method: 'GET',
    url: '/me/entitlements',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerEntitlement.statusCode, 200, ownerEntitlement.body);
  assert.equal(ownerEntitlement.json().entitlement.plan, 'pro');
  assert.equal(ownerEntitlement.json().entitlement.status, 'active');
  assert.equal(ownerEntitlement.json().entitlement.accessSource, 'courtesy_access');
  assert.equal(ownerEntitlement.json().entitlement.features.patternUploads, true);
  assert.equal(ownerEntitlement.json().entitlement.features.aiChat, true);
  assert.equal(ownerEntitlement.json().entitlement.features.rewrite, true);
  assert.equal(ownerEntitlement.json().entitlement.features.stitchVision, true);
  assert.equal(ownerEntitlement.json().entitlement.features.ravelryImport, true);

  const trialEntitlement = await app.inject({
    method: 'GET',
    url: '/me/entitlements',
    headers: { authorization: trialAuthorization },
  });
  assert.equal(trialEntitlement.statusCode, 200, trialEntitlement.body);
  assert.equal(trialEntitlement.json().entitlement.plan, 'trial');
  assert.equal(trialEntitlement.json().entitlement.status, 'trialing');
  assert.equal(trialEntitlement.json().entitlement.accessSource, 'standard_trial');
  assert.equal(trialEntitlement.json().entitlement.features.stitchVision, true);

  const leakedOtherUser = await client.query(
    `SELECT email, role
     FROM users
     WHERE id = $1`,
    [otherId],
  );
  assert.deepEqual(leakedOtherUser.rows[0], { email: 'me-other@example.test', role: 'admin' });
  assert.notEqual(me.json().user.id, otherId);
});
