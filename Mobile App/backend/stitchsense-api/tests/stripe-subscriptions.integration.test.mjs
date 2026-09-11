import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

function stripeSubscription(overrides = {}) {
  return {
    id: 'sub_stripe_1',
    customer: 'cus_owner',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: Date.parse('2026-10-07T10:00:00Z') / 1000,
    items: {
      data: [{ price: { id: 'price_annual' } }],
    },
    ...overrides,
  };
}

test('Stripe subscription sync preserves lifecycle state and pins subscription ownership', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.STRIPE_ANNUAL_PRICE_ID = 'price_annual';
  process.env.STRIPE_MONTHLY_PRICE_ID = 'price_monthly';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let pool;

  try {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name, stripe_customer_id) VALUES
       ('stripe-owner@example.test', 'Stripe Owner', 'cus_owner'),
       ('stripe-other@example.test', 'Stripe Other', 'cus_other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'stripe-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'stripe-other@example.test').id;

  const { upsertStripeSubscriptionFromStripe } = await import('../dist/services/stripeSubscriptions.js');
  const poolModule = await import('../dist/db/pool.js');
  pool = poolModule.pool;

  const initial = await upsertStripeSubscriptionFromStripe(stripeSubscription());
  assert.deepEqual(initial, { synced: true, subscriptionId: 'sub_stripe_1' });

  let rows = await client.query(
    `SELECT user_id, provider, provider_subscription_id, plan, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'stripe' AND provider_subscription_id = 'sub_stripe_1'`,
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].user_id, ownerId);
  assert.equal(rows.rows[0].provider, 'stripe');
  assert.equal(rows.rows[0].plan, 'pro_annual');
  assert.equal(rows.rows[0].status, 'active');
  assert.equal(rows.rows[0].current_period_end.toISOString(), '2026-10-07T10:00:00.000Z');
  assert.equal(rows.rows[0].metadata.cancelAtPeriodEnd, false);
  assert.equal(rows.rows[0].metadata.customerId, 'cus_owner');

  const cancelAtPeriodEnd = await upsertStripeSubscriptionFromStripe(
    stripeSubscription({
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: Date.parse('2026-11-07T10:00:00Z') / 1000,
    }),
  );
  assert.deepEqual(cancelAtPeriodEnd, { synced: true, subscriptionId: 'sub_stripe_1' });

  rows = await client.query(
    `SELECT user_id, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'stripe' AND provider_subscription_id = 'sub_stripe_1'`,
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].user_id, ownerId);
  assert.equal(rows.rows[0].status, 'active');
  assert.equal(rows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(rows.rows[0].metadata.cancelAtPeriodEnd, true);

  const deleted = await upsertStripeSubscriptionFromStripe(
    stripeSubscription({
      status: 'canceled',
      cancel_at_period_end: false,
      current_period_end: Date.parse('2026-11-07T10:00:00Z') / 1000,
    }),
  );
  assert.deepEqual(deleted, { synced: true, subscriptionId: 'sub_stripe_1' });

  rows = await client.query(
    `SELECT user_id, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'stripe' AND provider_subscription_id = 'sub_stripe_1'`,
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].user_id, ownerId);
  assert.equal(rows.rows[0].status, 'canceled');
  assert.equal(rows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(rows.rows[0].metadata.cancelAtPeriodEnd, false);

  const unknownCustomer = await upsertStripeSubscriptionFromStripe(
    stripeSubscription({ id: 'sub_unknown_customer', customer: 'cus_missing' }),
  );
  assert.deepEqual(unknownCustomer, { synced: false, reason: 'unknown_customer' });

  const mismatchedOwner = await upsertStripeSubscriptionFromStripe(
    stripeSubscription({
      customer: 'cus_other',
      status: 'active',
      current_period_end: Date.parse('2026-12-07T10:00:00Z') / 1000,
    }),
  );
  assert.deepEqual(mismatchedOwner, { synced: false, reason: 'subscription_user_mismatch' });

  rows = await client.query(
    `SELECT user_id, status, current_period_end, metadata
     FROM subscriptions
     WHERE provider = 'stripe' AND provider_subscription_id = 'sub_stripe_1'`,
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].user_id, ownerId);
  assert.equal(rows.rows[0].status, 'canceled');
  assert.equal(rows.rows[0].current_period_end.toISOString(), '2026-11-07T10:00:00.000Z');

  const mismatchAudit = await client.query(
    `SELECT actor_user_id, target_user_id, event_type, metadata
     FROM audit_events
     WHERE event_type = 'billing.stripe.subscription_user_mismatch'`,
  );
  assert.equal(mismatchAudit.rowCount, 1);
  assert.equal(mismatchAudit.rows[0].actor_user_id, otherId);
  assert.equal(mismatchAudit.rows[0].target_user_id, ownerId);
  assert.equal(mismatchAudit.rows[0].metadata.stripeSubscriptionId, 'sub_stripe_1');
  assert.equal(mismatchAudit.rows[0].metadata.customerId, 'cus_other');

  } finally {
    if (pool) await pool.end();
    await client.end();
  }
});
