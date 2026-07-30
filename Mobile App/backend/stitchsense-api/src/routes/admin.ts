import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';

const grantBody = z.object({
  userId: z.string().uuid(),
  type: z.enum(['lifetime_pro', 'extended_trial', 'courtesy_access']),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get('/users/access', { preHandler: app.requireAdmin }, async () => {
    const result = await query(
      `WITH latest_manual AS (
         SELECT DISTINCT ON (me.user_id)
           me.user_id,
           me.type,
           me.expires_at
         FROM manual_entitlements me
         WHERE me.revoked_at IS NULL
           AND me.starts_at <= NOW()
           AND (me.expires_at IS NULL OR me.expires_at > NOW())
         ORDER BY me.user_id, me.expires_at NULLS FIRST, me.created_at DESC
       ),
       latest_paid AS (
         SELECT DISTINCT ON (s.user_id)
           s.user_id,
           s.provider,
           s.plan,
           s.status,
           s.current_period_end,
           s.metadata
         FROM subscriptions s
         WHERE s.status IN ('active', 'trialing')
           AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
         ORDER BY s.user_id, s.current_period_end DESC NULLS FIRST, s.updated_at DESC
       )
       SELECT
         u.id AS platform_user_id,
         u.email,
         u.display_name,
         u.role,
         u.standard_trial_ends_at,
         la.metadata->>'wpUserId' AS wp_user_id,
         la.metadata->>'siteUrl' AS site_url,
         CASE
           WHEN lm.user_id IS NOT NULL THEN 'pro'
           WHEN lp.user_id IS NOT NULL THEN lp.plan
           WHEN u.standard_trial_ends_at > NOW() THEN 'trial'
           ELSE 'none'
         END AS plan,
         CASE
           WHEN lm.user_id IS NOT NULL THEN 'active'
           WHEN lp.user_id IS NOT NULL THEN 'active'
           WHEN u.standard_trial_ends_at > NOW() THEN 'trialing'
           ELSE 'expired'
         END AS status,
         CASE
           WHEN lm.type = 'lifetime_pro' THEN 'manual_lifetime'
           WHEN lm.type = 'extended_trial' THEN 'manual_trial'
           WHEN lm.type = 'courtesy_access' THEN 'courtesy_access'
           WHEN lp.user_id IS NOT NULL THEN lp.provider
           WHEN u.standard_trial_ends_at > NOW() THEN 'standard_trial'
           ELSE 'none'
         END AS access_source,
         CASE
           WHEN lm.user_id IS NOT NULL THEN lm.expires_at
           WHEN lp.user_id IS NOT NULL THEN lp.current_period_end
           ELSE u.standard_trial_ends_at
         END AS access_ends_at,
         lp.status AS subscription_status,
         lp.current_period_end AS subscription_current_period_end,
         lp.metadata AS subscription_metadata
       FROM users u
       LEFT JOIN linked_accounts la ON la.user_id = u.id AND la.provider = 'wordpress'
       LEFT JOIN latest_manual lm ON lm.user_id = u.id
       LEFT JOIN latest_paid lp ON lp.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 1000`,
    );

    return {
      users: result.rows.map((row) => ({
        platformUserId: row.platform_user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        wpUserId: row.wp_user_id,
        siteUrl: row.site_url,
        entitlement: {
          plan: row.plan,
          status: row.status,
          accessSource: row.access_source,
          trialEndsAt: row.access_ends_at ? new Date(row.access_ends_at).toISOString() : null,
        },
        subscription: {
          status: row.subscription_status,
          currentPeriodEnd: row.subscription_current_period_end
            ? new Date(row.subscription_current_period_end).toISOString()
            : null,
          metadata: row.subscription_metadata ?? {},
        },
      })),
    };
  });

  app.get('/entitlements', { preHandler: app.requireAdmin }, async () => {
    const result = await query(
      `SELECT me.*, u.email, u.display_name
       FROM manual_entitlements me
       INNER JOIN users u ON u.id = me.user_id
       ORDER BY me.created_at DESC
       LIMIT 200`,
    );
    return { grants: result.rows };
  });

  app.post('/entitlements', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = grantBody.parse(request.body);
    const result = await query(
      `INSERT INTO manual_entitlements
       (user_id, type, starts_at, expires_at, reason, granted_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        body.userId,
        body.type,
        body.startsAt ? new Date(body.startsAt) : new Date(),
        body.expiresAt ? new Date(body.expiresAt) : null,
        body.reason ?? null,
        request.authUser.id,
      ],
    );
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$2,'manual_entitlement.granted',$3)`,
      [request.authUser.id, body.userId, { grantId: result.rows[0].id, type: body.type, reason: body.reason ?? null }],
    );
    return reply.code(201).send({ grant: result.rows[0] });
  });

  app.delete('/entitlements/:id', { preHandler: app.requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `UPDATE manual_entitlements
       SET revoked_at = NOW(), revoked_by_user_id = $2, updated_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING user_id`,
      [id, request.authUser.id],
    );
    if (result.rowCount) {
      await query(
        `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
         VALUES ($1,$2,'manual_entitlement.revoked',$3)`,
        [request.authUser.id, result.rows[0].user_id, { grantId: id }],
      );
    }
    return reply.code(204).send();
  });
}
