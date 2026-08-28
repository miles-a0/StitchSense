import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../db/pool.js';

export async function registerAuth(app: FastifyInstance) {
  app.decorate('authenticate', async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = await request.jwtVerify<{ sub: string }>();
      const result = await query<{ id: string; email: string; role: 'user' | 'admin' }>(
        'SELECT id, email, role FROM users WHERE id = $1',
        [token.sub],
      );
      if (!result.rowCount) {
        return reply.code(401).send({ error: 'User not found' });
      }
      request.authUser = result.rows[0];
    } catch {
      return reply.code(401).send({ error: 'Authentication required' });
    }
  });

  app.decorate('requireAdmin', async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    if (request.authUser.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
