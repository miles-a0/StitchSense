import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { configuredWordPressSiteUrl } from '../services/wordpressSite.js';

type LinkedWordPressAccountRow = {
  provider_user_id: string;
  metadata: {
    siteUrl?: string;
    wpUserId?: string | number;
    [key: string]: unknown;
  };
};

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

async function wordpressPromoRequest(userId: string) {
  if (!config.wordpress.sharedSecret) {
    return { promotions: [] };
  }

  const linked = await linkedWordPressAccountForUser(userId);
  if (!linked) {
    return { promotions: [] };
  }

  const providerParts = linked.provider_user_id.split('|');
  let siteUrl: string;
  try {
    siteUrl = configuredWordPressSiteUrl();
  } catch {
    return { promotions: [] };
  }
  const wpUserId = String(linked.metadata.wpUserId ?? providerParts[1] ?? '').trim();
  if (!siteUrl || !wpUserId) {
    return { promotions: [] };
  }

  const url = new URL(`${siteUrl}/wp-json/stitchsense/v1/platform-promotions`);
  url.searchParams.set('wpUserId', wpUserId);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
      },
    });

    if (!response.ok) {
      return { promotions: [] };
    }

    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { promotions: [] };
  }
}

export async function promoRoutes(app: FastifyInstance) {
  app.get('/promotions/active', { preHandler: app.authenticate }, async (request) => {
    return wordpressPromoRequest(request.authUser.id);
  });
}
