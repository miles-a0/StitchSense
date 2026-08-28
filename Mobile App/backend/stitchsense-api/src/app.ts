import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import { config } from './config.js';
import { registerAuth } from './middleware/auth.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { chatRoutes } from './routes/chats.js';
import { eventRoutes } from './routes/events.js';
import { patternRoutes } from './routes/patterns.js';
import { projectRoutes } from './routes/projects.js';
import { promoRoutes } from './routes/promos.js';
import { ravelryRoutes } from './routes/ravelry.js';
import { rewriteRoutes } from './routes/rewrites.js';
import { stashRoutes } from './routes/stash.js';
import { syncRoutes } from './routes/sync.js';
import { userRoutes } from './routes/users.js';
import { visionRoutes } from './routes/vision.js';

const MAX_PATTERN_UPLOAD_BYTES = 110 * 1024 * 1024;

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.query.access_token',
          'body.password',
          'body.code',
          'body.refreshToken',
          'body.token',
          'body.secret',
          'body.webhookSecret',
          'body.stripeSecretKey',
        ],
        censor: '[redacted]',
      },
    },
    bodyLimit: MAX_PATTERN_UPLOAD_BYTES,
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, {
    limits: {
      fileSize: MAX_PATTERN_UPLOAD_BYTES,
      files: 1,
    },
  });
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: false,
    runFirst: true,
  });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await registerAuth(app);

  app.get('/health', async () => ({ ok: true, service: 'stitchsense-api' }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(patternRoutes);
  await app.register(projectRoutes);
  await app.register(promoRoutes);
  await app.register(stashRoutes);
  await app.register(ravelryRoutes);
  await app.register(chatRoutes);
  await app.register(rewriteRoutes);
  await app.register(visionRoutes);
  await app.register(billingRoutes);
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(syncRoutes);
  await app.register(eventRoutes);

  return app;
}
