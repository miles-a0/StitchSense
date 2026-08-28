import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { configuredWordPressSiteUrl } from './wordpressSite.js';
import { fetchWithTimeout } from './http.js';

interface WordPressExportUser {
  email?: string;
  display_name?: string;
  legacy_wp_user_id?: number;
}

interface WordPressExportPattern {
  id?: string;
  title?: string;
  craft_type?: string;
  original_filename?: string;
  file_url?: string;
  pattern_summary_html?: string;
  pattern_summary_text?: string;
  pattern_summary_structured?: unknown;
  source?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  project_id?: string;
  file_id?: string;
  job_id?: string;
}

interface WordPressExportChat {
  id?: string;
  pattern_id?: string;
  title?: string;
  skill_level?: string;
  created_at?: string;
  updated_at?: string;
}

interface WordPressExportMessage {
  session_id?: string;
  role?: string;
  content?: string;
  kind?: string;
  tool_mode?: string;
  created_at?: string;
}

interface WordPressExportRewrite {
  id?: string;
  pattern_id?: string;
  prompt?: string;
  rewrite_result?: string;
  rewrite_changes?: unknown;
  rewrite_warnings?: unknown;
  confidence_score?: number;
  created_at?: string;
}

interface WordPressExportPayload {
  user?: WordPressExportUser;
  patterns?: WordPressExportPattern[];
  chat_sessions?: WordPressExportChat[];
  chat_messages?: Record<string, WordPressExportMessage[]> | WordPressExportMessage[];
  rewrite_sessions?: WordPressExportRewrite[];
  settings?: {
    default_skill?: string;
    measurement_unit?: string;
    language?: string;
    preferences?: Record<string, unknown> | string;
  } | null;
}

interface LinkedWordPressAccountRow {
  provider_user_id: string;
  metadata: {
    siteUrl?: string;
    wpUserId?: string | number;
    lastWordpressSyncAt?: string;
    [key: string]: unknown;
  };
}

interface SyncCountRow {
  count: string;
}

