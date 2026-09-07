import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { fetchWithTimeout } from '../services/http.js';
import { createRefreshToken, revokeRefreshToken, rotateRefreshToken, storeRefreshToken } from '../services/tokens.js';
import { syncWordPressLibraryForUser } from '../services/wordpressSync.js';
import { configuredWordPressSiteUrl } from '../services/wordpressSite.js';

const authBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).optional(),
});

const refreshBody = z.object({
  refreshToken: z.string().min(32),
});

const wordpressBridgeBody = z.object({
  wpUserId: z.union([z.string().min(1), z.number().int().positive()]),
  email: z.string().email(),
  displayName: z.string().min(1).optional(),
  siteUrl: z.string().url(),
  roles: z.array(z.string()).default([]),
});

const wordpressLoginBody = z
  .object({
    siteUrl: z.string().url().optional(),
    email: z.string().min(1).optional(),
    identifier: z.string().min(1).optional(),
    password: z.string().min(1),
  })
  .superRefine((body, ctx) => {
    const identifier = (body.identifier ?? body.email ?? '').trim();
    if (!identifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email or username is required',
        path: ['identifier'],
      });
    }
  });

const wordpressRegisterBody = z.object({
  siteUrl: z.string().url().optional(),
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8),
  displayName: z.string().min(1).optional(),
});

const passwordResetRequestBody = z.object({
  email: z.string().email(),
});

const passwordResetConfirmBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
});

