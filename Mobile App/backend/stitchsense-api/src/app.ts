import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController } from 'fastify';
import { randomUUID } from 'node:crypto';
import rawBody from 'fastify-raw-body';
import { ZodError } from 'zod';
import { config } from './config.js';
import { query } from './db/pool.js';
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
import { checkStorageReadiness, destroyStorageClient } from './services/storage.js';
import { stashRoutes } from './routes/stash.js';
import { syncRoutes } from './routes/sync.js';
import { userRoutes } from './routes/users.js';
import { visionRoutes } from './routes/vision.js';

export async function buildApp() {
  const allowedOrigins = new Set(config.corsOrigins.map((origin) => new URL(origin).origin));
  const app = Fastify({
    genReqId(request) {
      const incomingRequestId = request.headers['x-request-id'];
      if (typeof incomingRequestId === 'string' && incomingRequestId.trim()) {
        return incomingRequestId.slice(0, 128);
      }
      return randomUUID();
    },
    requestIdHeader: 'x-request-id',
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    logger: {
      level: config.logLevel,
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
    bodyLimit: config.maxPatternUploadBytes,
    trustProxy: config.trustProxy.length > 0 ? config.trustProxy : false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.nodeEnv !== 'production' || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxPatternUploadBytes,
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

  app.addHook('onClose', async () => {
    destroyStorageClient();
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const responseTimeMs = reply.elapsedTime;
    const logPayload = {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(responseTimeMs),
      userId: request.authUser?.id,
    };

    if (responseTimeMs >= config.slowRequestMs) {
      request.log.warn(logPayload, 'Slow API request');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid request',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    const handledError = error as Error & { statusCode?: number };
    const statusCode = typeof handledError.statusCode === 'number' && handledError.statusCode >= 400
      ? handledError.statusCode
      : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
      return reply.code(500).send({ error: 'Internal server error', requestId: request.id });
    }
    return reply.code(statusCode).send({ error: handledError.message, requestId: request.id });
  });

  app.get('/health', async () => ({ ok: true, service: 'stitchsense-api' }));

  async function withReadinessTimeout(name: string, check: Promise<unknown>) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        check,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`${name} readiness check timed out after ${config.readinessCheckTimeoutMs}ms`)),
            config.readinessCheckTimeoutMs,
          );
        }),
      ]);
      return true;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  app.get('/ready', async (_request, reply) => {
    const checks = {
      database: false,
      storage: false,
    };

    try {
      await withReadinessTimeout('Database', query('SELECT 1'));
      checks.database = true;
    } catch (error) {
      app.log.error({ err: error }, 'Database readiness check failed');
    }

    try {
      await withReadinessTimeout('Object-storage', checkStorageReadiness());
      checks.storage = true;
    } catch (error) {
      app.log.error({ err: error }, 'Object-storage readiness check failed');
    }

    const ready = checks.database && checks.storage;
    return reply.code(ready ? 200 : 503).send({
      ok: ready,
      service: 'stitchsense-api',
      checks,
    });
  });

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
