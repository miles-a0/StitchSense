import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { resolveEntitlement } from '../services/entitlements.js';
import { externalServiceErrorLogContext } from '../services/externalServiceErrorLog.js';
import { recordBillingWebhookMetrics } from '../services/metrics.js';
import { secureStringEquals } from '../services/secureCompare.js';
import { upsertStripeSubscriptionFromStripe } from '../services/stripeSubscriptions.js';

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: '2025-02-24.acacia' }) : null;

const checkoutBody = z.object({
  plan: z.enum(['monthly', 'annual']).default('monthly'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  promoCode: z.string().trim().max(80).optional(),
  couponId: z.string().trim().max(120).optional(),
  promotionCodeId: z.string().trim().max(120).optional(),
  allowPromotionCodes: z.boolean().optional(),
});

const portalBody = z.object({
  returnUrl: z.string().url(),
});

const revenueCatWebhookBody = z.object({
  event: z
    .object({
      id: z.string(),
      type: z.string(),
      app_user_id: z.string(),
      store: z.string().optional(),
      product_id: z.string().optional(),
      period_type: z.string().optional(),
      transaction_id: z.string().optional(),
      original_transaction_id: z.string().optional(),
      expiration_at_ms: z.number().nullable().optional(),
      purchased_at_ms: z.number().nullable().optional(),
      cancel_reason: z.string().optional(),
      expiration_reason: z.string().optional(),
      entitlement_ids: z.array(z.string()).optional(),
    })
    .passthrough(),
});

const revenueCatSubscriberResponse = z
  .object({
    subscriber: z
      .object({
        entitlements: z.record(
          z.string(),
          z
            .object({
              expires_date: z.string().nullable().optional(),
              product_identifier: z.string().nullable().optional(),
              purchase_date: z.string().nullable().optional(),
            })
            .passthrough(),
        ).optional(),
        subscriptions: z.record(
          z.string(),
          z
            .object({
              store: z.string().nullable().optional(),
              expires_date: z.string().nullable().optional(),
              original_purchase_date: z.string().nullable().optional(),
              purchase_date: z.string().nullable().optional(),
            })
            .passthrough(),
        ).optional(),
      })
      .passthrough(),
  })
  .passthrough();

function priceIdForPlan(plan: 'monthly' | 'annual') {
  return plan === 'annual' ? config.stripe.annualPriceId : config.stripe.monthlyPriceId;
}

function billingResultHtml(input: { title: string; message: string; tone: 'success' | 'cancel' }) {
  const accent = input.tone === 'success' ? '#2f7d5a' : '#8a4b2d';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${input.title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff7ef; color: #2b1d19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(90vw, 520px); background: #fff; border: 1px solid #ead9cb; border-radius: 18px; padding: 32px; box-shadow: 0 18px 50px rgba(43,29,25,.12); }
    .eyebrow { color: #b8794d; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 10px 0 12px; font-size: 32px; line-height: 1.08; }
    p { margin: 0 0 18px; color: #766158; font-size: 17px; line-height: 1.5; }
    .status { display: inline-block; margin-bottom: 18px; border-radius: 999px; background: ${accent}; color: #fff; padding: 9px 14px; font-weight: 800; }
    .hint { border-radius: 16px; background: #fff7ef; border: 1px solid #ead9cb; padding: 14px 16px; color: #6f4b3a; font-weight: 800; }
    small { display: block; margin-top: 14px; color: #9b8a83; text-align: center; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">StitchSense Pro</div>
    <h1>${input.title}</h1>
    <div class="status">${input.tone === 'success' ? 'Subscription successful' : 'Checkout not completed'}</div>
    <p>${input.message}</p>
    <div class="hint">Tap Done, Close, or swipe down to return to StitchSense.</div>
    <small>Your account will refresh automatically when you return to the app.</small>
  </main>
</body>
</html>`;
}

async function ensureStripeCustomer(userId: string) {
  if (!stripe) throw new Error('Stripe is not configured');
  const user = await query<{ email: string; display_name: string | null; stripe_customer_id: string | null }>(
    'SELECT email, display_name, stripe_customer_id FROM users WHERE id = $1',
    [userId],
  );
  if (!user.rowCount) throw new Error('User not found');
  if (user.rows[0].stripe_customer_id) return user.rows[0].stripe_customer_id;

  const customer = await stripe.customers.create({
    email: user.rows[0].email,
    name: user.rows[0].display_name ?? undefined,
    metadata: { userId },
  });
  await query('UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1', [userId, customer.id]);
  return customer.id;
}

async function upsertMobileSubscription(input: {
  userId: string;
  provider: 'apple' | 'google';
  subscriptionId: string;
  status: string;
  plan: string;
  currentPeriodEnd: Date | null;
  metadata: Record<string, unknown>;
}) {
  await query(
    `INSERT INTO subscriptions
     (user_id, provider, provider_subscription_id, plan, status, current_period_end, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
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
      input.userId,
      input.provider,
      input.subscriptionId,
      input.plan,
      input.status,
      input.currentPeriodEnd,
      input.metadata,
    ],
  );
}

async function existingMobileSubscriptionOwner(input: { provider: 'apple' | 'google'; subscriptionId: string }) {
  const existing = await query<{ user_id: string }>(
    `SELECT user_id
     FROM subscriptions
     WHERE provider = $1 AND provider_subscription_id = $2
     LIMIT 1`,
    [input.provider, input.subscriptionId],
  );

  return existing.rows[0]?.user_id ?? null;
}

async function receivedRevenueCatEvent(eventId: string) {
  const existing = await query<{ id: string }>(
    `SELECT id
     FROM audit_events
     WHERE event_type = 'billing.revenuecat.webhook.received'
       AND metadata->>'revenueCatEventId' = $1
     LIMIT 1`,
    [eventId],
  );

  return Boolean(existing.rowCount);
}

async function handleStripeSubscription(subscription: Stripe.Subscription) {
  await upsertStripeSubscriptionFromStripe(subscription);
}

export function providerForRevenueCatStore(store: string | undefined): 'apple' | 'google' | null {
  const normalized = store?.toLowerCase();
  if (normalized === 'app_store' || normalized === 'mac_app_store') return 'apple';
  if (normalized === 'play_store') return 'google';
  return null;
}

export function planForRevenueCatProduct(productId: string | undefined) {
  const normalized = productId?.toLowerCase() ?? '';
  if (normalized.includes('annual') || normalized.includes('year')) return 'pro_annual';
  return 'pro_monthly';
}

export function statusForRevenueCatEvent(type: string, expirationAt: Date | null, now = new Date()) {
  if (type === 'EXPIRATION' || type === 'TRANSFER') return 'expired';
  if (
    type === 'INITIAL_PURCHASE' ||
    type === 'RENEWAL' ||
    type === 'UNCANCELLATION' ||
    type === 'NON_RENEWING_PURCHASE' ||
    type === 'SUBSCRIPTION_EXTENDED' ||
    type === 'REFUND_REVERSED'
  ) {
    return 'active';
  }
  if (type === 'CANCELLATION' && expirationAt && expirationAt.getTime() > now.getTime()) return 'active';
  return expirationAt && expirationAt.getTime() > now.getTime() ? 'active' : 'expired';
}

function parseRevenueCatDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function statusForRevenueCatSubscriber(expirationAt: Date | null, now = new Date()) {
  return !expirationAt || expirationAt.getTime() > now.getTime() ? 'active' : 'expired';
}

async function fetchRevenueCatSubscriber(userId: string) {
  const baseUrl = config.revenueCat.apiBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/subscribers/${encodeURIComponent(userId)}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.revenueCat.apiKey}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`RevenueCat subscriber sync failed with status ${response.status}`);
  }

  return revenueCatSubscriberResponse.parse(await response.json());
}

async function syncRevenueCatSubscriber(userId: string) {
  if (!config.revenueCat.apiKey) {
    throw new Error('RevenueCat API key is not configured');
  }

  const subscriberResponse = await fetchRevenueCatSubscriber(userId);
  if (!subscriberResponse) {
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,'billing.revenuecat.sync.not_found',$2)`,
      [userId, { syncedAt: new Date().toISOString() }],
    );
    return { synced: false, reason: 'subscriber_not_found' };
  }

  const entitlement = subscriberResponse.subscriber.entitlements?.[config.revenueCat.entitlementId];
  const productId = entitlement?.product_identifier ?? null;
  const subscription = productId ? subscriberResponse.subscriber.subscriptions?.[productId] : null;
  const provider = providerForRevenueCatStore(subscription?.store ?? undefined);

  if (!entitlement || !productId || !subscription || !provider) {
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,'billing.revenuecat.sync.no_matching_entitlement',$2)`,
      [
        userId,
        {
          syncedAt: new Date().toISOString(),
          entitlementId: config.revenueCat.entitlementId,
          productId,
          store: subscription?.store ?? null,
        },
      ],
    );
    return { synced: false, reason: 'no_matching_entitlement' };
  }

  const currentPeriodEnd = parseRevenueCatDate(entitlement.expires_date ?? subscription.expires_date);
  const subscriptionId = `${userId}:${provider}:${productId}`;
  await upsertMobileSubscription({
    userId,
    provider,
    subscriptionId,
    status: statusForRevenueCatSubscriber(currentPeriodEnd),
    plan: planForRevenueCatProduct(productId),
    currentPeriodEnd,
    metadata: {
      revenueCatSync: true,
      syncedAt: new Date().toISOString(),
      entitlementId: config.revenueCat.entitlementId,
      productId,
      store: subscription.store ?? null,
      purchaseDate: entitlement.purchase_date ?? subscription.purchase_date ?? subscription.original_purchase_date ?? null,
    },
  });

  await query(
    `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
     VALUES ($1,$1,'billing.revenuecat.sync.received',$2)`,
    [userId, { syncedAt: new Date().toISOString(), entitlementId: config.revenueCat.entitlementId, productId, provider }],
  );

  return { synced: true };
}

async function handleRevenueCatWebhook(body: unknown) {
  const parsed = revenueCatWebhookBody.parse(body);
  const event = parsed.event;
  if (await receivedRevenueCatEvent(event.id)) {
    return { received: true, replayed: true };
  }

  const userId = event.app_user_id;
  const provider = providerForRevenueCatStore(event.store);
  const subscriptionId = event.original_transaction_id ?? event.transaction_id ?? event.id;
  const currentPeriodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

  if (!provider) return { ignored: true, reason: 'unsupported_store' };
  if (event.entitlement_ids?.length && !event.entitlement_ids.includes(config.revenueCat.entitlementId)) {
    return { ignored: true, reason: 'unmatched_entitlement' };
  }

  const user = await query<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user.rowCount) return { ignored: true, reason: 'unknown_user' };

  const existingOwnerId = await existingMobileSubscriptionOwner({ provider, subscriptionId });
  if (existingOwnerId && existingOwnerId !== userId) {
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$2,'billing.revenuecat.webhook.user_mismatch',$3)`,
      [
        userId,
        existingOwnerId,
        {
          receivedAt: new Date().toISOString(),
          revenueCatEventId: event.id,
          provider,
          subscriptionId,
          type: event.type,
        },
      ],
    );
    return { ignored: true, reason: 'subscription_user_mismatch' };
  }

  await upsertMobileSubscription({
    userId,
    provider,
    subscriptionId,
    status: statusForRevenueCatEvent(event.type, currentPeriodEnd),
    plan: planForRevenueCatProduct(event.product_id),
    currentPeriodEnd,
    metadata: {
      revenueCatEventId: event.id,
      type: event.type,
      store: event.store,
      productId: event.product_id,
      periodType: event.period_type,
      cancelReason: event.cancel_reason ?? null,
      expirationReason: event.expiration_reason ?? null,
      purchasedAt: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
    },
  });

  await query(
    `INSERT INTO audit_events (target_user_id, event_type, metadata)
     VALUES ($1,'billing.revenuecat.webhook.received',$2)
     ON CONFLICT DO NOTHING`,
    [userId, { receivedAt: new Date().toISOString(), revenueCatEventId: event.id, type: event.type }],
  );

  return { received: true };
}

export async function billingRoutes(app: FastifyInstance) {
  app.post('/billing/checkout', { preHandler: app.authenticate }, async (request, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'Stripe is not configured' });
    const body = checkoutBody.parse(request.body);
    const price = priceIdForPlan(body.plan);
    if (!price) return reply.code(500).send({ error: `Stripe ${body.plan} price is not configured` });

    const customer = await ensureStripeCustomer(request.authUser.id);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      allow_promotion_codes:
        body.allowPromotionCodes === true || Boolean(body.promoCode && !body.couponId && !body.promotionCodeId)
          ? true
          : undefined,
      discounts: body.promotionCodeId
        ? [{ promotion_code: body.promotionCodeId }]
        : body.couponId
          ? [{ coupon: body.couponId }]
          : undefined,
      client_reference_id: request.authUser.id,
      metadata: {
        userId: request.authUser.id,
        plan: body.plan,
        promoCode: body.promoCode ?? '',
        couponId: body.couponId ?? '',
        promotionCodeId: body.promotionCodeId ?? '',
      },
      subscription_data: {
        metadata: {
          userId: request.authUser.id,
          plan: body.plan,
          promoCode: body.promoCode ?? '',
          couponId: body.couponId ?? '',
          promotionCodeId: body.promotionCodeId ?? '',
        },
      },
    });

    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,'billing.checkout.created',$2)`,
      [
        request.authUser.id,
        {
          sessionId: session.id,
          plan: body.plan,
          promoCode: body.promoCode ?? null,
          couponId: body.couponId ?? null,
          promotionCodeId: body.promotionCodeId ?? null,
        },
      ],
    );

    return reply.code(201).send({ checkoutUrl: session.url, sessionId: session.id });
  });

  app.post('/billing/portal', { preHandler: app.authenticate }, async (request, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'Stripe is not configured' });
    const body = portalBody.parse(request.body);
    const customer = await ensureStripeCustomer(request.authUser.id);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: body.returnUrl,
    });

    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,'billing.portal.created',$2)`,
      [request.authUser.id, { sessionId: session.id, createdAt: new Date().toISOString() }],
    );

    return reply.code(201).send({ portalUrl: session.url });
  });

  app.post('/billing/revenuecat/sync', { preHandler: app.authenticate }, async (request, reply) => {
    try {
      await syncRevenueCatSubscriber(request.authUser.id);
      return { entitlement: await resolveEntitlement(request.authUser.id) };
    } catch (error) {
      request.log.error(
        { error: externalServiceErrorLogContext(error), userId: request.authUser.id },
        'RevenueCat subscriber sync failed',
      );
      return reply.code(502).send({
        error: 'Could not sync subscription status right now',
        requestId: request.id,
      });
    }
  });

  app.get('/billing/success', async (_request, reply) => {
    return reply
      .type('text/html; charset=utf-8')
      .send(
        billingResultHtml({
          title: 'Thank you, your subscription is active',
          message:
            'Stripe has completed your payment. Close this window and StitchSense will check your account access automatically.',
          tone: 'success',
        }),
      );
  });

  app.get('/billing/cancel', async (_request, reply) => {
    return reply
      .type('text/html; charset=utf-8')
      .send(
        billingResultHtml({
          title: 'Checkout was cancelled',
          message:
            'No payment was taken. You can close this window and choose a plan again whenever you are ready.',
          tone: 'cancel',
        }),
      );
  });

  app.post('/billing/webhook', { config: { rawBody: true } }, async (request, reply) => {
    const startedAt = Date.now();
    if (!stripe || !config.stripe.webhookSecret) {
      recordBillingWebhookMetrics({
        provider: 'stripe',
        outcome: 'configuration_error',
        statusCode: 503,
        durationMs: Date.now() - startedAt,
      });
      return reply.code(503).send({ error: 'Stripe webhook is not configured' });
    }

    const signature = request.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      recordBillingWebhookMetrics({
        provider: 'stripe',
        outcome: 'invalid_payload',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
      });
      return reply.code(400).send({ error: 'Missing Stripe signature' });
    }

    let event: Stripe.Event;
    try {
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
      if (!rawBody) throw new Error('Missing raw body');
      event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
    } catch (error) {
      recordBillingWebhookMetrics({
        provider: 'stripe',
        outcome: 'unauthorized',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
      });
      return reply.code(400).send({ error: 'Invalid Stripe webhook signature' });
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
        if (userId && typeof session.subscription === 'string') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await handleStripeSubscription(subscription);
        }
      }

      if (
        event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted'
      ) {
        await handleStripeSubscription(event.data.object as Stripe.Subscription);
      }

      await query(
        `INSERT INTO audit_events (event_type, metadata)
         VALUES ('billing.webhook.received', $1)`,
        [{ receivedAt: new Date().toISOString(), stripeEventId: event.id, type: event.type }],
      );
    } catch (error) {
      recordBillingWebhookMetrics({
        provider: 'stripe',
        outcome: 'exception',
        statusCode: 500,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }

    recordBillingWebhookMetrics({
      provider: 'stripe',
      outcome: 'received',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
    });
    return { received: true };
  });

  app.post('/billing/revenuecat/webhook', async (request, reply) => {
    const startedAt = Date.now();
    if (!config.revenueCat.webhookAuthorization) {
      recordBillingWebhookMetrics({
        provider: 'revenuecat',
        outcome: 'configuration_error',
        statusCode: 503,
        durationMs: Date.now() - startedAt,
      });
      return reply.code(503).send({ error: 'RevenueCat webhook is not configured' });
    }

    if (!secureStringEquals(config.revenueCat.webhookAuthorization, request.headers.authorization)) {
      recordBillingWebhookMetrics({
        provider: 'revenuecat',
        outcome: 'unauthorized',
        statusCode: 401,
        durationMs: Date.now() - startedAt,
      });
      return reply.code(401).send({ error: 'Invalid RevenueCat authorization' });
    }

    try {
      const result = await handleRevenueCatWebhook(request.body);
      recordBillingWebhookMetrics({
        provider: 'revenuecat',
        outcome: result.replayed ? 'replayed' : result.ignored ? 'ignored' : 'received',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      recordBillingWebhookMetrics({
        provider: 'revenuecat',
        outcome: 'exception',
        statusCode: 500,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  });
}