interface PlatformPatternParityRow {
  id: string;
  title: string;
  original_filename: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface ExistingPatternTombstoneRow {
  deleted_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WordPressMirrorSnapshot {
  available: boolean;
  reason?: string;
  siteUrl?: string | null;
  wpUserId?: string | null;
  fetchedAt?: string | null;
  counts?: {
    patterns: number;
    chats: number;
    chatMessages: number;
    rewrites: number;
  };
  patternParity?: {
    matchedCount: number;
    missingInPlatform: Array<{
      key: string;
      title: string;
      originalFilename?: string | null;
    }>;
    extraInPlatform: Array<{
      key: string;
      title: string;
      originalFilename?: string | null;
    }>;
  };
}

function asDate(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function asUUID(value: string | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(trimmed)
    ? trimmed
    : null;
}

function asArray<T>(value: T[] | Record<string, T> | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function normaliseString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function metadataObject(value: unknown) {
  return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function buildRavelryIdentity(metadata: Record<string, unknown>) {
  const externalService = normaliseString(metadata.external_service).toLowerCase();
  const ravelryId = normaliseString(metadata.ravelry_id);
  const ravelryUrl = normaliseString(metadata.ravelry_url);

  if (externalService === 'ravelry' && ravelryId) {
    return `ravelry:${ravelryId}`;
  }

  if (externalService === 'ravelry' && ravelryUrl) {
    return `ravelry-url:${ravelryUrl.toLowerCase()}`;
  }

  if (ravelryId) {
    return `ravelry:${ravelryId}`;
  }

  if (ravelryUrl) {
    return `ravelry-url:${ravelryUrl.toLowerCase()}`;
  }

  return null;
}

function buildWordPressPatternKey(pattern: WordPressExportPattern) {
  const metadata = metadataObject(pattern.metadata);
  const ravelryIdentity = buildRavelryIdentity(metadata);
  if (ravelryIdentity) {
    return ravelryIdentity;
  }

  const wordpressPatternId = normaliseString(pattern.id);
  if (wordpressPatternId) {
    return `wp:${wordpressPatternId}`;
  }

  const projectId = normaliseString(metadata.project_id ?? pattern.project_id);
  if (projectId) {
    return `project:${projectId}`;
  }

  const title = normaliseString(pattern.title).toLowerCase();
  const filename = normaliseString(pattern.original_filename).toLowerCase();
  return `shape:${title}::${filename}`;
}

function buildPlatformPatternKey(pattern: PlatformPatternParityRow) {
  const metadata = metadataObject(pattern.metadata);
  const ravelryIdentity = buildRavelryIdentity(metadata);
  if (ravelryIdentity) {
    return ravelryIdentity;
  }

  const wordpressPatternId = normaliseString(metadata.wordpress_pattern_id);
  if (wordpressPatternId) {
    return `wp:${wordpressPatternId}`;
  }

  const metadataProjectId = normaliseString(metadata.project_id);
  const projectId = normaliseString(pattern.project_id);
  if (metadataProjectId || projectId) {
    return `project:${metadataProjectId || projectId}`;
  }

  return `shape:${normaliseString(pattern.title).toLowerCase()}::${normaliseString(pattern.original_filename).toLowerCase()}`;
}

function normaliseMessagesBySession(payload: WordPressExportPayload) {
  const raw = payload.chat_messages;
  if (!raw) return new Map<string, WordPressExportMessage[]>();
  if (Array.isArray(raw)) {
    const map = new Map<string, WordPressExportMessage[]>();
    for (const message of raw) {
      const sessionId = message.session_id?.trim();
      if (!sessionId) continue;
      const existing = map.get(sessionId) ?? [];
      existing.push(message);
      map.set(sessionId, existing);
    }
    return map;
  }

  const map = new Map<string, WordPressExportMessage[]>();
  for (const [sessionId, messages] of Object.entries(raw)) {
    map.set(sessionId, Array.isArray(messages) ? messages : []);
  }
  return map;
}

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

export async function wordpressMirrorSnapshotForUser(userId: string): Promise<WordPressMirrorSnapshot> {
  if (!config.wordpress.sharedSecret) {
    return {
      available: false,
      reason: 'wordpress_bridge_not_configured',
    };
  }

  const linked = await linkedWordPressAccountForUser(userId);
  if (!linked) {
    return {
      available: false,
      reason: 'no_linked_wordpress_account',
    };
  }

  const metadata = linked.metadata ?? {};
  const providerParts = linked.provider_user_id.split('|');
  let siteUrl: string;
  try {
    siteUrl = configuredWordPressSiteUrl();
  } catch {
    return {
      available: false,
      reason: 'wordpress_bridge_not_configured',
    };
  }
  const wpUserId = String(metadata.wpUserId ?? providerParts[1] ?? '').trim();

  if (!siteUrl || !wpUserId) {
    return {
      available: false,
      reason: 'linked_account_missing_site_or_user',
      siteUrl: siteUrl || null,
      wpUserId: wpUserId || null,
    };
  }

  const payload = await fetchWordPressExport(siteUrl, wpUserId);
  const wordpressPatterns = asArray(payload.patterns);
  const messagesBySession = normaliseMessagesBySession(payload);
  let chatMessageCount = 0;
  for (const messages of messagesBySession.values()) {
    chatMessageCount += messages.length;
  }

  const platformPatternsResult = await query<PlatformPatternParityRow>(
    `SELECT id, title, original_filename, project_id, metadata
     FROM user_patterns
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND (
         source = 'wordpress_sync'
         OR COALESCE(metadata->>'wordpress_pattern_id', '') <> ''
         OR COALESCE(metadata->>'project_id', '') <> ''
         OR COALESCE(metadata->>'ravelry_id', '') <> ''
         OR lower(COALESCE(metadata->>'external_service', '')) = 'ravelry'
       )`,
    [userId],
  );

  const wordpressPatternMap = new Map(
    wordpressPatterns.map((pattern) => {
      const key = buildWordPressPatternKey(pattern);
      return [
        key,
        {
          key,
          title: normaliseString(pattern.title) || 'Untitled',
          originalFilename: pattern.original_filename ?? null,
        },
      ] as const;
    }),
  );

  const platformPatternMap = new Map(
    platformPatternsResult.rows.map((pattern) => {
      const key = buildPlatformPatternKey(pattern);
      return [
        key,
        {
          key,
          title: normaliseString(pattern.title) || 'Untitled',
          originalFilename: pattern.original_filename ?? null,
        },
      ] as const;
    }),
  );

  const missingInPlatform = Array.from(wordpressPatternMap.entries())
    .filter(([key]) => !platformPatternMap.has(key))
    .map(([, value]) => value)
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, 10);

  const extraInPlatform = Array.from(platformPatternMap.entries())
    .filter(([key]) => !wordpressPatternMap.has(key))
    .map(([, value]) => value)
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, 10);

  const matchedCount = Array.from(wordpressPatternMap.keys()).filter((key) => platformPatternMap.has(key)).length;

  return {
    available: true,
    siteUrl,
    wpUserId,
    fetchedAt: new Date().toISOString(),
    counts: {
      patterns: wordpressPatterns.length,
      chats: asArray(payload.chat_sessions).length,
      chatMessages: chatMessageCount,
      rewrites: asArray(payload.rewrite_sessions).length,
    },
    patternParity: {
      matchedCount,
      missingInPlatform,
      extraInPlatform,
    },
  };
}

export async function wordpressSyncStatusForUser(userId: string) {
  const linked = await linkedWordPressAccountForUser(userId);
  const [patternCount, chatCount, rewriteCount] = await Promise.all([
    query<SyncCountRow>('SELECT COUNT(*)::text AS count FROM user_patterns WHERE user_id = $1 AND deleted_at IS NULL', [userId]),
    query<SyncCountRow>('SELECT COUNT(*)::text AS count FROM chat_sessions WHERE user_id = $1', [userId]),
    query<SyncCountRow>('SELECT COUNT(*)::text AS count FROM rewrite_sessions WHERE user_id = $1', [userId]),
  ]);

  const metadata = linked?.metadata ?? {};
  const providerParts = linked?.provider_user_id.split('|') ?? [];
  const siteUrl = String(metadata.siteUrl ?? providerParts[0] ?? '').trim();
  const wpUserId = String(metadata.wpUserId ?? providerParts[1] ?? '').trim();

  return {
    configured: Boolean(config.wordpress.sharedSecret),
    linked: Boolean(linked),
    siteUrl: siteUrl || null,
    wpUserId: wpUserId || null,
    lastWordpressSyncAt: typeof metadata.lastWordpressSyncAt === 'string' ? metadata.lastWordpressSyncAt : null,
    counts: {
      patterns: Number(patternCount.rows[0]?.count ?? 0),
      chats: Number(chatCount.rows[0]?.count ?? 0),
      rewrites: Number(rewriteCount.rows[0]?.count ?? 0),
    },
  };
}

export async function wordpressPendingSyncForUser(userId: string) {
  const snapshot = await wordpressMirrorSnapshotForUser(userId);
  if (!snapshot.available) {
    return {
      available: false,
      reason: snapshot.reason ?? 'wordpress_export_unavailable',
      hasPending: false,
      counts: {
        patterns: 0,
        chats: 0,
        rewrites: 0,
      },
    };
  }

  const [patternCount, chatCount, rewriteCount] = await Promise.all([
    query<SyncCountRow>('SELECT COUNT(*)::text AS count FROM user_patterns WHERE user_id = $1 AND deleted_at IS NULL', [userId]),
    query<SyncCountRow>('SELECT COUNT(*)::text AS count FROM chat_sessions WHERE user_id = $1', [userId]),
    query<SyncCountRow>('SELECT COUNT(*)::text AS count FROM rewrite_sessions WHERE user_id = $1', [userId]),
  ]);

  const platformCounts = {
    patterns: Number(patternCount.rows[0]?.count ?? 0),
    chats: Number(chatCount.rows[0]?.count ?? 0),
    rewrites: Number(rewriteCount.rows[0]?.count ?? 0),
  };
  const wordpressCounts = {
    patterns: snapshot.counts?.patterns ?? 0,
    chats: snapshot.counts?.chats ?? 0,
    rewrites: snapshot.counts?.rewrites ?? 0,
  };
  const missingPatternCount = snapshot.patternParity?.missingInPlatform.length ?? 0;
  const counts = {
    patterns: Math.max(wordpressCounts.patterns - platformCounts.patterns, missingPatternCount, 0),
    chats: Math.max(wordpressCounts.chats - platformCounts.chats, 0),
    rewrites: Math.max(wordpressCounts.rewrites - platformCounts.rewrites, 0),
  };

  return {
    available: true,
    siteUrl: snapshot.siteUrl ?? null,
    wpUserId: snapshot.wpUserId ?? null,
    checkedAt: snapshot.fetchedAt ?? new Date().toISOString(),
    hasPending: counts.patterns > 0 || counts.chats > 0 || counts.rewrites > 0,
    counts,
  };
}

async function fetchWordPressExport(siteUrl: string, wpUserId: string | number) {
  const safeSiteUrl = configuredWordPressSiteUrl(siteUrl);
  const response = await fetchWithTimeout(`${safeSiteUrl}/wp-json/stitchsense/v1/platform-export`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
    },
    body: JSON.stringify({ wpUserId }),
  });

  const payload = (await response.json()) as WordPressExportPayload | { error?: string };
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `WordPress export failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as WordPressExportPayload;
}

async function findExistingPatternId(userId: string, pattern: WordPressExportPattern) {
  const legacyId = asUUID(pattern.id);
  if (legacyId) {
    const byId = await query<{ id: string }>('SELECT id FROM user_patterns WHERE id = $1 AND user_id = $2 LIMIT 1', [legacyId, userId]);
    if (byId.rowCount) return byId.rows[0].id;
  }

  const metadata = metadataObject(pattern.metadata);
  const ravelryId = normaliseString(metadata.ravelry_id);
  if (ravelryId) {
    const byRavelryId = await query<{ id: string }>(
      `SELECT id
       FROM user_patterns
       WHERE user_id = $1
         AND metadata->>'ravelry_id' = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, ravelryId],
    );
    if (byRavelryId.rowCount) return byRavelryId.rows[0].id;
  }

  const ravelryUrl = normaliseString(metadata.ravelry_url);
  if (ravelryUrl) {
    const byRavelryUrl = await query<{ id: string }>(
      `SELECT id
       FROM user_patterns
       WHERE user_id = $1
         AND lower(COALESCE(metadata->>'ravelry_url', '')) = lower($2)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, ravelryUrl],
    );
    if (byRavelryUrl.rowCount) return byRavelryUrl.rows[0].id;
  }

  const projectId = String(metadata.project_id ?? pattern.project_id ?? '').trim();
  if (projectId) {
    const byProject = await query<{ id: string }>(
      `SELECT id
       FROM user_patterns
       WHERE user_id = $1
         AND (
           project_id = $2
           OR metadata->>'project_id' = $2
         )
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, projectId],
    );
    if (byProject.rowCount) return byProject.rows[0].id;
  }

  const title = (pattern.title ?? '').trim();
  const originalFilename = (pattern.original_filename ?? '').trim();
  if (title && originalFilename) {
    const byShape = await query<{ id: string }>(
      `SELECT id
       FROM user_patterns
       WHERE user_id = $1
         AND title = $2
         AND COALESCE(original_filename, '') = $3
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, title, originalFilename],
    );
    if (byShape.rowCount) return byShape.rows[0].id;
  }

  return legacyId ?? randomUUID();
}

async function upsertPattern(userId: string, legacyWpUserId: number | null, pattern: WordPressExportPattern) {
  const id = await findExistingPatternId(userId, pattern);
  const metadata = metadataObject(pattern.metadata);
  const existing = await query<ExistingPatternTombstoneRow>(
    `SELECT deleted_at, metadata
     FROM user_patterns
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [id, userId],
  );
  const deletedAt = existing.rows[0]?.deleted_at ? new Date(existing.rows[0].deleted_at) : null;
  const incomingUpdatedAt = pattern.updated_at ? asDate(pattern.updated_at) : null;
  if (
    deletedAt &&
    !Number.isNaN(deletedAt.getTime()) &&
    (!incomingUpdatedAt || incomingUpdatedAt.getTime() <= deletedAt.getTime())
  ) {
    return { importedId: id, legacyId: pattern.id ?? id, skipped: true };
  }

  metadata.wordpress_pattern_id = pattern.id ?? id;
  if (pattern.project_id && !metadata.project_id) metadata.project_id = pattern.project_id;
  if (pattern.file_id && !metadata.file_id) metadata.file_id = pattern.file_id;
  if (pattern.job_id && !metadata.job_id) metadata.job_id = pattern.job_id;
  if (normaliseString(metadata.external_service).toLowerCase() === 'ravelry') {
    metadata.external_service = 'ravelry';
  }

  await query(
    `INSERT INTO user_patterns
     (id, user_id, legacy_wp_user_id, title, craft_type, original_filename, file_url, pattern_summary_html, pattern_summary_text, pattern_summary_structured, project_id, file_id, job_id, source, metadata, created_at, updated_at, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULL)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       legacy_wp_user_id = EXCLUDED.legacy_wp_user_id,
       title = EXCLUDED.title,
       craft_type = EXCLUDED.craft_type,
       original_filename = EXCLUDED.original_filename,
       file_url = EXCLUDED.file_url,
       pattern_summary_html = EXCLUDED.pattern_summary_html,
       pattern_summary_text = EXCLUDED.pattern_summary_text,
       pattern_summary_structured = EXCLUDED.pattern_summary_structured,
       project_id = EXCLUDED.project_id,
       file_id = EXCLUDED.file_id,
       job_id = EXCLUDED.job_id,
       source = EXCLUDED.source,
       metadata = EXCLUDED.metadata,
       created_at = LEAST(user_patterns.created_at, EXCLUDED.created_at),
       updated_at = GREATEST(user_patterns.updated_at, EXCLUDED.updated_at),
       deleted_at = NULL`,
    [
      id,
      userId,
      legacyWpUserId,
      pattern.title ?? 'Untitled',
      pattern.craft_type ?? null,
      pattern.original_filename ?? null,
      pattern.file_url ?? null,
      pattern.pattern_summary_html ?? null,
      pattern.pattern_summary_text ?? null,
      pattern.pattern_summary_structured ?? {},
      pattern.project_id ?? null,
      pattern.file_id ?? null,
      pattern.job_id ?? null,
      pattern.source ?? 'wordpress_sync',
      metadata,
      asDate(pattern.created_at),
      asDate(pattern.updated_at),
    ],
  );

  return { importedId: id, legacyId: pattern.id ?? id, skipped: false };
}

