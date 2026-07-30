import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { resolveEntitlement } from '../services/entitlements.js';
import { syncStripeSubscriptionsForUser } from '../services/stripeSubscriptions.js';
import { deleteWordPressUserData } from '../services/wordpressBridge.js';

const settingsBody = z.object({
  defaultSkill: z.string().optional(),
  measurementUnit: z.string().optional(),
  language: z.string().optional(),
  preferences: z.record(z.unknown()).optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const result = await query(
      'SELECT id, email, display_name, role, standard_trial_ends_at, created_at FROM users WHERE id = $1',
      [request.authUser.id],
    );
    return { user: result.rows[0] };
  });

  app.get('/me/entitlements', { preHandler: app.authenticate }, async (request) => {
    await syncStripeSubscriptionsForUser(request.authUser.id);
    return { entitlement: await resolveEntitlement(request.authUser.id) };
  });

  app.get('/user/settings', { preHandler: app.authenticate }, async (request) => {
    const result = await query(
      `SELECT default_skill, measurement_unit, language, preferences
       FROM user_settings
       WHERE user_id = $1`,
      [request.authUser.id],
    );
    return {
      settings: result.rows[0] ?? {
        default_skill: 'beginner',
        measurement_unit: 'metric',
        language: 'uk',
        preferences: {},
      },
    };
  });

  app.put('/user/settings', { preHandler: app.authenticate }, async (request) => {
    const body = settingsBody.parse(request.body);
    const result = await query(
      `INSERT INTO user_settings (user_id, default_skill, measurement_unit, language, preferences)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         default_skill = EXCLUDED.default_skill,
         measurement_unit = EXCLUDED.measurement_unit,
         language = EXCLUDED.language,
         preferences = EXCLUDED.preferences,
         updated_at = NOW()
       RETURNING *`,
      [
        request.authUser.id,
        body.defaultSkill ?? 'beginner',
        body.measurementUnit ?? 'metric',
        body.language ?? 'uk',
        body.preferences ?? {},
      ],
    );
    return { settings: result.rows[0] };
  });

  app.get('/user/export', { preHandler: app.authenticate }, async (request) => {
    const patterns = await query('SELECT * FROM user_patterns WHERE user_id = $1 ORDER BY created_at DESC', [request.authUser.id]);
    const chats = await query('SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY created_at DESC', [request.authUser.id]);
    const chatIds = chats.rows.map((row) => row.id);
    const messages = chatIds.length
      ? await query(`SELECT * FROM chat_messages WHERE session_id = ANY($1::uuid[]) ORDER BY session_id, id`, [chatIds])
      : { rows: [] };
    const rewrites = await query('SELECT * FROM rewrite_sessions WHERE user_id = $1 ORDER BY created_at DESC', [request.authUser.id]);
    const settings = await query('SELECT * FROM user_settings WHERE user_id = $1', [request.authUser.id]);
    const connections = await query('SELECT id, service, token_expires, metadata, created_at, updated_at FROM user_connections WHERE user_id = $1', [request.authUser.id]);

    return {
      exportedAt: new Date().toISOString(),
      userId: request.authUser.id,
      patterns: patterns.rows,
      chatSessions: chats.rows,
      chatMessages: messages.rows,
      rewriteSessions: rewrites.rows,
      settings: settings.rows[0] ?? null,
      connections: connections.rows,
    };
  });

  app.post('/user/delete-data', { preHandler: app.authenticate }, async (request, reply) => {
    const body = z.object({ confirm: z.literal('DELETE') }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Confirmation required' });
    }

    await deleteWordPressUserData(request.authUser.id);
    await query('DELETE FROM rewrite_sessions WHERE user_id = $1', [request.authUser.id]);
    const chats = await query('SELECT id FROM chat_sessions WHERE user_id = $1', [request.authUser.id]);
    const chatIds = chats.rows.map((row) => row.id);
    if (chatIds.length) {
      await query('DELETE FROM chat_messages WHERE session_id = ANY($1::uuid[])', [chatIds]);
    }
    await query('DELETE FROM chat_sessions WHERE user_id = $1', [request.authUser.id]);
    await query('UPDATE project_pattern_marks SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL', [request.authUser.id]);
    await query('UPDATE project_photos SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL', [request.authUser.id]);
    await query('UPDATE project_work_log SET deleted_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL', [request.authUser.id]);
    await query('UPDATE project_counters SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL', [request.authUser.id]);
    await query('UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL', [request.authUser.id]);
    await query('UPDATE user_patterns SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1', [request.authUser.id]);
    await query('DELETE FROM user_connections WHERE user_id = $1', [request.authUser.id]);
    await query('DELETE FROM user_settings WHERE user_id = $1', [request.authUser.id]);
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,'user.data_deleted',$2)`,
      [request.authUser.id, { requestedAt: new Date().toISOString() }],
    );

    return reply.code(202).send({ deleted: true });
  });
}
