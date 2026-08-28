import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';

const eventBody = z.object({
  eventType: z.string().min(1).max(120),
  metadata: z.record(z.unknown()).default({}),
});

export async function eventRoutes(app: FastifyInstance) {
  app.post('/events', { preHandler: app.authenticate }, async (request, reply) => {
    const body = eventBody.parse(request.body);
    await query(
      `INSERT INTO audit_events (actor_user_id, target_user_id, event_type, metadata)
       VALUES ($1,$1,$2,$3)`,
      [request.authUser.id, `mobile.${body.eventType}`, body.metadata],
    );
    return reply.code(202).send({ accepted: true });
  });
}
