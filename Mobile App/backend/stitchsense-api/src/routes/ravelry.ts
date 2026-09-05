import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { hasFeature, resolveEntitlement } from '../services/entitlements.js';
import { syncWordPressLibraryForUser } from '../services/wordpressSync.js';
import { configuredWordPressSiteUrl } from '../services/wordpressSite.js';

type LinkedWordPressAccountRow = {
  provider_user_id: string;
  metadata: {
    siteUrl?: string;
    wpUserId?: string | number;
    [key: string]: unknown;
  };
};

type UserPatternRow = Record<string, unknown>;

const ravelrySearchQuery = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  craft: z.string().trim().optional(),
  weight: z.string().trim().optional(),
  availability: z.string().trim().optional(),
  sort: z.string().trim().optional(),
});

const usernameBody = z.object({
  username: z.string().trim().min(1),
});

const importBody = z.object({
  id: z.string().trim().optional(),
  libraryPatternId: z.string().uuid().optional(),
  pattern: z.record(z.unknown()).optional(),
});

async function linkedWordPressAccountForUser(userId: string) {
  const result = await query<LinkedWordPressAccountRow>(
    `SELECT provider_user_id, metadata
     FROM linked_accounts
     WHERE user_id = $1
       AND provider = 'wordpress'
     ORDER BY linked_accounts.created_at ASC
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

async function wordpressBridgeRequest(
  userId: string,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST';
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  } = {},
) {
  if (!config.wordpress.sharedSecret) {
    throw new Error('WordPress bridge is not configured on the shared API.');
  }

  const linked = await linkedWordPressAccountForUser(userId);
  if (!linked) {
    throw new Error('This StitchSense account is not linked to a WordPress account yet.');
  }

  const providerParts = linked.provider_user_id.split('|');
  const siteUrl = configuredWordPressSiteUrl();
  const wpUserId = String(linked.metadata.wpUserId ?? providerParts[1] ?? '').trim();
  if (!siteUrl || !wpUserId) {
    throw new Error('The linked WordPress account is missing site or user details.');
  }

  const url = new URL(`${siteUrl}/wp-json/stitchsense/v1/${endpoint}`);
  const query = options.query ?? {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('wpUserId', wpUserId);

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    redirect: 'error',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
    },
    body:
      options.method === 'POST'
        ? JSON.stringify({
            wpUserId,
            ...(options.body ?? {}),
          })
        : undefined,
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : `WordPress bridge request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function importedPatternForUser(userId: string, patternId: string) {
  const result = await query<UserPatternRow>(
    `SELECT *
     FROM user_patterns
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [patternId, userId],
  );

  return result.rows[0] ?? null;
}

async function importedRavelryPatternForUser(userId: string, ravelryId: string) {
  const result = await query<UserPatternRow>(
    `SELECT *
     FROM user_patterns
     WHERE user_id = $1
       AND metadata->>'ravelry_id' = $2
       AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId, ravelryId],
  );

  return result.rows[0] ?? null;
}

async function importedPatternOwner(patternId: string) {
  const result = await query<{ user_id: string }>(
    `SELECT user_id
     FROM user_patterns
     WHERE id = $1
     LIMIT 1`,
    [patternId],
  );

  return result.rows[0]?.user_id ?? null;
}

export async function ravelryRoutes(app: FastifyInstance) {
  app.get('/ravelry/status', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/status');
  });

  app.post('/ravelry/connect-url', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/connect-url', {
      method: 'POST',
      body: {},
    });
  });

  app.post('/ravelry/username', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    const body = usernameBody.parse(request.body);
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/username', {
      method: 'POST',
      body,
    });
  });

  app.post('/ravelry/disconnect', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/disconnect', {
      method: 'POST',
      body: {},
    });
  });

  app.get('/ravelry/search', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    const params = ravelrySearchQuery.parse(request.query);
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/search', {
      query: {
        q: params.q,
        page: params.page,
        page_size: params.pageSize,
        craft: params.craft,
        weight: params.weight,
        availability: params.availability,
        sort: params.sort,
      },
    });
  });

  app.get('/ravelry/pattern', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    const queryParams = z.object({ id: z.string().trim().min(1) }).parse(request.query);
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/pattern', {
      query: { id: queryParams.id },
    });
  });

  app.get('/ravelry/saved', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    const params = z
      .object({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(48).optional(),
      })
      .parse(request.query);
    return wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/saved', {
      query: {
        page: params.page,
        page_size: params.pageSize,
      },
    });
  });

  app.post('/ravelry/import', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'ravelryImport')) {
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    }
    const body = importBody.parse(request.body);
    const existingRavelryPattern = body.id
      ? await importedRavelryPatternForUser(request.authUser.id, body.id)
      : null;
    const libraryPatternId =
      (typeof existingRavelryPattern?.id === 'string' ? existingRavelryPattern.id : '') ||
      body.libraryPatternId;
    if (libraryPatternId && !existingRavelryPattern) {
      const ownedPattern = await importedPatternForUser(request.authUser.id, libraryPatternId);
      if (!ownedPattern) {
        return reply.code(404).send({ error: 'Pattern not found' });
      }
    }
    const result = await wordpressBridgeRequest(request.authUser.id, 'platform-ravelry/import', {
      method: 'POST',
      body: {
        id: body.id,
        library_pattern_id: libraryPatternId,
        pattern: body.pattern,
      },
    });

    const responsePayload: Record<string, unknown> = {
      ...result,
    };

    try {
      await syncWordPressLibraryForUser(request.authUser.id);
    } catch (error) {
      responsePayload.syncWarning =
        error instanceof Error ? error.message : 'WordPress sync after import failed.';
    }

    const importedId = typeof result.id === 'string' ? result.id.trim() : '';
    const importedPattern =
      (importedId ? await importedPatternForUser(request.authUser.id, importedId) : null) ??
      (body.id ? await importedRavelryPatternForUser(request.authUser.id, body.id) : null);
    if (importedPattern) {
      responsePayload.pattern = importedPattern;
      responsePayload.id = importedPattern.id;
      responsePayload.action = libraryPatternId ? 'updated' : 'created';
    } else if (importedId) {
      const ownerId = await importedPatternOwner(importedId);
      if (ownerId && ownerId !== request.authUser.id) {
        responsePayload.visibilityWarning =
          'Pattern imported successfully, but it is linked to a different StitchSense account than the one currently signed in.';
      }
    }

    return responsePayload;
  });
}