async function upsertChatSession(userId: string, chat: WordPressExportChat, patternMap: Map<string, string>) {
  const id = asUUID(chat.id) ?? randomUUID();
  const patternId = chat.pattern_id ? patternMap.get(chat.pattern_id) ?? null : null;
  if (chat.pattern_id && !patternId) {
    return null;
  }

  await query(
    `INSERT INTO chat_sessions (id, user_id, pattern_id, title, skill_level, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       pattern_id = EXCLUDED.pattern_id,
       title = EXCLUDED.title,
       skill_level = EXCLUDED.skill_level,
       updated_at = GREATEST(chat_sessions.updated_at, EXCLUDED.updated_at)`,
    [
      id,
      userId,
      patternId,
      chat.title ?? 'Imported chat',
      chat.skill_level ?? 'beginner',
      asDate(chat.created_at),
      asDate(chat.updated_at),
    ],
  );

  return { importedId: id, legacyId: chat.id ?? id };
}

async function replaceChatMessages(sessionId: string, messages: WordPressExportMessage[]) {
  for (const message of messages) {
    if (!message.content) continue;
    await query(
      `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode, created_at)
       SELECT $1,$2,$3,$4,$5,$6
       WHERE NOT EXISTS (
         SELECT 1
         FROM chat_messages
         WHERE session_id = $1
           AND role = $2
           AND content = $3
           AND kind = $4
           AND created_at = $6
       )`,
      [
        sessionId,
        message.role ?? 'user',
        message.content,
        message.kind ?? 'message',
        message.tool_mode ?? null,
        asDate(message.created_at),
      ],
    );
  }
}

