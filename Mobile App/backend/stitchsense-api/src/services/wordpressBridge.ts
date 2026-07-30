import { query } from '../db/pool.js';
import { config } from '../config.js';
import { fetchWithTimeout } from './http.js';

type LinkedWordPressAccount = {
  siteUrl: string;
  wpUserId: string;
};

async function linkedWordPressAccount(userId: string): Promise<LinkedWordPressAccount | null> {
  if (!config.wordpress.sharedSecret) {
    return null;
  }

  const result = await query<{
    provider_user_id: string;
    metadata: {
      siteUrl?: string;
      wpUserId?: string | number;
      [key: string]: unknown;
    } | null;
  }>(
    `SELECT provider_user_id, metadata
     FROM linked_accounts
     WHERE user_id = $1
       AND provider = 'wordpress'
     ORDER BY linked_accounts.created_at ASC
     LIMIT 1`,
    [userId],
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];
  const providerParts = String(row.provider_user_id ?? '').split('|');
  const siteUrl = String(row.metadata?.siteUrl ?? providerParts[0] ?? config.wordpress.siteUrl ?? '')
    .trim()
    .replace(/\/$/, '');
  const wpUserId = String(row.metadata?.wpUserId ?? providerParts[1] ?? '').trim();

  if (!siteUrl || !wpUserId) {
    return null;
  }

  return { siteUrl, wpUserId };
}

export async function callWordPressChatProxy(userId: string, payload: Record<string, unknown>) {
  const linked = await linkedWordPressAccount(userId);
  if (!linked) {
    return null;
  }

  const url = new URL(`${linked.siteUrl}/wp-json/stitchsense/v1/platform-chat-proxy`);
  url.searchParams.set('wpUserId', linked.wpUserId);

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    timeoutMs: 600000,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { answer: text };
  }

  if (!response.ok) {
    const errorMessage =
      typeof body === 'object' && body
        ? String(
            (body as { error?: unknown; message?: unknown }).error ??
              (body as { error?: unknown; message?: unknown }).message ??
              `WordPress chat proxy failed with HTTP ${response.status}`,
          )
        : `WordPress chat proxy failed with HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  if (
    typeof body === 'object' &&
    body &&
    (
      ('success' in body && (body as { success?: unknown }).success === false) ||
      ('ok' in body && (body as { ok?: unknown }).ok === false)
    )
  ) {
    const errorMessage = String(
      (body as { error?: unknown; message?: unknown }).error ??
        (body as { error?: unknown; message?: unknown }).message ??
        'WordPress chat proxy failed.',
    );
    throw new Error(errorMessage);
  }

  return body;
}

async function postWordPressJsonProxy(
  siteUrl: string,
  path: string,
  wpUserId: string,
  payload: Record<string, unknown>,
) {
  const url = new URL(`${siteUrl}${path}`);
  url.searchParams.set('wpUserId', wpUserId);

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    timeoutMs: 600000,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { answer: text };
  }

  if (!response.ok) {
    const errorMessage =
      typeof body === 'object' && body
        ? String(
            (body as { error?: unknown; message?: unknown }).error ??
              (body as { error?: unknown; message?: unknown }).message ??
              `WordPress proxy failed with HTTP ${response.status}`,
          )
        : `WordPress proxy failed with HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  if (
    typeof body === 'object' &&
    body &&
    'success' in body &&
    (body as { success?: unknown }).success === false
  ) {
    const errorMessage = String(
      (body as { error?: unknown; message?: unknown }).error ??
        (body as { error?: unknown; message?: unknown }).message ??
        'WordPress proxy failed.',
    );
    throw new Error(errorMessage);
  }

  return body;
}

export async function callWordPressImageProxy(userId: string, payload: Record<string, unknown>) {
  const linked = await linkedWordPressAccount(userId);
  if (!linked) {
    return null;
  }

  try {
    return await postWordPressJsonProxy(
      linked.siteUrl,
      '/wp-json/stitchsense/v1/platform-image-proxy',
      linked.wpUserId,
      payload,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!/no route|404|not found/i.test(message)) {
      throw error;
    }
  }

  return postWordPressJsonProxy(
    linked.siteUrl,
    '/wp-json/stitchsense/v1/image-analysis',
    linked.wpUserId,
    payload,
  );
}

export async function callWordPressUploadProxy(userId: string, payload: Record<string, unknown>) {
  const linked = await linkedWordPressAccount(userId);
  if (!linked) {
    return null;
  }

  return postWordPressJsonProxy(
    linked.siteUrl,
    '/wp-json/stitchsense/v1/platform-upload-proxy',
    linked.wpUserId,
    payload,
  );
}

export async function deleteWordPressUserData(userId: string) {
  const linked = await linkedWordPressAccount(userId);
  if (!linked) {
    return null;
  }

  return postWordPressJsonProxy(
    linked.siteUrl,
    '/wp-json/stitchsense/v1/platform-delete-data',
    linked.wpUserId,
    { confirm: 'DELETE' },
  );
}
