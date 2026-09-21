import { deleteStoredItem, getStoredItem, setStoredItem } from './secure-storage';
import { hasStructuredSummary, readString } from './pattern-content-readiness';

import type { Pattern, WordPressSyncStatus } from '@/src/lib/models';

const CACHE_KEY_PREFIX = 'stitchsense-library-cache-';
const MAX_PATTERNS = 40;
const MAX_SECURESTORE_BYTES = 1800;
const READINESS_SENTINEL = '1';

type LibraryCacheSnapshot = {
  patterns: Pattern[];
  lastSyncedAt: string | null;
  syncStatus: WordPressSyncStatus | null;
  cachedAt: string;
};

function cacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

function isUsableUserId(userId: string) {
  return typeof userId === 'string' && userId.trim().length > 0;
}

function byteSize(value: string) {
  return new TextEncoder().encode(value).length;
}

function normalizeCachedPattern(pattern: Pattern): Pattern {
  const thumbnailUrl =
    typeof pattern.thumbnailUrl === 'string' && /^data:image\//i.test(pattern.thumbnailUrl)
      ? null
      : pattern.thumbnailUrl ?? null;
  const metadataThumbnail =
    typeof pattern.metadata?.thumbnail_url === 'string' && /^data:image\//i.test(pattern.metadata.thumbnail_url)
      ? null
      : pattern.metadata?.thumbnail_url ?? null;
  const metadata = pattern.metadata ?? {};
  const hasSummarySignal = Boolean(
    readString(pattern.patternSummaryText) ||
      readString(pattern.patternSummaryHtml) ||
      readString(metadata.summary_excerpt),
  );

  return {
    id: pattern.id,
    title: pattern.title,
    thumbnailUrl,
    craftType: pattern.craftType ?? null,
    originalFilename: pattern.originalFilename ?? null,
    fileUrl: pattern.fileUrl ?? null,
    fileKey: pattern.fileKey ?? null,
    fileId: pattern.fileId ?? null,
    jobId: pattern.jobId ?? null,
    fileMimeType: pattern.fileMimeType ?? null,
    fileSize: pattern.fileSize ?? null,
    sourceUrl: pattern.sourceUrl ?? null,
    patternSummaryText: null,
    patternSummaryHtml: null,
    patternSummaryStructured: hasStructuredSummary(pattern.patternSummaryStructured)
      ? { cached_readiness_signal: true }
      : null,
    metadata: {
      ravelry_id: metadata.ravelry_id ?? null,
      thumbnail_url: metadataThumbnail,
      stored_pdf_url: readString(metadata.stored_pdf_url) ? READINESS_SENTINEL : null,
      extracted_text: readString(metadata.extracted_text) ? READINESS_SENTINEL : null,
      summary_excerpt: hasSummarySignal ? READINESS_SENTINEL : null,
      pdf_url: readString(metadata.pdf_url) ? READINESS_SENTINEL : null,
      ravelry_availability: metadata.ravelry_availability ?? null,
      ravelry_is_free: metadata.ravelry_is_free ?? null,
    },
    source: pattern.source,
    isArchived: pattern.isArchived ?? false,
    updatedAt: pattern.updatedAt ?? null,
    createdAt: pattern.createdAt ?? null,
    activityCounts: pattern.activityCounts
      ? {
          chats: pattern.activityCounts.chats,
          rewrites: pattern.activityCounts.rewrites,
        }
      : { chats: 0, rewrites: 0 },
  };
}

export async function loadLibraryCache(userId: string) {
  if (!isUsableUserId(userId)) {
    return null;
  }
  const saved = await getStoredItem(cacheKey(userId));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as LibraryCacheSnapshot;
  } catch {
    await deleteStoredItem(cacheKey(userId));
    return null;
  }
}

export async function saveLibraryCache(
  userId: string,
  snapshot: {
    patterns: Pattern[];
    lastSyncedAt: string | null;
    syncStatus: WordPressSyncStatus | null;
  },
) {
  if (!isUsableUserId(userId)) {
    return;
  }

  let cachedPatterns = snapshot.patterns.slice(0, MAX_PATTERNS).map(normalizeCachedPattern);
  let serialized = '';

  while (cachedPatterns.length >= 0) {
    const payload: LibraryCacheSnapshot = {
      patterns: cachedPatterns,
      lastSyncedAt: snapshot.lastSyncedAt,
      syncStatus: snapshot.syncStatus,
      cachedAt: new Date().toISOString(),
    };

    serialized = JSON.stringify(payload);
    if (byteSize(serialized) <= MAX_SECURESTORE_BYTES || cachedPatterns.length === 0) {
      break;
    }

    cachedPatterns = cachedPatterns.slice(0, -1);
  }

  if (byteSize(serialized) > MAX_SECURESTORE_BYTES) {
    await deleteStoredItem(cacheKey(userId));
    return;
  }

  await setStoredItem(cacheKey(userId), serialized);
}

export async function clearLibraryCache(userId: string) {
  if (!isUsableUserId(userId)) {
    return;
  }
  await deleteStoredItem(cacheKey(userId));
}