async function upsertRewrite(userId: string, rewrite: WordPressExportRewrite, patternMap: Map<string, string>) {
  const patternId = rewrite.pattern_id ? patternMap.get(rewrite.pattern_id) ?? null : null;
  if (!patternId || !rewrite.rewrite_result) return null;

  const id = asUUID(rewrite.id) ?? randomUUID();
  await query(
    `INSERT INTO rewrite_sessions (id, user_id, pattern_id, prompt, rewrite_result, rewrite_changes, rewrite_warnings, confidence_score, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       pattern_id = EXCLUDED.pattern_id,
       prompt = EXCLUDED.prompt,
       rewrite_result = EXCLUDED.rewrite_result,
       rewrite_changes = EXCLUDED.rewrite_changes,
       rewrite_warnings = EXCLUDED.rewrite_warnings,
       confidence_score = EXCLUDED.confidence_score`,
    [
      id,
      userId,
      patternId,
      rewrite.prompt ?? null,
      rewrite.rewrite_result,
      rewrite.rewrite_changes ?? [],
      rewrite.rewrite_warnings ?? [],
      rewrite.confidence_score ?? 0,
      asDate(rewrite.created_at),
    ],
  );

  return id;
}

async function upsertSettings(userId: string, settings: WordPressExportPayload['settings']) {
  if (!settings) return;

  const preferences = typeof settings.preferences === 'string'
    ? (() => {
        try {
          return JSON.parse(settings.preferences) as Record<string, unknown>;
        } catch {
          return {};
        }
      })()
    : settings.preferences ?? {};

  await query(
    `INSERT INTO user_settings (user_id, default_skill, measurement_unit, language, preferences, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       default_skill = EXCLUDED.default_skill,
       measurement_unit = EXCLUDED.measurement_unit,
       language = EXCLUDED.language,
       preferences = EXCLUDED.preferences,
       updated_at = NOW()`,
    [
      userId,
      settings.default_skill ?? 'beginner',
      settings.measurement_unit ?? 'metric',
      settings.language ?? 'uk',
      preferences,
    ],
  );
}

