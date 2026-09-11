import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('RevenueCat webhook is authorized, idempotent, and pinned to the original StitchSense user', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.REVENUECAT_WEBHOOK_AUTHORIZATION = 'Bearer revenuecat-test-secret';
  process.env.REVENUECAT_ENTITLEMENT_ID = 'pro';

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

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('revenuecat-owner@example.test', 'RevenueCat Owner'),
       ('revenuecat-other@example.test', 'RevenueCat Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'revenuecat-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'revenuecat-other@example.test').id;

  const { buildApp } = await import('../dist/app.js');
  const poolModule = await import('../dist/db/pool.js');
  pool = poolModule.pool;
  app = await buildApp();

  const webhook = (payload, authorization = 'Bearer revenuecat-test-secret') =>
    app.inject({
      method: 'POST',
      url: '/billing/revenuecat/webhook',
      headers: { authorization },
      payload,
    });

  const baseEvent = {
    id: 'evt_rc_initial_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: ownerId,
    store: 'APP_STORE',
    product_id: 'stitchsense_pro_annual',
    period_type: 'NORMAL',
    transaction_id: 'tx_apple_1',
    original_transaction_id: 'original_apple_1',
    purchased_at_ms: Date.parse('2026-09-07T10:00:00Z'),
    expiration_at_ms: Date.parse('2026-10-07T10:00:00Z'),
    entitlement_ids: ['pro'],
  };

  const unauthorized = await webhook({ event: baseEvent }, 'Bearer wrong-secret');
  assert.equal(unauthorized.statusCode, 401, unauthorized.body);

  const unmatchedEntitlement = await webhook({
    event: { ...baseEvent, id: 'evt_rc_wrong_entitlement', entitlement_ids: ['other'] },
  });
  assert.equal(unmatchedEntitlement.statusCode, 200, unmatchedEntitlement.body);
  assert.deepEqual(unmatchedEntitlement.json(), { ignored: true, reason: 'unmatched_entitlement' });

  const unknownUser = await webhook({
    event: { ...baseEvent, id: 'evt_rc_unknown_user', app_user_id: '00000000-0000-4000-8000-000000000001' },
  });
  assert.equal(unknownUser.statusCode, 200, unknownUser.body);
  assert.deepEqual(unknownUser.json(), { ignored: true, reason: 'unknown_user' });

  const unsupportedStore = await webhook({ event: { ...baseEvent, id: 'evt_rc_stripe_store', store: 'STRIPE' } });
  assert.equal(unsupportedStore.statusCode, 200, unsupportedStore.body);
  assert.deepEqual(unsupportedStore.json(), { ignored: true, reason: 'unsupported_store' });

  const first = await webhook({ event: baseEvent });
  assert.equal(first.statusCode, 200, first.body);
  assert.deepEqual(first.json(), { received: true });

  let subscriptionRows = await client.query(
    `SELECT user_id, provider, provider_subscription_id, plan, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'apple' AND provider_subscription_id = 'original_apple_1'`,
  );
  assert.equal(subscriptionRows.rowCount, 1);
  assert.equal(subscriptionRows.rows[0].user_id, ownerId);
  assert.equal(subscriptionRows.rows[0].provider, 'apple');
  assert.equal(subscriptionRows.rows[0].plan, 'pro_annual');
  assert.equal(subscriptionRows.rows[0].status, 'active');
  assert.equal(subscriptionRows.rows[0].current_period_end.toISOString(), '2026-10-07T10:00:00.000Z');
  assert.equal(subscriptionRows.rows[0].metadata.revenueCatEventId, 'evt_rc_initial_1');

  const renewal = await webhook({
    event: {
      ...baseEvent,
      id: 'evt_rc_renewal_1',
      type: 'RENEWAL',
      expiration_at_ms: Date.parse('2026-11-07T10:00:00Z'),
    },
  });
  assert.equal(renewal.statusCode, 200, renewal.body);
  assert.deepEqual(renewal.json(), { received: true });

  subscriptionRows = await client.query(
    `SELECT user_id, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'apple' AND provider_subscription_id = 'original_apple_1'`,
  );
  assert.equal(subscriptionRows.rowCount, 1);
  assert.equal(subscriptionRows.rows[0].user_id, ownerId);
  assert.equal(subscriptionRows.rows[0].status, 'active');
  assert.equal(subscriptionRows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(subscriptionRows.rows[0].metadata.revenueCatEventId, 'evt_rc_renewal_1');

  const mismatchedUser = await webhook({
    event: {
      ...baseEvent,
      id: 'evt_rc_mismatch_1',
      type: 'RENEWAL',
      app_user_id: otherId,
      expiration_at_ms: Date.parse('2026-12-07T10:00:00Z'),
    },
  });
  assert.equal(mismatchedUser.statusCode, 200, mismatchedUser.body);
  assert.deepEqual(mismatchedUser.json(), { ignored: true, reason: 'subscription_user_mismatch' });

  subscriptionRows = await client.query(
    `SELECT user_id, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'apple' AND provider_subscription_id = 'original_apple_1'`,
  );
  assert.equal(subscriptionRows.rowCount, 1);
  assert.equal(subscriptionRows.rows[0].user_id, ownerId);
  assert.equal(subscriptionRows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(subscriptionRows.rows[0].metadata.revenueCatEventId, 'evt_rc_renewal_1');

  const mismatchAudit = await client.query(
    `SELECT actor_user_id, target_user_id, event_type, metadata
     FROM audit_events
     WHERE event_type = 'billing.revenuecat.webhook.user_mismatch'`,
  );
  assert.equal(mismatchAudit.rowCount, 1);
  assert.equal(mismatchAudit.rows[0].actor_user_id, otherId);
  assert.equal(mismatchAudit.rows[0].target_user_id, ownerId);
  assert.equal(mismatchAudit.rows[0].metadata.revenueCatEventId, 'evt_rc_mismatch_1');

  const cancellation = await webhook({
    event: {
      ...baseEvent,
      id: 'evt_rc_cancellation_1',
      type: 'CANCELLATION',
      expiration_at_ms: Date.parse('2026-11-07T10:00:00Z'),
    },
  });
  assert.equal(cancellation.statusCode, 200, cancellation.body);
  assert.deepEqual(cancellation.json(), { received: true });

  subscriptionRows = await client.query(
    `SELECT user_id, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'apple' AND provider_subscription_id = 'original_apple_1'`,
  );
  assert.equal(subscriptionRows.rowCount, 1);
  assert.equal(subscriptionRows.rows[0].user_id, ownerId);
  assert.equal(subscriptionRows.rows[0].status, 'active');
  assert.equal(subscriptionRows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(subscriptionRows.rows[0].metadata.revenueCatEventId, 'evt_rc_cancellation_1');
  assert.equal(subscriptionRows.rows[0].metadata.type, 'CANCELLATION');

  const activeEntitlement = await app.inject({
    method: 'GET',
    url: '/me/entitlements',
    headers: { authorization: `Bearer ${await app.jwt.sign({ sub: ownerId, email: 'revenuecat-owner@example.test' })}` },
  });
  assert.equal(activeEntitlement.statusCode, 200, activeEntitlement.body);
  assert.equal(activeEntitlement.json().entitlement.status, 'active');
  assert.equal(activeEntitlement.json().entitlement.accessSource, 'apple');

  const expiration = await webhook({
    event: {
      ...baseEvent,
      id: 'evt_rc_expiration_1',
      type: 'EXPIRATION',
      expiration_at_ms: Date.parse('2026-11-07T10:00:00Z'),
    },
  });
  assert.equal(expiration.statusCode, 200, expiration.body);
  assert.deepEqual(expiration.json(), { received: true });

  subscriptionRows = await client.query(
    `SELECT user_id, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'apple' AND provider_subscription_id = 'original_apple_1'`,
  );
  assert.equal(subscriptionRows.rowCount, 1);
  assert.equal(subscriptionRows.rows[0].user_id, ownerId);
  assert.equal(subscriptionRows.rows[0].status, 'expired');
  assert.equal(subscriptionRows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(subscriptionRows.rows[0].metadata.revenueCatEventId, 'evt_rc_expiration_1');
  assert.equal(subscriptionRows.rows[0].metadata.type, 'EXPIRATION');

  const expiredEntitlement = await app.inject({
    method: 'GET',
    url: '/me/entitlements',
    headers: { authorization: `Bearer ${await app.jwt.sign({ sub: ownerId, email: 'revenuecat-owner@example.test' })}` },
  });
  assert.equal(expiredEntitlement.statusCode, 200, expiredEntitlement.body);
  assert.equal(expiredEntitlement.json().entitlement.status, 'expired');
  assert.equal(expiredEntitlement.json().entitlement.accessSource, 'none');

  const googleInitialPurchase = await webhook({
    event: {
      ...baseEvent,
      id: 'evt_rc_google_initial_1',
      store: 'PLAY_STORE',
      product_id: 'stitchsense_pro_monthly',
      transaction_id: 'gpa.1234-5678-9012-34567',
      original_transaction_id: undefined,
      expiration_at_ms: Date.parse('2026-10-07T10:00:00Z'),
    },
  });
  assert.equal(googleInitialPurchase.statusCode, 200, googleInitialPurchase.body);
  assert.deepEqual(googleInitialPurchase.json(), { received: true });

  const googleRows = await client.query(
    `SELECT user_id, provider, provider_subscription_id, plan, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'google' AND provider_subscription_id = 'gpa.1234-5678-9012-34567'`,
  );
  assert.equal(googleRows.rowCount, 1);
  assert.equal(googleRows.rows[0].user_id, ownerId);
  assert.equal(googleRows.rows[0].provider, 'google');
  assert.equal(googleRows.rows[0].plan, 'pro_monthly');
  assert.equal(googleRows.rows[0].status, 'active');
  assert.equal(googleRows.rows[0].current_period_end.toISOString(), '2026-10-07T10:00:00.000Z');
  assert.equal(googleRows.rows[0].metadata.revenueCatEventId, 'evt_rc_google_initial_1');

});
