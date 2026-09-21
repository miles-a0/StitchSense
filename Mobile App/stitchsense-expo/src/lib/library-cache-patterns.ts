import { hasStructuredSummary, readString } from './pattern-content-readiness';

import type { Pattern } from '@/src/lib/models';

const READINESS_SENTINEL = '1';

export function normalizeCachedPattern(pattern: Pattern): Pattern {
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