async function reconcileWordPressMirror(
  userId: string,
  importedPatternIds: Set<string>,
  importedChatIds: Set<string>,
  importedRewriteIds: Set<string>,
  destructive = false,
) {
  if (!destructive) {
    return;
  }
  const patternIds = [...importedPatternIds];
  const chatIds = [...importedChatIds];
  const rewriteIds = [...importedRewriteIds];
  const mirrorScope = `
    (
      source = 'wordpress_sync'
      OR COALESCE(metadata->>'wordpress_pattern_id', '') <> ''
      OR COALESCE(metadata->>'project_id', '') <> ''
      OR COALESCE(metadata->>'ravelry_id', '') <> ''
      OR lower(COALESCE(metadata->>'external_service', '')) = 'ravelry'
    )
  `;

  if (patternIds.length > 0) {
    await query(
      `UPDATE user_patterns
       SET deleted_at = NOW(),
           updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'wordpress_deleted_at', NOW(),
             'wordpress_tombstone_source', 'mirror_reconcile'
           )
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND ${mirrorScope}
         AND id <> ALL($2::uuid[])`,
      [userId, patternIds],
    );
  } else {
    await query(
      `UPDATE user_patterns
       SET deleted_at = NOW(),
           updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'wordpress_deleted_at', NOW(),
             'wordpress_tombstone_source', 'mirror_reconcile'
           )
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND ${mirrorScope}`,
      [userId],
    );
  }

  if (patternIds.length > 0) {
    await query(
      `WITH retired_patterns AS (
         SELECT id
         FROM user_patterns
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND ${mirrorScope}
           AND id <> ALL($2::uuid[])
       ),
       retired_projects AS (
         UPDATE projects
         SET deleted_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1
           AND deleted_at IS NULL
           AND pattern_id IN (SELECT id FROM retired_patterns)
         RETURNING id
       )
       UPDATE project_counters pc
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE pc.user_id = $1
         AND pc.deleted_at IS NULL
         AND pc.project_id IN (SELECT id FROM retired_projects)`,
      [userId, patternIds],
    );

    await query(
      `WITH retired_patterns AS (
         SELECT id
         FROM user_patterns
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND ${mirrorScope}
           AND id <> ALL($2::uuid[])
       )
       UPDATE project_work_log wl
       SET deleted_at = NOW()
       WHERE wl.user_id = $1
         AND wl.deleted_at IS NULL
         AND wl.project_id IN (
           SELECT id
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NOT NULL
             AND pattern_id IN (SELECT id FROM retired_patterns)
         )`,
      [userId, patternIds],
    );

    await query(
      `WITH retired_patterns AS (
         SELECT id
         FROM user_patterns
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND ${mirrorScope}
           AND id <> ALL($2::uuid[])
       ),
       retired_projects AS (
         SELECT id
         FROM projects
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND pattern_id IN (SELECT id FROM retired_patterns)
       )
       UPDATE project_photos pp
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE pp.user_id = $1
         AND pp.deleted_at IS NULL
         AND pp.project_id IN (SELECT id FROM retired_projects)`,
      [userId, patternIds],
    );

    await query(
      `WITH retired_patterns AS (
         SELECT id
         FROM user_patterns
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND ${mirrorScope}
           AND id <> ALL($2::uuid[])
       ),
       retired_projects AS (
         SELECT id
         FROM projects
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND pattern_id IN (SELECT id FROM retired_patterns)
       )
       UPDATE project_pattern_marks pm
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE pm.user_id = $1
         AND pm.deleted_at IS NULL
         AND pm.project_id IN (SELECT id FROM retired_projects)`,
      [userId, patternIds],
    );
  } else {
    await query(
      `WITH retired_patterns AS (
         SELECT id
         FROM user_patterns
         WHERE user_id = $1
           AND deleted_at IS NOT NULL
           AND ${mirrorScope}
       )
       UPDATE projects
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND pattern_id IN (SELECT id FROM retired_patterns)`,
      [userId],
    );

    await query(
      `UPDATE project_counters
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND project_id IN (
           SELECT id
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NOT NULL
         )`,
      [userId],
    );

    await query(
      `UPDATE project_work_log
       SET deleted_at = NOW()
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND project_id IN (
           SELECT id
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NOT NULL
         )`,
      [userId],
    );

    await query(
      `UPDATE project_photos
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND project_id IN (
           SELECT id
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NOT NULL
         )`,
      [userId],
    );

    await query(
      `UPDATE project_pattern_marks
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND project_id IN (
           SELECT id
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NOT NULL
         )`,
      [userId],
    );
  }

  if (chatIds.length > 0) {
    await query(
      `DELETE FROM chat_sessions
       WHERE user_id = $1
         AND id <> ALL($2::uuid[])`,
      [userId, chatIds],
    );
  } else {
    await query('DELETE FROM chat_sessions WHERE user_id = $1', [userId]);
  }

  if (rewriteIds.length > 0) {
    await query(
      `DELETE FROM rewrite_sessions
       WHERE user_id = $1
         AND id <> ALL($2::uuid[])`,
      [userId, rewriteIds],
    );
  } else {
    await query('DELETE FROM rewrite_sessions WHERE user_id = $1', [userId]);
  }
}

