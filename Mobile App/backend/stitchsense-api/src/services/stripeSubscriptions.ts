import Stripe from 'stripe';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: '2025-02-24.acacia' }) : null;

function planForPrice(priceId: string | null | undefined) {
  if (priceId && priceId === config.stripe.annualPriceId) return 'pro_annual';
  return 'pro_monthly';
}

function periodEndForSubscription(subscription: Stripe.Subscription) {
  const periodEnd = subscription.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

export async function upsertStripeSubscriptionFromStripe(subscription: Stripe.Subscription, fallbackUserId?: string | null) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const user = await query<{ id: string }>('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
  const userId = user.rows[0]?.id ?? fallbackUserId ?? null;
  if (!userId) return { synced: false, reason: 'unknown_customer' };

  const priceId = subscription.items.data[0]?.price.id ?? null;
  await query(
    `INSERT INTO subscriptions
     (user_id, provider, provider_subscription_id, plan, status, current_period_end, metadata)
     VALUES ($1,'stripe',$2,$3,$4,$5,$6)
     ON CONFLICT (provider, provider_subscription_id)
     WHERE provider_subscription_id IS NOT NULL
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      userId,
      subscription.id,
      planForPrice(priceId),
      subscription.status,
      periodEndForSubscription(subscription),
      {
        priceId,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        customerId,
        syncedFromStripeAt: new Date().toISOString(),
      },
    ],
  );

  return { synced: true, subscriptionId: subscription.id };
}

export async function syncStripeSubscriptionsForUser(userId: string) {
  if (!stripe) return { synced: false, reason: 'stripe_not_configured' };

  const user = await query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId],
  );
  const customerId = user.rows[0]?.stripe_customer_id ?? null;
  if (!customerId) return { synced: false, reason: 'no_stripe_customer' };

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
  });

  for (const subscription of subscriptions.data) {
    await upsertStripeSubscriptionFromStripe(subscription, userId);
  }

  if (subscriptions.data.length) {
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,'billing.stripe.subscriptions_synced',$2)`,
      [userId, { count: subscriptions.data.length, syncedAt: new Date().toISOString() }],
    );
  }

  return { synced: true, count: subscriptions.data.length };
}
