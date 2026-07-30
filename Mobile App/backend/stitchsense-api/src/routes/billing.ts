import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
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
      entitlement_ids: z.array(z.string()).optional(),
    })
    .passthrough(),
});

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

async function handleStripeSubscription(subscription: Stripe.Subscription) {
  await upsertStripeSubscriptionFromStripe(subscription);
}

export function providerForRevenueCatStore(store: string | undefined): 'apple' | 'google' | null {
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'apple';
  if (store === 'PLAY_STORE') return 'google';
  return null;
}

export function planForRevenueCatProduct(productId: string | undefined) {
  const normalized = productId?.toLowerCase() ?? '';
  if (normalized.includes('annual') || normalized.includes('year')) return 'pro_annual';
  return 'pro_monthly';
}

export function statusForRevenueCatEvent(type: string, expirationAt: Date | null, now = new Date()) {
  if (type === 'EXPIRATION' || type === 'TRANSFER') return 'expired';
  if (type === 'INITIAL_PURCHASE' || type === 'RENEWAL' || type === 'UNCANCELLATION') return 'active';
  if (type === 'CANCELLATION' && expirationAt && expirationAt.getTime() > now.getTime()) return 'active';
  return expirationAt && expirationAt.getTime() > now.getTime() ? 'active' : 'expired';
}

async function handleRevenueCatWebhook(body: unknown) {
  const parsed = revenueCatWebhookBody.parse(body);
  const event = parsed.event;
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
      purchasedAt: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
    },
  });

  await query(
    `INSERT INTO audit_events (target_user_id, event_type, metadata)
     VALUES ($1,'billing.revenuecat.webhook.received',$2)`,
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
    if (!stripe || !config.stripe.webhookSecret) {
      return reply.code(503).send({ error: 'Stripe webhook is not configured' });
    }

    const signature = request.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      return reply.code(400).send({ error: 'Missing Stripe signature' });
    }

    let event: Stripe.Event;
    try {
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
      if (!rawBody) throw new Error('Missing raw body');
      event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
    } catch (error) {
      return reply.code(400).send({ error: 'Invalid Stripe webhook signature' });
    }

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
    return { received: true };
  });

  app.post('/billing/revenuecat/webhook', async (request, reply) => {
    if (!config.revenueCat.webhookAuthorization) {
      return reply.code(503).send({ error: 'RevenueCat webhook is not configured' });
    }

    if (request.headers.authorization !== config.revenueCat.webhookAuthorization) {
      return reply.code(401).send({ error: 'Invalid RevenueCat authorization' });
    }

    return handleRevenueCatWebhook(request.body);
  });
}