export async function syncWordPressLibraryForUser(userId: string) {
  if (!config.wordpress.sharedSecret) {
    return { synced: false, reason: 'wordpress_bridge_not_configured' as const };
  }

  const lockKey = `stitchsense:wordpress-sync:${userId}`;
  const lock = await query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [lockKey]);
  if (!lock.rows[0]?.locked) {
    return { synced: false, reason: 'sync_already_running' as const };
  }

  try {
  const linked = await linkedWordPressAccountForUser(userId);
  if (!linked) {
    return { synced: false, reason: 'no_linked_wordpress_account' as const };
  }

  let siteUrl: string;
  try {
    siteUrl = configuredWordPressSiteUrl();
  } catch {
    return { synced: false, reason: 'wordpress_bridge_not_configured' as const };
  }
  const wpUserId = String(linked.metadata.wpUserId ?? linked.provider_user_id.split('|')[1] ?? '').trim();
  if (!siteUrl || !wpUserId) {
    return { synced: false, reason: 'linked_account_missing_site_or_user' as const };
  }

  const payload = await fetchWordPressExport(siteUrl, wpUserId);
  const legacyWpUserId = payload.user?.legacy_wp_user_id ?? (Number(wpUserId) || null);
  const patterns = asArray(payload.patterns);
  const chats = asArray(payload.chat_sessions);
  const rewrites = asArray(payload.rewrite_sessions);
  const messagesBySession = normaliseMessagesBySession(payload);

  const patternMap = new Map<string, string>();
  const importedPatternIds = new Set<string>();
  for (const pattern of patterns) {
    const mapping = await upsertPattern(userId, legacyWpUserId, pattern);
    if (mapping.skipped) {
      continue;
    }
    patternMap.set(mapping.legacyId, mapping.importedId);
    importedPatternIds.add(mapping.importedId);
  }

  const chatMap = new Map<string, string>();
  const importedChatIds = new Set<string>();
  for (const chat of chats) {
    const mapping = await upsertChatSession(userId, chat, patternMap);
    if (!mapping) {
      continue;
    }
    chatMap.set(mapping.legacyId, mapping.importedId);
    importedChatIds.add(mapping.importedId);
  }

  for (const [legacySessionId, importedSessionId] of chatMap.entries()) {
    await replaceChatMessages(importedSessionId, messagesBySession.get(legacySessionId) ?? []);
  }

  let importedRewrites = 0;
  const importedRewriteIds = new Set<string>();
  for (const rewrite of rewrites) {
    const importedRewriteId = await upsertRewrite(userId, rewrite, patternMap);
    if (importedRewriteId) {
      importedRewrites += 1;
      importedRewriteIds.add(importedRewriteId);
    }
  }

  // WordPress and the platform are peers. Routine sync merges records from
  // either side; absence from one export is not proof that the user deleted it.
  // Explicit delete endpoints remain responsible for propagating deletions.
  await reconcileWordPressMirror(userId, importedPatternIds, importedChatIds, importedRewriteIds);

  await upsertSettings(userId, payload.settings ?? null);

  await query(
    `UPDATE linked_accounts
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lastWordpressSyncAt}', to_jsonb($2::text), true)
     WHERE user_id = $1
       AND provider = 'wordpress'`,
    [userId, new Date().toISOString()],
  );

  return {
    synced: true,
    patterns: patterns.length,
    chats: chats.length,
    rewrites: importedRewrites,
  };
  } finally {
    await query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
  }
}