async function issueTokens(app: FastifyInstance, userId: string) {
  const accessToken = app.jwt.sign({ sub: userId }, { expiresIn: '15m' });
  const refreshToken = createRefreshToken();
  const refreshTokenExpiresAt = await storeRefreshToken(userId, refreshToken);
  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

async function issueWordPressBridgeAuth(
  app: FastifyInstance,
  body: z.infer<typeof wordpressBridgeBody>,
) {
  const email = body.email.toLowerCase();
  const providerUserId = `${body.siteUrl.replace(/\/$/, '')}|${body.wpUserId}`;
  const desiredRole: 'user' | 'admin' = body.roles.includes('administrator') ? 'admin' : 'user';

  const existingLink = await query<{ id: string; email: string; displayName: string | null; role: 'user' | 'admin' }>(
    `SELECT u.id, u.email, u.display_name AS "displayName", u.role
     FROM linked_accounts la
     JOIN users u ON u.id = la.user_id
     WHERE la.provider = 'wordpress' AND la.provider_user_id = $1`,
    [providerUserId],
  );

  let user = existingLink.rows[0] ?? null;
  if (!user) {
    const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await query<{ id: string; email: string; displayName: string | null; role: 'user' | 'admin' }>(
      `INSERT INTO users (email, display_name, role, standard_trial_ends_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, users.display_name),
         role = EXCLUDED.role,
         updated_at = NOW()
       RETURNING id, email, display_name AS "displayName", role`,
      [email, body.displayName ?? null, desiredRole, trialEnds],
    );
    user = result.rows[0];
  } else if (user.role !== desiredRole) {
    const result = await query<{ id: string; email: string; displayName: string | null; role: 'user' | 'admin' }>(
      `UPDATE users
       SET role = $2,
           display_name = COALESCE($3, display_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name AS "displayName", role`,
      [user.id, desiredRole, body.displayName ?? null],
    );
    user = result.rows[0] ?? user;
  }

  await query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata)
     VALUES ($1, 'wordpress', $2, $3)
     ON CONFLICT (provider, provider_user_id) DO UPDATE SET
       metadata = EXCLUDED.metadata`,
    [
      user.id,
      providerUserId,
      {
        wpUserId: String(body.wpUserId),
        siteUrl: body.siteUrl,
        roles: body.roles,
        displayName: body.displayName ?? null,
      },
    ],
  );

  const tokens = await issueTokens(app, user.id);
  return { user, ...tokens };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/password-reset/request', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = passwordResetRequestBody.parse(request.body);
    if (config.wordpress.sharedSecret && config.wordpress.siteUrl) {
      try {
        const siteUrl = configuredWordPressSiteUrl();
        await fetchWithTimeout(
          `${siteUrl}/wp-json/stitchsense/v1/platform-password-reset/request`,
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              'content-type': 'application/json',
              'accept': 'application/json',
              'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
            },
            body: JSON.stringify({ email: body.email.toLowerCase() }),
          },
        );
      } catch (error) {
        request.log.warn({ error }, 'Password reset email request failed');
      }
    }
    return reply.send({
      message: 'If an account exists for that email, a reset code and link have been sent.',
    });
  });

  app.post('/auth/password-reset/confirm', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = passwordResetConfirmBody.parse(request.body);
    if (!config.wordpress.sharedSecret || !config.wordpress.siteUrl) {
      return reply.code(503).send({ error: 'Password recovery is not configured' });
    }

    const siteUrl = configuredWordPressSiteUrl();
    const response = await fetchWithTimeout(
      `${siteUrl}/wp-json/stitchsense/v1/platform-password-reset/confirm`,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
        },
        body: JSON.stringify({
          email: body.email.toLowerCase(),
          code: body.code,
          password: body.password,
        }),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      return reply.code(response.status).send({
        error: payload?.error ?? 'That code is invalid or has expired.',
      });
    }

    const result = await query(
      `UPDATE users
       SET password_hash = crypt($2, gen_salt('bf')), updated_at = NOW()
       WHERE email = $1
       RETURNING id`,
      [body.email.toLowerCase(), body.password],
    );
    if (result.rowCount) {
      await query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [result.rows[0].id],
      );
    }
    return reply.send({ message: 'Your password has been reset. You can now sign in.' });
  });

  app.post('/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = authBody.parse(request.body);
    const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await query<{ id: string; email: string; displayName: string | null; role: 'user' | 'admin' }>(
      `INSERT INTO users (email, display_name, password_hash, standard_trial_ends_at)
       VALUES ($1, $2, crypt($3, gen_salt('bf')), $4)
       RETURNING id, email, display_name AS "displayName", role`,
      [body.email.toLowerCase(), body.displayName ?? null, body.password, trialEnds],
    );
    const user = result.rows[0];
    const tokens = await issueTokens(app, user.id);
    return reply.code(201).send({ user, ...tokens });
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = authBody.pick({ email: true, password: true }).parse(request.body);
    const result = await query<{ id: string; email: string; displayName: string | null; role: 'user' | 'admin' }>(
      `SELECT id, email, display_name AS "displayName", role
       FROM users
       WHERE email = $1 AND password_hash = crypt($2, password_hash)`,
      [body.email.toLowerCase(), body.password],
    );
    if (!result.rowCount) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const tokens = await issueTokens(app, user.id);
    return { user, ...tokens };
  });

  app.post('/auth/refresh', {
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = refreshBody.parse(request.body);
    const rotated = await rotateRefreshToken(body.refreshToken);
    if (!rotated) {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
    const user = await query<{ id: string; email: string; displayName: string | null; role: 'user' | 'admin' }>(
      'SELECT id, email, display_name AS "displayName", role FROM users WHERE id = $1',
      [rotated.userId],
    );
    if (!user.rowCount) {
      return reply.code(401).send({ error: 'User not found' });
    }
    return {
      user: user.rows[0],
      accessToken: app.jwt.sign({ sub: rotated.userId }, { expiresIn: '15m' }),
      refreshToken: rotated.refreshToken,
      refreshTokenExpiresAt: rotated.refreshTokenExpiresAt,
    };
  });

  app.post('/auth/logout', {
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = refreshBody.parse(request.body);
    await revokeRefreshToken(body.refreshToken);
    return reply.code(204).send();
  });

  app.post('/auth/wordpress', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!config.wordpress.sharedSecret) {
      return reply.code(503).send({ error: 'WordPress bridge is not configured' });
    }

    const suppliedSecret = request.headers['x-stitchsense-wordpress-secret'];
    if (Array.isArray(suppliedSecret) || suppliedSecret !== config.wordpress.sharedSecret) {
      return reply.code(401).send({ error: 'Invalid WordPress bridge secret' });
    }

    const body = wordpressBridgeBody.parse(request.body);
    try {
      const siteUrl = configuredWordPressSiteUrl(body.siteUrl);
      return issueWordPressBridgeAuth(app, { ...body, siteUrl });
    } catch {
      return reply.code(400).send({ error: 'WordPress site URL does not match the configured bridge site' });
    }
  });

  app.post('/auth/wordpress-login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    if (!config.wordpress.sharedSecret) {
      return reply.code(503).send({ error: 'WordPress bridge is not configured' });
    }

    const body = wordpressLoginBody.parse(request.body);
    let siteUrl: string;
    try {
      siteUrl = configuredWordPressSiteUrl(body.siteUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WordPress site URL is not configured';
      return reply.code(message.includes('does not match') ? 400 : 503).send({ error: message });
    }
    const identifier = (body.identifier ?? body.email ?? '').trim();
    try {
      const response = await fetchWithTimeout(`${siteUrl}/wp-json/stitchsense/v1/platform-login`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
        },
        body: JSON.stringify({
          identifier,
          password: body.password,
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || typeof payload !== 'object') {
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `WordPress authentication failed with HTTP ${response.status}`;
        return reply.code(response.status >= 400 ? response.status : 502).send({ error: message });
      }

      const parsed = wordpressBridgeBody.parse({ ...(payload as Record<string, unknown>), siteUrl });
      const auth = await issueWordPressBridgeAuth(app, parsed);
      try {
        await syncWordPressLibraryForUser(auth.user.id);
      } catch (error) {
        request.log.warn({ error }, 'WordPress library sync failed after login');
      }
      return auth;
    } catch {
      return reply.code(502).send({ error: 'Could not reach the WordPress site for account verification' });
    }
  });

  app.post('/auth/wordpress-register', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    if (!config.wordpress.sharedSecret) {
      return reply.code(503).send({ error: 'WordPress bridge is not configured' });
    }

    const body = wordpressRegisterBody.parse(request.body);
    let siteUrl: string;
    try {
      siteUrl = configuredWordPressSiteUrl(body.siteUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WordPress site URL is not configured';
      return reply.code(message.includes('does not match') ? 400 : 503).send({ error: message });
    }

    try {
      const response = await fetchWithTimeout(`${siteUrl}/wp-json/stitchsense/v1/platform-register`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
        },
        body: JSON.stringify({
          email: body.email,
          username: body.username,
          password: body.password,
          displayName: body.displayName,
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || typeof payload !== 'object') {
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `WordPress registration failed with HTTP ${response.status}`;
        return reply.code(response.status >= 400 ? response.status : 502).send({ error: message });
      }

      const parsed = wordpressBridgeBody.parse({ ...(payload as Record<string, unknown>), siteUrl });
      const auth = await issueWordPressBridgeAuth(app, parsed);
      return reply.code(201).send(auth);
    } catch {
      return reply.code(502).send({ error: 'Could not reach the WordPress site to create the account' });
    }
  });
}
