import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { configuredWordPressSiteUrl } from './wordpressSite.js';

const uploadsPrefix = '/wp-content/uploads/';
const signedRoutePath = '/wp-json/stitchsense/v1/pattern-files';
const managedRoots = ['stitchsense/patterns/', 'stitchsense/ravelry/'];
const userScopedPath = /^stitchsense\/(?:patterns|ravelry)\/user-(\d+)\//;

export const appFileLinkTtlSeconds = 15 * 60;
export const webFileLinkTtlSeconds = 6 * 60 * 60;

function wordpressSite() {
  if (!config.wordpress.siteUrl || !config.wordpress.sharedSecret) return null;
  try {
    return new URL(configuredWordPressSiteUrl());
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string) {
  return a.replace(/^www\./, '').toLowerCase() === b.replace(/^www\./, '').toLowerCase();
}

function isSafeRelativePath(value: string) {
  if (!managedRoots.some((root) => value.startsWith(root))) return false;
  if (/[\\\u0000-\u001f]/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function wordpressPatternFilePath(fileUrl: string | null | undefined) {
  if (!fileUrl) return null;
  const site = wordpressSite();
  if (!site) return null;

  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return null;
  }
  if (!sameHost(url.hostname, site.hostname)) return null;

  const basePath = site.pathname.replace(/\/+$/, '');
  let relative: string | null = null;
  if (url.pathname.startsWith(`${basePath}${uploadsPrefix}`)) {
    try {
      relative = decodeURIComponent(url.pathname.slice(`${basePath}${uploadsPrefix}`.length));
    } catch {
      return null;
    }
  } else if (url.pathname === `${basePath}${signedRoutePath}`) {
    relative = url.searchParams.get('path');
  }

  return relative && isSafeRelativePath(relative) ? relative : null;
}

export function canonicalWordPressPatternFileUrl(relativePath: string) {
  const site = wordpressSite();
  if (!site) throw new Error('WordPress bridge is not configured');
  const basePath = site.pathname.replace(/\/+$/, '');
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${site.origin}${basePath}${uploadsPrefix}${encoded}`;
}

// Signed links stored back by clients are converted to the permanent uploads address.
export function normaliseIncomingPatternFileUrl(fileUrl: string | undefined) {
  if (!fileUrl) return fileUrl;
  const relative = wordpressPatternFilePath(fileUrl);
  return relative ? canonicalWordPressPatternFileUrl(relative) : fileUrl;
}

export function normaliseIncomingPatternMetadata<T extends Record<string, unknown> | undefined>(metadata: T): T {
  if (!metadata || typeof metadata.parent_file_url !== 'string') return metadata;
  return { ...metadata, parent_file_url: normaliseIncomingPatternFileUrl(metadata.parent_file_url) };
}

export function signWordPressPatternFile(relativePath: string, expires: number, secret = config.wordpress.sharedSecret) {
  return createHmac('sha256', secret).update(`stitchsense-pattern-file\n${relativePath}\n${expires}`).digest('hex');
}

export function signedWordPressPatternFileUrl(relativePath: string, ttlSeconds: number, now = Date.now()) {
  const site = wordpressSite();
  if (!site) throw new Error('WordPress bridge is not configured');
  const expires = Math.floor(now / 1000) + ttlSeconds;
  const basePath = site.pathname.replace(/\/+$/, '');
  const url = new URL(`${site.origin}${basePath}${signedRoutePath}`);
  url.searchParams.set('path', relativePath);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('sig', signWordPressPatternFile(relativePath, expires));
  return url.toString();
}

export async function linkedWordPressUserId(userId: string) {
  const result = await query<{ provider_user_id: string }>(
    `SELECT provider_user_id FROM linked_accounts
     WHERE user_id = $1 AND provider = 'wordpress'
     ORDER BY created_at ASC LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.provider_user_id ?? null;
}

export async function userOwnsWordPressPatternFile(userId: string, relativePath: string, wpUserId?: string | null) {
  const scoped = relativePath.match(userScopedPath);
  if (scoped) {
    const linked = wpUserId === undefined ? await linkedWordPressUserId(userId) : wpUserId;
    return linked !== null && linked === scoped[1];
  }

  const result = await query(
    'SELECT 1 FROM wordpress_pattern_file_owners WHERE relative_path = $1 AND user_id = $2',
    [relativePath, userId],
  );
  return Boolean(result.rowCount);
}

export type PatternFileAccess =
  | { managed: false }
  | { managed: true; relativePath: string; url: string | null };

export async function wordpressPatternFileAccess(
  userId: string,
  fileUrl: string | null | undefined,
  ttlSeconds: number,
): Promise<PatternFileAccess> {
  const relativePath = wordpressPatternFilePath(fileUrl);
  if (!relativePath) return { managed: false };
  const owned = await userOwnsWordPressPatternFile(userId, relativePath);
  return { managed: true, relativePath, url: owned ? signedWordPressPatternFileUrl(relativePath, ttlSeconds) : null };
}

export type LegacyFileOwnerPlan = {
  owners: Map<string, string>;
  conflicts: Map<string, string[]>;
};

// A legacy file referenced by more than one user is left unassigned rather than guessed.
export function planLegacyWordPressFileOwners(
  rows: { user_id: string; file_url: string | null; metadata: unknown }[],
): LegacyFileOwnerPlan {
  const referencedBy = new Map<string, Set<string>>();
  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    const candidates = [row.file_url, metadata.parent_file_url, metadata.stored_pdf_url, metadata.wp_upload_file_url]
      .map((value) => (typeof value === 'string' ? wordpressPatternFilePath(value) : null));
    const storedRelative = metadata.stored_pdf_relative_path;
    if (typeof storedRelative === 'string' && isSafeRelativePath(storedRelative)) candidates.push(storedRelative);

    for (const path of candidates) {
      if (!path || userScopedPath.test(path)) continue;
      const users = referencedBy.get(path) ?? new Set<string>();
      users.add(row.user_id);
      referencedBy.set(path, users);
    }
  }

  const owners = new Map<string, string>();
  const conflicts = new Map<string, string[]>();
  for (const [path, users] of referencedBy) {
    if (users.size === 1) owners.set(path, [...users][0]);
    else conflicts.set(path, [...users]);
  }
  return { owners, conflicts };
}

type PatternRow = { file_url?: string | null; metadata?: unknown; [key: string]: unknown };

// Adds signed links for the website, which can no longer load uploads directly.
export async function withWordPressFileAccessUrls<T extends PatternRow>(userId: string, rows: T[]) {
  if (!wordpressSite()) return rows;

  const parentUrl = (row: T) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    return typeof metadata.parent_file_url === 'string' ? metadata.parent_file_url : null;
  };

  const paths = new Set<string>();
  for (const row of rows) {
    for (const value of [row.file_url, parentUrl(row)]) {
      const relative = wordpressPatternFilePath(value);
      if (relative) paths.add(relative);
    }
  }
  if (paths.size === 0) return rows;

  const wpUserId = await linkedWordPressUserId(userId);
  const legacy = [...paths].filter((path) => !userScopedPath.test(path));
  const registered = new Set<string>();
  if (legacy.length) {
    const result = await query<{ relative_path: string }>(
      'SELECT relative_path FROM wordpress_pattern_file_owners WHERE user_id = $1 AND relative_path = ANY($2::text[])',
      [userId, legacy],
    );
    for (const row of result.rows) registered.add(row.relative_path);
  }

  const accessUrl = (value: string | null | undefined) => {
    const relative = wordpressPatternFilePath(value);
    if (!relative) return null;
    const scoped = relative.match(userScopedPath);
    const owned = scoped ? wpUserId !== null && wpUserId === scoped[1] : registered.has(relative);
    return owned ? signedWordPressPatternFileUrl(relative, webFileLinkTtlSeconds) : null;
  };

  return rows.map((row) => ({
    ...row,
    file_access_url: accessUrl(row.file_url),
    parent_file_access_url: accessUrl(parentUrl(row)),
  }));
}
