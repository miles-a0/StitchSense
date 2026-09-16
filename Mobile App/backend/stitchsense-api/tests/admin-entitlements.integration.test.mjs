import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('admin entitlement routes grant, list, report, and revoke manual access', {
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
    `INSERT INTO users (email, display_name, role, standard_trial_ends_at) VALUES
       ('admin-entitlements@example.test', 'Admin Entitlements', 'admin', NOW() + INTERVAL '14 days'),
       ('entitled-user@example.test', 'Entitled User', 'user', NOW() - INTERVAL '1 day'),
       ('standard-user@example.test', 'Standard User', 'user', NOW() - INTERVAL '1 day')
     RETURNING id, email`,
  );
  const adminId = users.rows.find((row) => row.email === 'admin-entitlements@example.test').id;
  const targetUserId = users.rows.find((row) => row.email === 'entitled-user@example.test').id;
  const standardUserId = users.rows.find((row) => row.email === 'standard-user@example.test').id;

  await client.query(
    `INSERT INTO subscriptions (user_id, provider, provider_subscription_id, plan, status, current_period_end, metadata)
     VALUES ($1, 'apple', 'apple-sub-1', 'pro_monthly', 'active', NOW() + INTERVAL '1 month', '{"environment":"sandbox"}'::jsonb)`,
    [standardUserId],
  );
  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', 'wp-entitled-user', '{"wpUserId":"123", "siteUrl":"https://catlowyarns.co.uk"}'::jsonb)`,
    [targetUserId],
  );

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const adminAuthorization = `Bearer ${app.jwt.sign({ sub: adminId })}`;
  const userAuthorization = `Bearer ${app.jwt.sign({ sub: standardUserId })}`;

  const denied = await app.inject({
    method: 'GET',
    url: '/admin/entitlements',
    headers: { authorization: userAuthorization },
  });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.deepEqual(denied.json(), { error: 'Admin access required' });

  const grant = await app.inject({
    method: 'POST',
    url: '/admin/entitlements',
    headers: { authorization: adminAuthorization },
    payload: {
      userId: targetUserId,
      type: 'courtesy_access',
      startsAt: '2026-09-16T10:00:00.000Z',
      expiresAt: '2026-10-16T10:00:00.000Z',
      reason: 'launch support validation',
    },
  });
  assert.equal(grant.statusCode, 201, grant.body);
  const grantBody = grant.json().grant;
  assert.equal(grantBody.user_id, targetUserId);
  assert.equal(grantBody.type, 'courtesy_access');
  assert.equal(grantBody.reason, 'launch support validation');
  assert.equal(grantBody.granted_by_user_id, adminId);
  const grantId = grantBody.id;

  const grants = await app.inject({
    method: 'GET',
    url: '/admin/entitlements',
    headers: { authorization: adminAuthorization },
  });
  assert.equal(grants.statusCode, 200, grants.body);
  assert.equal(grants.json().grants.length, 1);
  assert.equal(grants.json().grants[0].id, grantId);
  assert.equal(grants.json().grants[0].email, 'entitled-user@example.test');

  const access = await app.inject({
    method: 'GET',
    url: '/admin/users/access',
    headers: { authorization: adminAuthorization },
  });
  assert.equal(access.statusCode, 200, access.body);
  const accessUsers = access.json().users;
  const entitledAccess = accessUsers.find((user) => user.platformUserId === targetUserId);
  const paidAccess = accessUsers.find((user) => user.platformUserId === standardUserId);
  assert.equal(entitledAccess.email, 'entitled-user@example.test');
  assert.equal(entitledAccess.wpUserId, '123');
  assert.equal(entitledAccess.siteUrl, 'https://catlowyarns.co.uk');
  assert.deepEqual(entitledAccess.entitlement, {
    plan: 'pro',
    status: 'active',
    accessSource: 'courtesy_access',
    trialEndsAt: '2026-10-16T10:00:00.000Z',
  });
  assert.equal(paidAccess.entitlement.plan, 'pro_monthly');
  assert.equal(paidAccess.entitlement.accessSource, 'apple');
  assert.equal(paidAccess.subscription.status, 'active');
  assert.deepEqual(paidAccess.subscription.metadata, { environment: 'sandbox' });

  const revoke = await app.inject({
    method: 'DELETE',
    url: `/admin/entitlements/${grantId}`,
    headers: { authorization: adminAuthorization },
  });
  assert.equal(revoke.statusCode, 204, revoke.body);

  const revokeAgain = await app.inject({
    method: 'DELETE',
    url: `/admin/entitlements/${grantId}`,
    headers: { authorization: adminAuthorization },
  });
  assert.equal(revokeAgain.statusCode, 204, revokeAgain.body);

  const auditRows = await client.query(
    `SELECT event_type, actor_user_id, target_user_id, metadata
     FROM audit_events
     ORDER BY created_at ASC`,
  );
  assert.deepEqual(
    auditRows.rows.map((row) => ({
      event_type: row.event_type,
      actor_user_id: row.actor_user_id,
      target_user_id: row.target_user_id,
      metadata: row.metadata,
    })),
    [
      {
        event_type: 'manual_entitlement.granted',
        actor_user_id: adminId,
        target_user_id: targetUserId,
        metadata: { grantId, type: 'courtesy_access', reason: 'launch support validation' },
      },
      {
        event_type: 'manual_entitlement.revoked',
        actor_user_id: adminId,
        target_user_id: targetUserId,
        metadata: { grantId },
      },
    ],
  );

  const revokedGrant = await client.query(
    `SELECT revoked_at IS NOT NULL AS revoked, revoked_by_user_id
     FROM manual_entitlements
     WHERE id = $1`,
    [grantId],
  );
  assert.deepEqual(revokedGrant.rows[0], {
    revoked: true,
    revoked_by_user_id: adminId,
  });
});
