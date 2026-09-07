import { config } from '@/src/lib/config';
import { clearTokens, loadTokens, saveTokens } from '@/src/lib/token-store';
import type {
  APIErrorShape,
  AuthResponse,
  BillingCheckoutResponse,
  BillingPortalResponse,
  ChatMessagesResponse,
  CreateChatResponse,
  Project,
  ProjectCounter,
  ProjectCounterResponse,
  ProjectCountersResponse,
  ProjectPatternMark,
  ProjectPatternMarkResponse,
  ProjectPatternMarksResponse,
  ProjectPhoto,
  ProjectPhotoResponse,
  ProjectPhotosResponse,
  ProjectResponse,
  PromotionsResponse,
  ProjectWorkLogEntry,
  ProjectWorkLogEntryResponse,
  ProjectWorkLogResponse,
  ProjectsResponse,
  CreateRewriteResponse,
  DeleteDataResponse,
  EntitlementResponse,
  MeResponse,
  Pattern,
  PatternFileResponse,
  PatternChatsResponse,
  PatternRewritesResponse,
  RavelryImportResponse,
  RavelryPatternResponse,
  RavelrySearchResponse,
  RavelryStatusResponse,
  SendChatMessageResponse,
  SyncValidationResponse,
  SyncStatusResponse,
  UserExportResponse,
  UserSettingsResponse,
  VisionAnalyseResponse,
  WordPressPendingSyncResponse,
  WordPressSyncRunResponse,
} from '@/src/lib/models';
import type { StashCategory, StashItem } from '@/src/lib/stash-store';

class APIError extends Error {
  statusCode: number;

  constructor({ statusCode, message }: APIErrorShape) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string | null;
  body?: unknown;
  retryOnAuthFailure?: boolean;
  timeoutMs?: number;
};

let refreshInFlight: Promise<string | null> | null = null;
const CLIENT_SURFACE = 'expo-mobile';
const DEFAULT_TIMEOUT_MS = 30000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError({ statusCode: 408, message: 'The server took too long to respond. Please try again.' });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse<T>(response: Response, fallback = 'Server returned an unexpected response.'): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new APIError({ statusCode: response.status || 502, message: fallback });
  }
}

function normalizeUser<T extends { id: string; email: string; role: string } & Record<string, unknown>>(user: T) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: (user.displayName as string | null | undefined) ?? (user.display_name as string | null | undefined) ?? null,
  };
}

function normalizePattern(pattern: Record<string, unknown>): Pattern {
  const metadata = (pattern.metadata as Record<string, unknown> | undefined) ?? {};
  const fileMimeType =
    (pattern.fileMimeType as string | null | undefined) ??
    (pattern.file_mime_type as string | null | undefined) ??
    null;
  const originalFilename =
    (pattern.originalFilename as string | null | undefined) ??
    (pattern.original_filename as string | null | undefined) ??
    null;
  const explicitThumbnail =
    (pattern.thumbnailUrl as string | null | undefined) ??
    (pattern.thumbnail_url as string | null | undefined) ??
    (metadata.thumbnail_url as string | null | undefined) ??
    (metadata.thumbnailUrl as string | null | undefined) ??
    null;

  return {
    id: String(pattern.id ?? ''),
    title: String(pattern.title ?? 'Untitled'),
    thumbnailUrl: explicitThumbnail,
    craftType: (pattern.craftType as string | null | undefined) ?? (pattern.craft_type as string | null | undefined) ?? null,
    originalFilename,
    fileUrl: (pattern.fileUrl as string | null | undefined) ?? (pattern.file_url as string | null | undefined) ?? null,
    fileKey: (pattern.fileKey as string | null | undefined) ?? (pattern.file_key as string | null | undefined) ?? null,
    fileMimeType,
    fileSize:
      (pattern.fileSize as number | null | undefined) ??
      (pattern.file_size as number | null | undefined) ??
      null,
    sourceUrl:
      (pattern.sourceUrl as string | null | undefined) ??
      (pattern.source_url as string | null | undefined) ??
      null,
    patternSummaryText:
      (pattern.patternSummaryText as string | null | undefined) ??
      (pattern.pattern_summary_text as string | null | undefined) ??
      null,
    patternSummaryHtml:
      (pattern.patternSummaryHtml as string | null | undefined) ??
      (pattern.pattern_summary_html as string | null | undefined) ??
      null,
    metadata,
    source: String(pattern.source ?? 'upload'),
    isArchived:
      (pattern.isArchived as boolean | undefined) ??
      (pattern.is_archived as boolean | undefined) ??
      false,
    createdAt:
      (pattern.createdAt as string | null | undefined) ??
      (pattern.created_at as string | null | undefined) ??
      null,
    updatedAt:
      (pattern.updatedAt as string | null | undefined) ??
      (pattern.updated_at as string | null | undefined) ??
      null,
  };
}

function normalizeChatSession(session: Record<string, unknown>) {
  return {
    id: String(session.id ?? ''),
    userId: String(session.userId ?? session.user_id ?? ''),
    patternId:
      (session.patternId as string | null | undefined) ??
      (session.pattern_id as string | null | undefined) ??
      null,
    title: String(session.title ?? 'Untitled chat'),
    skillLevel:
      (session.skillLevel as string | null | undefined) ??
      (session.skill_level as string | null | undefined) ??
      null,
    createdAt:
      (session.createdAt as string | null | undefined) ??
      (session.created_at as string | null | undefined) ??
      null,
    updatedAt:
      (session.updatedAt as string | null | undefined) ??
      (session.updated_at as string | null | undefined) ??
      null,
  };
}

function normalizeChatMessage(message: Record<string, unknown>) {
  return {
    id: Number(message.id ?? 0),
    sessionId:
      (message.sessionId as string | null | undefined) ??
      (message.session_id as string | null | undefined) ??
      null,
    role: String(message.role ?? 'assistant'),
    content: String(message.content ?? ''),
    kind: (message.kind as string | null | undefined) ?? null,
    toolMode:
      (message.toolMode as string | null | undefined) ??
      (message.tool_mode as string | null | undefined) ??
      null,
    metadata:
      (message.metadata as Record<string, unknown> | null | undefined) ??
      null,
    createdAt:
      (message.createdAt as string | null | undefined) ??
      (message.created_at as string | null | undefined) ??
      null,
  };
}

function normalizeRewrite(rewrite: Record<string, unknown>) {
  return {
    id: String(rewrite.id ?? ''),
    userId: String(rewrite.userId ?? rewrite.user_id ?? ''),
    patternId: String(rewrite.patternId ?? rewrite.pattern_id ?? ''),
    prompt: (rewrite.prompt as string | null | undefined) ?? null,
    rewriteResult:
      (rewrite.rewriteResult as string | undefined) ??
      (rewrite.rewrite_result as string | undefined) ??
      '',
    rewriteChanges:
      (rewrite.rewriteChanges as unknown[] | null | undefined) ??
      (rewrite.rewrite_changes as unknown[] | null | undefined) ??
      null,
    rewriteWarnings:
      (rewrite.rewriteWarnings as unknown[] | null | undefined) ??
      (rewrite.rewrite_warnings as unknown[] | null | undefined) ??
      null,
    confidenceScore:
      (rewrite.confidenceScore as number | null | undefined) ??
      (rewrite.confidence_score as number | null | undefined) ??
      null,
    createdAt:
      (rewrite.createdAt as string | null | undefined) ??
      (rewrite.created_at as string | null | undefined) ??
      null,
  };
}

function normalizeProject(project: Record<string, unknown> | null | undefined): Project {
  const record = project ?? {};
  const linkedPatternId =
    (record.patternId as string | undefined) ??
    (record.pattern_id as string | undefined) ??
    '';

  const linkedPatternThumbnail =
    (record.linkedPatternThumbnailUrl as string | null | undefined) ??
    (record.linked_pattern_thumbnail_url as string | null | undefined) ??
    null;
  const linkedPatternFileMimeType =
    (record.linkedPatternFileMimeType as string | null | undefined) ??
    (record.linked_pattern_file_mime_type as string | null | undefined) ??
    null;
  const linkedPatternOriginalFilename =
    (record.linkedPatternOriginalFilename as string | null | undefined) ??
    (record.linked_pattern_original_filename as string | null | undefined) ??
    null;
  const linkedPatternUpdatedAt =
    (record.linkedPatternUpdatedAt as string | null | undefined) ??
    (record.linked_pattern_updated_at as string | null | undefined) ??
    null;
  const linkedPatternIsPdf =
    (linkedPatternFileMimeType ?? '').toLowerCase().includes('pdf') ||
    /\.pdf$/i.test(linkedPatternOriginalFilename ?? '');

  return {
    id: String(record.id ?? ''),
    userId: String(record.userId ?? record.user_id ?? ''),
    patternId: String(linkedPatternId),
    title: String(record.title ?? 'Untitled project'),
    craftType:
      (record.craftType as string | null | undefined) ??
      (record.craft_type as string | null | undefined) ??
      null,
    status: String(record.status ?? 'active') as Project['status'],
    stageLabel:
      (record.stageLabel as string | undefined) ??
      (record.stage_label as string | undefined) ??
      'Getting started',
    progressMode:
      ((record.progressMode as string | undefined) ??
        (record.progress_mode as string | undefined) ??
        'percent') as Project['progressMode'],
    progressValue:
      (record.progressValue as number | null | undefined) ??
      (record.progress_value as number | null | undefined) ??
      null,
    progressPercent: Number(record.progressPercent ?? record.progress_percent ?? 0),
    recipient:
      (record.recipient as string | null | undefined) ??
      null,
    isGift: Boolean(record.isGift ?? record.is_gift ?? false),
    occasion:
      (record.occasion as string | null | undefined) ??
      null,
    deadlineAt:
      (record.deadlineAt as string | null | undefined) ??
      (record.deadline_at as string | null | undefined) ??
      null,
    notes:
      (record.notes as string | null | undefined) ??
      null,
    yarnDetails:
      (record.yarnDetails as string | null | undefined) ??
      (record.yarn_details as string | null | undefined) ??
      null,
    needleHookDetails:
      (record.needleHookDetails as string | null | undefined) ??
      (record.needle_hook_details as string | null | undefined) ??
      null,
    coverImageUrl:
      (record.coverImageUrl as string | null | undefined) ??
      (record.cover_image_url as string | null | undefined) ??
      (record.latestPhotoUrl as string | null | undefined) ??
      (record.latest_photo_url as string | null | undefined) ??
      null,
    latestPhotoId:
      (record.latestPhotoId as string | null | undefined) ??
      (record.latest_photo_id as string | null | undefined) ??
      null,
    latestPhotoUrl:
      (record.latestPhotoUrl as string | null | undefined) ??
      (record.latest_photo_url as string | null | undefined) ??
      null,
    latestPhotoTakenAt:
      (record.latestPhotoTakenAt as string | null | undefined) ??
      (record.latest_photo_taken_at as string | null | undefined) ??
      null,
    isFavorite: Boolean(record.isFavorite ?? record.is_favorite ?? false),
    lastWorkedAt:
      (record.lastWorkedAt as string | null | undefined) ??
      (record.last_worked_at as string | null | undefined) ??
      null,
    completedAt:
      (record.completedAt as string | null | undefined) ??
      (record.completed_at as string | null | undefined) ??
      null,
    createdAt:
      (record.createdAt as string | null | undefined) ??
      (record.created_at as string | null | undefined) ??
      null,
    updatedAt:
      (record.updatedAt as string | null | undefined) ??
      (record.updated_at as string | null | undefined) ??
      null,
    linkedPattern: linkedPatternId
      ? {
          id: String(linkedPatternId),
          title:
            String(
              record.linkedPatternTitle ??
                record.linked_pattern_title ??
                'Pattern',
            ),
          craftType:
            (record.linkedPatternCraftType as string | null | undefined) ??
            (record.linked_pattern_craft_type as string | null | undefined) ??
            null,
          originalFilename:
            linkedPatternOriginalFilename,
          fileMimeType:
            linkedPatternFileMimeType,
          source:
            (record.linkedPatternSource as string | null | undefined) ??
            (record.linked_pattern_source as string | null | undefined) ??
            null,
          updatedAt:
            linkedPatternUpdatedAt,
          thumbnailUrl:
            linkedPatternThumbnail ??
            (linkedPatternIsPdf
              ? buildPatternThumbnailUrl(linkedPatternId, null, linkedPatternUpdatedAt)
              : null),
        }
      : null,
    topCounter:
      record.topCounterLabel ?? record.top_counter_label
        ? {
            label: String(record.topCounterLabel ?? record.top_counter_label ?? 'Counter'),
            counterType:
              (record.topCounterType as string | null | undefined) ??
              (record.top_counter_type as string | null | undefined) ??
              null,
            currentValue: Number(
              record.topCounterCurrentValue ?? record.top_counter_current_value ?? 0,
            ),
            targetValue:
              (record.topCounterTargetValue as number | null | undefined) ??
              (record.top_counter_target_value as number | null | undefined) ??
              null,
          }
        : null,
    latestWorkLog:
      record.latestLogTitle ?? record.latest_log_title
        ? {
            title: String(record.latestLogTitle ?? record.latest_log_title ?? 'Update'),
            body:
              (record.latestLogBody as string | null | undefined) ??
              (record.latest_log_body as string | null | undefined) ??
              null,
            createdAt:
              (record.latestLogCreatedAt as string | null | undefined) ??
              (record.latest_log_created_at as string | null | undefined) ??
              null,
          }
        : null,
  };
}

function normalizeProjectPhoto(photo: Record<string, unknown>): ProjectPhoto {
  return {
    id: String(photo.id ?? ''),
    projectId: String(photo.projectId ?? photo.project_id ?? ''),
    userId: String(photo.userId ?? photo.user_id ?? ''),
    photoUrl: String(photo.photoUrl ?? photo.photo_url ?? ''),
    fileMimeType:
      (photo.fileMimeType as string | null | undefined) ??
      (photo.file_mime_type as string | null | undefined) ??
      null,
    fileSize:
      (photo.fileSize as number | null | undefined) ??
      (photo.file_size as number | null | undefined) ??
      null,
    caption:
      (photo.caption as string | null | undefined) ??
      null,
    takenAt:
      (photo.takenAt as string | null | undefined) ??
      (photo.taken_at as string | null | undefined) ??
      null,
    createdAt:
      (photo.createdAt as string | null | undefined) ??
      (photo.created_at as string | null | undefined) ??
      null,
    updatedAt:
      (photo.updatedAt as string | null | undefined) ??
      (photo.updated_at as string | null | undefined) ??
      null,
  };
}

function buildProjectPhotoUrl(projectId: string, photoId: string) {
  return `${config.apiBaseUrl}/projects/${encodeURIComponent(projectId)}/photos/${encodeURIComponent(photoId)}/file`;
}

function attachProtectedProjectMedia(project: Project): Project {
  if (!project.latestPhotoId) {
    return project;
  }

  const photoUrl = project.latestPhotoUrl ?? buildProjectPhotoUrl(project.id, project.latestPhotoId);
  return {
    ...project,
    latestPhotoUrl: photoUrl,
    coverImageUrl: photoUrl,
  };
}

function attachProtectedProjectPhoto(photo: ProjectPhoto): ProjectPhoto {
  if (!photo.projectId || !photo.id) {
    return photo;
  }

  return {
    ...photo,
    photoUrl: photo.photoUrl || buildProjectPhotoUrl(photo.projectId, photo.id),
  };
}

function buildStashImageUrl(itemId: string) {
  return `${config.apiBaseUrl}/stash/${encodeURIComponent(itemId)}/image`;
}

function normalizeStashItem(item: Record<string, unknown>, token?: string | null): StashItem {
  const id = String(item.id ?? '');
  const imageUrl =
    (item.imageUrl as string | null | undefined) ??
    (item.image_url as string | null | undefined) ??
    null;
  return {
    id,
    category: String(item.category ?? 'yarn') as StashCategory,
    name: String(item.name ?? ''),
    quantity: (item.quantity as string | null | undefined) ?? undefined,
    unit: (item.unit as string | null | undefined) ?? undefined,
    brand: (item.brand as string | null | undefined) ?? undefined,
    yarnWeight:
      (item.yarnWeight as string | null | undefined) ??
      (item.yarn_weight as string | null | undefined) ??
      undefined,
    fibre: (item.fibre as string | null | undefined) ?? undefined,
    colour: (item.colour as string | null | undefined) ?? undefined,
    dyeLot:
      (item.dyeLot as string | null | undefined) ??
      (item.dye_lot as string | null | undefined) ??
      undefined,
    size: (item.size as string | null | undefined) ?? undefined,
    material: (item.material as string | null | undefined) ?? undefined,
    location: (item.location as string | null | undefined) ?? undefined,
    reservedFor:
      (item.reservedFor as string | null | undefined) ??
      (item.reserved_for as string | null | undefined) ??
      undefined,
    notes: (item.notes as string | null | undefined) ?? undefined,
    imageUri: imageUrl ?? (token && id ? buildStashImageUrl(id) : undefined),
    createdAt:
      (item.createdAt as string | null | undefined) ??
      (item.created_at as string | null | undefined) ??
      new Date().toISOString(),
    updatedAt:
      (item.updatedAt as string | null | undefined) ??
      (item.updated_at as string | null | undefined) ??
      new Date().toISOString(),
  };
}

function normalizeProjectPatternMark(mark: Record<string, unknown>): ProjectPatternMark {
  return {
    id: String(mark.id ?? ''),
    projectId: String(mark.projectId ?? mark.project_id ?? ''),
    userId: String(mark.userId ?? mark.user_id ?? ''),
    patternId: String(mark.patternId ?? mark.pattern_id ?? ''),
    type: String(mark.type ?? mark.mark_type ?? 'bookmark') as ProjectPatternMark['type'],
    label: String(mark.label ?? 'Pattern note'),
    pageNumber:
      (mark.pageNumber as number | null | undefined) ??
      (mark.page_number as number | null | undefined) ??
      null,
    locationLabel:
      (mark.locationLabel as string | null | undefined) ??
      (mark.location_label as string | null | undefined) ??
      null,
    note:
      (mark.note as string | null | undefined) ??
      null,
    sortOrder: Number(mark.sortOrder ?? mark.sort_order ?? 0),
    createdAt:
      (mark.createdAt as string | null | undefined) ??
      (mark.created_at as string | null | undefined) ??
      null,
    updatedAt:
      (mark.updatedAt as string | null | undefined) ??
      (mark.updated_at as string | null | undefined) ??
      null,
  };
}

function extractProjectRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { project?: Record<string, unknown> };
    if (wrapped.project && typeof wrapped.project === 'object') {
      return wrapped.project;
    }
    return payload as Record<string, unknown>;
  }

  return {};
}

function extractCounterRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { counter?: Record<string, unknown> };
    if (wrapped.counter && typeof wrapped.counter === 'object') {
      return wrapped.counter;
    }
    return payload as Record<string, unknown>;
  }

  return {};
}

function extractCounterList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { counters?: unknown[] };
    if (Array.isArray(wrapped.counters)) {
      return wrapped.counters.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      );
    }
  }
  return [];
}

function extractProjectMarkRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { mark?: Record<string, unknown> };
    if (wrapped.mark && typeof wrapped.mark === 'object') {
      return wrapped.mark;
    }
    return payload as Record<string, unknown>;
  }

  return {};
}

function extractProjectMarkList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { marks?: unknown[] };
    if (Array.isArray(wrapped.marks)) {
      return wrapped.marks.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      );
    }
  }
  return [];
}

function extractWorkLogEntryRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { entry?: Record<string, unknown> };
    if (wrapped.entry && typeof wrapped.entry === 'object') {
      return wrapped.entry;
    }
    return payload as Record<string, unknown>;
  }

  return {};
}

function extractWorkLogEntries(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (payload && typeof payload === 'object') {
    const wrapped = payload as { entries?: unknown[] };
    if (Array.isArray(wrapped.entries)) {
      return wrapped.entries.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      );
    }
  }
  return [];
}

function isMissingProjectFeature(error: unknown) {
  return (
    error instanceof APIError &&
    error.statusCode === 404 &&
    /route .*not found/i.test(error.message)
  );
}

function normalizeProjectCounter(counter: Record<string, unknown>): ProjectCounter {
  return {
    id: String(counter.id ?? ''),
    projectId: String(counter.projectId ?? counter.project_id ?? ''),
    userId: String(counter.userId ?? counter.user_id ?? ''),
    label: String(counter.label ?? 'Counter'),
    counterType: String(counter.counterType ?? counter.counter_type ?? 'custom') as ProjectCounter['counterType'],
    currentValue: Number(counter.currentValue ?? counter.current_value ?? 0),
    targetValue:
      (counter.targetValue as number | null | undefined) ??
      (counter.target_value as number | null | undefined) ??
      null,
    stepValue: Number(counter.stepValue ?? counter.step_value ?? 1),
    sortOrder: Number(counter.sortOrder ?? counter.sort_order ?? 0),
    notes:
      (counter.notes as string | null | undefined) ??
      null,
    createdAt:
      (counter.createdAt as string | null | undefined) ??
      (counter.created_at as string | null | undefined) ??
      null,
    updatedAt:
      (counter.updatedAt as string | null | undefined) ??
      (counter.updated_at as string | null | undefined) ??
      null,
  };
}

function normalizeProjectWorkLogEntry(entry: Record<string, unknown>): ProjectWorkLogEntry {
  return {
    id: String(entry.id ?? ''),
    projectId: String(entry.projectId ?? entry.project_id ?? ''),
    userId: String(entry.userId ?? entry.user_id ?? ''),
    entryType: String(entry.entryType ?? entry.entry_type ?? 'note') as ProjectWorkLogEntry['entryType'],
    title: String(entry.title ?? 'Update'),
    body:
      (entry.body as string | null | undefined) ??
      null,
    progressPercent:
      (entry.progressPercent as number | null | undefined) ??
      (entry.progress_percent as number | null | undefined) ??
      null,
    minutesSpent:
      (entry.minutesSpent as number | null | undefined) ??
      (entry.minutes_spent as number | null | undefined) ??
      null,
    createdAt:
      (entry.createdAt as string | null | undefined) ??
      (entry.created_at as string | null | undefined) ??
      null,
  };
}

function normalizeSyncStatus(status: Record<string, unknown>) {
  const counts = (status.counts as Record<string, unknown> | undefined) ?? {};
  return {
    configured: Boolean(status.configured),
    linked: Boolean(status.linked),
    siteUrl: (status.siteUrl as string | null | undefined) ?? (status.site_url as string | null | undefined) ?? null,
    wpUserId: (status.wpUserId as string | null | undefined) ?? (status.wp_user_id as string | null | undefined) ?? null,
    lastWordpressSyncAt:
      (status.lastWordpressSyncAt as string | null | undefined) ??
      (status.last_wordpress_sync_at as string | null | undefined) ??
      null,
    counts: {
      patterns: Number(counts.patterns ?? 0),
      chats: Number(counts.chats ?? 0),
      rewrites: Number(counts.rewrites ?? 0),
    },
  };
}

function normalizePendingSyncStatus(status: Record<string, unknown>) {
  const counts = (status.counts as Record<string, unknown> | undefined) ?? {};
  return {
    available: Boolean(status.available),
    reason: (status.reason as string | null | undefined) ?? null,
    siteUrl: (status.siteUrl as string | null | undefined) ?? (status.site_url as string | null | undefined) ?? null,
    wpUserId: (status.wpUserId as string | null | undefined) ?? (status.wp_user_id as string | null | undefined) ?? null,
    checkedAt:
      (status.checkedAt as string | null | undefined) ??
      (status.checked_at as string | null | undefined) ??
      null,
    hasPending: Boolean(status.hasPending ?? status.has_pending),
    counts: {
      patterns: Number(counts.patterns ?? 0),
      chats: Number(counts.chats ?? 0),
      rewrites: Number(counts.rewrites ?? 0),
    },
  };
}

function normalizeRavelryPattern(pattern: Record<string, unknown>) {
  return {
    id: String(pattern.id ?? ''),
    title: String(pattern.title ?? pattern.name ?? 'Untitled Ravelry pattern'),
    designer: (pattern.designer as string | undefined) ?? '',
    craftType:
      (pattern.craftType as string | undefined) ??
      (pattern.craft_type as string | undefined) ??
      '',
    thumbnailUrl:
      (pattern.thumbnailUrl as string | undefined) ??
      (pattern.thumbnail_url as string | undefined) ??
      '',
    url: (pattern.url as string | undefined) ?? '',
    pdfUrl: (pattern.pdfUrl as string | undefined) ?? (pattern.pdf_url as string | undefined) ?? '',
    availability: (pattern.availability as string | undefined) ?? '',
    isFree:
      (pattern.isFree as boolean | undefined) ??
      (pattern.is_free as boolean | undefined) ??
      false,
    price: (pattern.price as string | undefined) ?? '',
    currency: (pattern.currency as string | undefined) ?? '',
    priceDescription:
      (pattern.priceDescription as string | undefined) ??
      (pattern.price_description as string | undefined) ??
      '',
    notes: (pattern.notes as string | undefined) ?? '',
    yardage: (pattern.yardage as string | undefined) ?? '',
    gauge: (pattern.gauge as string | undefined) ?? '',
    sizes: (pattern.sizes as string | undefined) ?? '',
    raw: (pattern.raw as Record<string, unknown> | undefined) ?? pattern,
  };
}

async function performRequest(path: string, options: RequestOptions = {}, tokenOverride?: string | null) {
  return fetchWithTimeout(`${config.apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    timeoutMs: options.timeoutMs,
    headers: {
      accept: 'application/json',
      'x-stitchsense-client-surface': CLIENT_SURFACE,
      ...(tokenOverride ?? options.token
        ? { authorization: `Bearer ${tokenOverride ?? options.token}` }
        : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const { refreshToken } = await loadTokens();
      if (!refreshToken) {
        await clearTokens();
        return null;
      }

      const response = await performRequest('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        retryOnAuthFailure: false,
      });

      if (!response.ok) {
        await clearTokens();
        return null;
      }

      const payload = await readJsonResponse<AuthResponse>(response, 'Could not refresh your session.');
      await saveTokens(payload.accessToken, payload.refreshToken);
      return payload.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options);

  if (
    response.status === 401 &&
    options.token &&
    path !== '/auth/refresh' &&
    options.retryOnAuthFailure !== false
  ) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      return request<T>(path, {
        ...options,
        token: refreshedToken,
        retryOnAuthFailure: false,
      });
    }
  }

  if (!response.ok) {
    let message = `Server returned ${response.status}.`;
    try {
      const payload = await response.json();
      const detail =
        payload?.message ?? payload?.error ?? payload?.details ?? payload?.code ?? message;
      if (typeof detail === 'string' && detail.trim().length > 0) {
        message = detail;
      }
    } catch {
      const text = await response.text();
      if (text.trim().length > 0) {
        message = text.trim();
      }
    }
    throw new APIError({ statusCode: response.status, message });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return readJsonResponse<T>(response);
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined),
  ) as T;
}

export const stitchSenseAPI = {
  requestPasswordReset(email: string) {
    return request<{ message: string }>('/auth/password-reset/request', {
      method: 'POST',
      body: { email },
    });
  },
  confirmPasswordReset(body: { email: string; code: string; password: string }) {
    return request<{ message: string }>('/auth/password-reset/confirm', {
      method: 'POST',
      body,
    });
  },
  async signIn(email: string, password: string) {
    const response = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    return { ...response, user: normalizeUser(response.user) };
  },
  async signUp(body: { email: string; password: string; displayName?: string }) {
    const response = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body,
    });
    return { ...response, user: normalizeUser(response.user) };
  },
  async signInWithWordPress(identifier: string, password: string) {
    const response = await request<AuthResponse>('/auth/wordpress-login', {
      method: 'POST',
      body: {
        siteUrl: config.wordpressBaseUrl,
        identifier,
        password,
      },
    });
    return { ...response, user: normalizeUser(response.user) };
  },
  async signUpWithWordPress(body: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) {
    const response = await request<AuthResponse>('/auth/wordpress-register', {
      method: 'POST',
      body: {
        siteUrl: config.wordpressBaseUrl,
        ...body,
      },
    });
    return { ...response, user: normalizeUser(response.user) };
  },
  async refresh(refreshToken: string) {
    const response = await request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    });
    return { ...response, user: normalizeUser(response.user) };
  },
  logout(refreshToken: string) {
    return request<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    });
  },
  async me(token: string) {
    const response = await request<MeResponse>('/me', { token });
    return { user: normalizeUser(response.user) };
  },
  entitlement(token: string) {
    return request<EntitlementResponse>('/me/entitlements', { token });
  },
  userSettings(token: string) {
    return request<UserSettingsResponse>('/user/settings', { token });
  },
  saveUserSettings(
    token: string,
    body: {
      defaultSkill: string;
      measurementUnit: string;
      language: string;
      preferences?: Record<string, unknown>;
    },
  ) {
    return request<UserSettingsResponse>('/user/settings', {
      method: 'PUT',
      token,
      body,
    });
  },
  userExport(token: string) {
    return request<UserExportResponse>('/user/export', { token });
  },
  deleteUserData(token: string) {
    return request<DeleteDataResponse>('/user/delete-data', {
      method: 'POST',
      token,
      body: { confirm: 'DELETE' },
    });
  },
  async syncStatus(token: string) {
    const response = await request<SyncStatusResponse>('/sync/wordpress/status', { token });
    return normalizeSyncStatus(response as unknown as Record<string, unknown>);
  },
  async pendingWordPressSync(token: string) {
    const response = await request<WordPressPendingSyncResponse>('/sync/wordpress/pending', { token });
    return normalizePendingSyncStatus(response as unknown as Record<string, unknown>);
  },
  syncValidation(token: string) {
    return request<SyncValidationResponse>('/sync/validation', { token });
  },
  syncWordPress(token: string) {
    return request<WordPressSyncRunResponse>('/sync/wordpress', {
      method: 'POST',
      token,
    });
  },
  createCheckout(
    token: string,
    body: {
      plan: 'monthly' | 'annual';
      successUrl: string;
      cancelUrl: string;
      promoCode?: string | null;
      couponId?: string | null;
      promotionCodeId?: string | null;
      allowPromotionCodes?: boolean;
    },
  ) {
    return request<BillingCheckoutResponse>('/billing/checkout', {
      method: 'POST',
      token,
      body,
    });
  },
  createBillingPortal(token: string, body: { returnUrl: string }) {
    return request<BillingPortalResponse>('/billing/portal', {
      method: 'POST',
      token,
      body,
    });
  },
  promotions(token: string) {
    return request<PromotionsResponse>('/promotions/active', { token });
  },
  async patterns(token: string) {
    const payload = await request<Pattern[] | { patterns: Pattern[] }>('/patterns', { token });
    const patterns = Array.isArray(payload) ? payload : payload.patterns;
    return patterns.map((pattern) => normalizePattern(pattern as unknown as Record<string, unknown>));
  },
  async projects(
    token: string,
    params?: {
      search?: string;
      status?: string;
      patternId?: string;
    },
  ) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.patternId) searchParams.set('patternId', params.patternId);
    const queryString = searchParams.toString();
    const payload = await request<ProjectsResponse>(`/projects${queryString ? `?${queryString}` : ''}`, { token });
    return payload.projects.map((project) =>
      attachProtectedProjectMedia(normalizeProject(project as unknown as Record<string, unknown>)),
    );
  },
  async project(id: string, token: string) {
    const payload = await request<ProjectResponse | Record<string, unknown>>(`/projects/${id}`, { token });
    return attachProtectedProjectMedia(normalizeProject(extractProjectRecord(payload)));
  },
  async createProject(
    token: string,
    body: {
      patternId: string;
      title?: string;
      craftType?: string | null;
      status?: string;
      stageLabel?: string;
      progressMode?: string;
      progressValue?: number | null;
      progressPercent?: number;
      recipient?: string | null;
      isGift?: boolean;
      occasion?: string | null;
      deadlineAt?: string | null;
      notes?: string | null;
      yarnDetails?: string | null;
      needleHookDetails?: string | null;
      coverImageUrl?: string | null;
      isFavorite?: boolean;
    },
  ) {
    const payload = await request<ProjectResponse | Record<string, unknown>>('/projects', {
      method: 'POST',
      token,
      body: compactObject({
        ...body,
      }),
    });
    return attachProtectedProjectMedia(normalizeProject(extractProjectRecord(payload)));
  },
  async updateProject(
    id: string,
    token: string,
    body: {
      title?: string;
      craftType?: string | null;
      status?: string;
      stageLabel?: string;
      progressMode?: string;
      progressValue?: number | null;
      progressPercent?: number;
      recipient?: string | null;
      isGift?: boolean;
      occasion?: string | null;
      deadlineAt?: string | null;
      notes?: string | null;
      yarnDetails?: string | null;
      needleHookDetails?: string | null;
      coverImageUrl?: string | null;
      isFavorite?: boolean;
      lastWorkedAt?: string | null;
      completedAt?: string | null;
    },
  ) {
    const payload = await request<ProjectResponse | Record<string, unknown>>(`/projects/${id}`, {
      method: 'PUT',
      token,
      body: compactObject({
        ...body,
      }),
    });
    return attachProtectedProjectMedia(normalizeProject(extractProjectRecord(payload)));
  },
  deleteProject(id: string, token: string) {
    return request<void>(`/projects/${id}`, {
      method: 'DELETE',
      token,
    });
  },
  async projectPhotos(id: string, token: string) {
    const payload = await request<ProjectPhotosResponse | { photos: Record<string, unknown>[] }>(
      `/projects/${id}/photos`,
      { token },
    );
    return payload.photos.map((photo) =>
      attachProtectedProjectPhoto(normalizeProjectPhoto(photo as unknown as Record<string, unknown>)),
    );
  },
  async projectMarks(id: string, token: string) {
    try {
      const payload = await request<ProjectPatternMarksResponse | { marks: Record<string, unknown>[] }>(
        `/projects/${id}/marks`,
        { token },
      );
      return extractProjectMarkList(payload).map((mark) =>
        normalizeProjectPatternMark(mark as unknown as Record<string, unknown>),
      );
    } catch (error) {
      if (isMissingProjectFeature(error)) {
        return [];
      }
      throw error;
    }
  },
  async createProjectMark(
    id: string,
    token: string,
    body: {
      type: ProjectPatternMark['type'];
      label?: string;
      pageNumber?: number | null;
      locationLabel?: string | null;
      note?: string | null;
      sortOrder?: number;
    },
  ) {
    try {
      const payload = await request<ProjectPatternMarkResponse | Record<string, unknown>>(
        `/projects/${id}/marks`,
        {
          method: 'POST',
          token,
          body: compactObject({
            ...body,
          }),
        },
      );
      return normalizeProjectPatternMark(extractProjectMarkRecord(payload));
    } catch (error) {
      if (isMissingProjectFeature(error)) {
        throw new Error('Project reading position and bookmarks need the latest StitchSense API redeployed before they can be saved.');
      }
      throw error;
    }
  },
  deleteProjectMark(id: string, markId: string, token: string) {
    return request<void>(`/projects/${id}/marks/${markId}`, {
      method: 'DELETE',
      token,
    });
  },
  async uploadProjectPhoto(
    id: string,
    token: string,
    file: {
      uri: string;
      name: string;
      mimeType?: string | null;
      caption?: string | null;
      takenAt?: string | null;
    },
  ) {
    const makeFormData = () => {
      const formData = new FormData();
      formData.append(
        'file',
        {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'image/jpeg',
        } as unknown as Blob,
      );
      if (file.caption) {
        formData.append('caption', file.caption);
      }
      if (file.takenAt) {
        formData.append('takenAt', file.takenAt);
      }
      return formData;
    };

    let activeToken = token;
    let response = await fetchWithTimeout(`${config.apiBaseUrl}/projects/${id}/photos`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${activeToken}`,
      },
      body: makeFormData(),
    });

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        activeToken = refreshedToken;
        response = await fetchWithTimeout(`${config.apiBaseUrl}/projects/${id}/photos`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${activeToken}`,
          },
          body: makeFormData(),
        });
      }
    }

    if (!response.ok) {
      let message = `Server returned ${response.status}.`;
      try {
        const payload = await readJsonResponse<Record<string, unknown>>(response);
        const detail =
          payload?.message ?? payload?.error ?? payload?.details ?? payload?.code ?? message;
        if (typeof detail === 'string' && detail.trim().length > 0) {
          message = detail;
        }
      } catch {
        const text = await response.text();
        if (text.trim().length > 0) {
          message = text.trim();
        }
      }
      throw new APIError({ statusCode: response.status, message });
    }

    const payload = await readJsonResponse<ProjectPhotoResponse | Record<string, unknown>>(response);
    const record =
      'photo' in payload
        ? (payload.photo as unknown as Record<string, unknown>)
        : (payload as Record<string, unknown>);
    return attachProtectedProjectPhoto(normalizeProjectPhoto(record));
  },
  deleteProjectPhoto(id: string, photoId: string, token: string) {
    return request<void>(`/projects/${id}/photos/${photoId}`, {
      method: 'DELETE',
      token,
    });
  },
  async stashItems(token: string, params?: { category?: StashCategory | 'all'; search?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.category && params.category !== 'all') {
      searchParams.set('category', params.category);
    }
    if (params?.search?.trim()) {
      searchParams.set('search', params.search.trim());
    }
    const queryString = searchParams.toString();
    const payload = await request<{ items: Record<string, unknown>[] }>(
      `/stash${queryString ? `?${queryString}` : ''}`,
      { token },
    );
    return payload.items.map((item) => normalizeStashItem(item, token));
  },
  async createStashItem(token: string, body: Omit<Partial<StashItem>, 'id' | 'createdAt' | 'updatedAt'> & {
    category: StashCategory;
    name: string;
  }) {
    const payload = await request<{ item: Record<string, unknown> }>('/stash', {
      method: 'POST',
      token,
      body: compactObject({
        category: body.category,
        name: body.name,
        quantity: body.quantity,
        unit: body.unit,
        brand: body.brand,
        yarnWeight: body.yarnWeight,
        fibre: body.fibre,
        colour: body.colour,
        dyeLot: body.dyeLot,
        size: body.size,
        material: body.material,
        location: body.location,
        reservedFor: body.reservedFor,
        notes: body.notes,
      }),
    });
    return normalizeStashItem(payload.item, token);
  },
  async updateStashItem(id: string, token: string, body: Partial<Omit<StashItem, 'id' | 'createdAt' | 'updatedAt'>>) {
    const payloadBody = compactObject({
      category: body.category,
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      brand: body.brand,
      yarnWeight: body.yarnWeight,
      fibre: body.fibre,
      colour: body.colour,
      dyeLot: body.dyeLot,
      size: body.size,
      material: body.material,
      location: body.location,
      reservedFor: body.reservedFor,
      notes: body.notes,
    }) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, 'reservedFor') && !body.reservedFor) {
      payloadBody.reservedFor = null;
    }

    const payload = await request<{ item: Record<string, unknown> }>(`/stash/${id}`, {
      method: 'PUT',
      token,
      body: payloadBody,
    });
    return normalizeStashItem(payload.item, token);
  },
  async uploadStashImage(
    id: string,
    token: string,
    file: {
      uri: string;
      name: string;
      mimeType?: string | null;
    },
  ) {
    const makeFormData = () => {
      const formData = new FormData();
      formData.append(
        'file',
        {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'image/jpeg',
        } as unknown as Blob,
      );
      return formData;
    };

    let activeToken = token;
    let response = await fetchWithTimeout(`${config.apiBaseUrl}/stash/${id}/image`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${activeToken}`,
      },
      body: makeFormData(),
    });

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        activeToken = refreshedToken;
        response = await fetchWithTimeout(`${config.apiBaseUrl}/stash/${id}/image`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${activeToken}`,
          },
          body: makeFormData(),
        });
      }
    }

    if (!response.ok) {
      let message = `Server returned ${response.status}.`;
      try {
        const payload = await readJsonResponse<Record<string, unknown>>(response);
        const detail = payload?.message ?? payload?.error ?? payload?.details ?? payload?.code ?? message;
        if (typeof detail === 'string' && detail.trim().length > 0) {
          message = detail;
        }
      } catch {
        const text = await response.text();
        if (text.trim().length > 0) {
          message = text.trim();
        }
      }
      throw new APIError({ statusCode: response.status, message });
    }

    const payload = await readJsonResponse<{ item: Record<string, unknown> }>(response);
    return normalizeStashItem(payload.item, activeToken);
  },
  deleteStashItem(id: string, token: string) {
    return request<void>(`/stash/${id}`, {
      method: 'DELETE',
      token,
    });
  },
  async projectCounters(id: string, token: string) {
    try {
      const payload = await request<ProjectCountersResponse | Record<string, unknown>[] | { counters: Record<string, unknown>[] }>(
        `/projects/${id}/counters`,
        { token },
      );
      return extractCounterList(payload).map((counter) => normalizeProjectCounter(counter));
    } catch (error) {
      if (isMissingProjectFeature(error)) {
        return [];
      }
      throw error;
    }
  },
  async createProjectCounter(
    id: string,
    token: string,
    body: {
      label: string;
      counterType?: string;
      currentValue?: number;
      targetValue?: number | null;
      stepValue?: number;
      sortOrder?: number;
      notes?: string | null;
    },
  ) {
    try {
      const payload = await request<ProjectCounterResponse | Record<string, unknown>>(`/projects/${id}/counters`, {
        method: 'POST',
        token,
        body: compactObject({ ...body }),
      });
      return normalizeProjectCounter(extractCounterRecord(payload));
    } catch (error) {
      if (isMissingProjectFeature(error)) {
        throw new Error('Project counters need the latest StitchSense API redeployed before they can be saved.');
      }
      throw error;
    }
  },
  async updateProjectCounter(
    id: string,
    counterId: string,
    token: string,
    body: {
      label?: string;
      counterType?: string;
      currentValue?: number;
      targetValue?: number | null;
      stepValue?: number;
      sortOrder?: number;
      notes?: string | null;
    },
  ) {
    const payload = await request<ProjectCounterResponse | Record<string, unknown>>(`/projects/${id}/counters/${counterId}`, {
      method: 'PUT',
      token,
      body: compactObject({ ...body }),
    });
    return normalizeProjectCounter(extractCounterRecord(payload));
  },
  deleteProjectCounter(id: string, counterId: string, token: string) {
    return request<void>(`/projects/${id}/counters/${counterId}`, {
      method: 'DELETE',
      token,
    });
  },
  async projectWorkLog(id: string, token: string) {
    try {
      const payload = await request<ProjectWorkLogResponse | Record<string, unknown>[] | { entries: Record<string, unknown>[] }>(
        `/projects/${id}/work-log`,
        { token },
      );
      return extractWorkLogEntries(payload).map((entry) => normalizeProjectWorkLogEntry(entry));
    } catch (error) {
      if (isMissingProjectFeature(error)) {
        return [];
      }
      throw error;
    }
  },
  async createProjectWorkLogEntry(
    id: string,
    token: string,
    body: {
      entryType?: string;
      title?: string;
      body?: string | null;
      progressPercent?: number | null;
      minutesSpent?: number | null;
    },
  ) {
    const payload = await request<ProjectWorkLogEntryResponse | Record<string, unknown>>(`/projects/${id}/work-log`, {
      method: 'POST',
      token,
      body: compactObject({ ...body }),
    });
    return normalizeProjectWorkLogEntry(extractWorkLogEntryRecord(payload));
  },
  deleteProjectWorkLogEntry(id: string, entryId: string, token: string) {
    return request<void>(`/projects/${id}/work-log/${entryId}`, {
      method: 'DELETE',
      token,
    });
  },
  async pattern(id: string, token: string) {
    const payload = await request<{ pattern: Pattern }>(`/patterns/${id}`, { token });
    return normalizePattern(payload.pattern as unknown as Record<string, unknown>);
  },
  async createPattern(
    token: string,
    body: {
      title: string;
      craftType?: string | null;
      originalFilename?: string | null;
      sourceUrl?: string | null;
      source?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const payloadBody = compactObject({
      title: body.title,
      craftType: body.craftType ?? undefined,
      originalFilename: body.originalFilename ?? undefined,
      sourceUrl: body.sourceUrl ?? undefined,
      source: body.source ?? undefined,
      metadata: body.metadata ?? undefined,
    });
    const payload = await request<{ pattern: Pattern }>('/patterns', {
      method: 'POST',
      token,
      body: payloadBody,
    });
    return normalizePattern(payload.pattern as unknown as Record<string, unknown>);
  },
  async updatePattern(
    id: string,
    token: string,
    body: {
      title?: string;
      craftType?: string | null;
      originalFilename?: string | null;
      sourceUrl?: string | null;
      patternSummaryText?: string | null;
      isArchived?: boolean;
      metadata?: Record<string, unknown>;
    },
  ) {
    const payloadBody = compactObject({
      title: body.title,
      craftType: body.craftType ?? undefined,
      originalFilename: body.originalFilename ?? undefined,
      sourceUrl: body.sourceUrl ?? undefined,
      patternSummaryText: body.patternSummaryText ?? undefined,
      isArchived: body.isArchived ?? undefined,
      metadata: body.metadata ?? undefined,
    });
    const payload = await request<{ pattern: Pattern }>(`/patterns/${id}`, {
      method: 'PUT',
      token,
      body: payloadBody,
    });
    return normalizePattern(payload.pattern as unknown as Record<string, unknown>);
  },
	  async refreshPatternSummary(id: string, token: string, skillLevel = 'beginner') {
	    const payload = await request<{ pattern: Pattern; workflow?: unknown }>(
	      `/patterns/${id}/summary/refresh`,
	      {
	        method: 'POST',
	        token,
	        timeoutMs: 240000,
	        body: { skillLevel },
	      },
	    );
    return {
      ...payload,
      pattern: normalizePattern(payload.pattern as unknown as Record<string, unknown>),
    };
  },
  deletePattern(id: string, token: string) {
    return request<void>(`/patterns/${id}`, {
      method: 'DELETE',
      token,
    });
  },
  patternFileUrl(id: string, token: string) {
    return request<PatternFileResponse>(`/patterns/${id}/file-url`, { token });
  },
  patternFileApiUrl(id: string) {
    return `${config.apiBaseUrl}/patterns/${encodeURIComponent(id)}/file`;
  },
  async uploadPatternFile(
    id: string,
    token: string,
    file: {
      uri: string;
      name: string;
      mimeType?: string | null;
    },
  ) {
    const makeFormData = () => {
      const formData = new FormData();
      formData.append(
        'file',
        {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'application/pdf',
        } as unknown as Blob,
      );
      return formData;
    };

    let activeToken = token;
    let response = await fetchWithTimeout(`${config.apiBaseUrl}/patterns/${id}/file`, {
      method: 'POST',
      timeoutMs: 600000,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${activeToken}`,
      },
      body: makeFormData(),
    });

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        activeToken = refreshedToken;
        response = await fetchWithTimeout(`${config.apiBaseUrl}/patterns/${id}/file`, {
          method: 'POST',
          timeoutMs: 600000,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${activeToken}`,
          },
          body: makeFormData(),
        });
      }
    }

    if (!response.ok) {
      let message = `Server returned ${response.status}.`;
      try {
        const payload = await readJsonResponse<Record<string, unknown>>(response);
        const detail =
          payload?.message ?? payload?.error ?? payload?.details ?? payload?.code ?? message;
        if (typeof detail === 'string' && detail.trim().length > 0) {
          message = detail;
        }
      } catch {
        const text = await response.text();
        if (text.trim().length > 0) {
          message = text.trim();
        }
      }
      throw new APIError({ statusCode: response.status, message });
    }

    return readJsonResponse<{
	      fileKey?: string | null;
	      fileSize?: number | null;
	      storageProvider?: string | null;
	      projectId?: string | null;
	      fileId?: string | null;
	      jobId?: string | null;
	      indexed?: boolean;
	      indexingError?: string | null;
	    }>(response);
  },
  async ravelryStatus(token: string) {
    const payload = await request<RavelryStatusResponse>('/ravelry/status', { token });
    return {
      success: Boolean(payload.success),
      configured: Boolean(payload.configured),
      oauthConfigured: Boolean((payload as Record<string, unknown>).oauthConfigured ?? (payload as Record<string, unknown>).oauth_configured),
      basicConfigured: Boolean((payload as Record<string, unknown>).basicConfigured ?? (payload as Record<string, unknown>).basic_configured),
      searchConfigured: Boolean((payload as Record<string, unknown>).searchConfigured ?? (payload as Record<string, unknown>).search_configured),
      connected: Boolean(payload.connected),
      username: String(payload.username ?? ''),
      tokenExpires: String((payload as Record<string, unknown>).tokenExpires ?? (payload as Record<string, unknown>).token_expires ?? ''),
      apiOk: Boolean((payload as Record<string, unknown>).apiOk ?? (payload as Record<string, unknown>).api_ok),
      apiError: String((payload as Record<string, unknown>).apiError ?? (payload as Record<string, unknown>).api_error ?? ''),
      apiWarning: String((payload as Record<string, unknown>).apiWarning ?? (payload as Record<string, unknown>).api_warning ?? ''),
      callbackUrl: String((payload as Record<string, unknown>).callbackUrl ?? (payload as Record<string, unknown>).callback_url ?? ''),
    };
  },
  ravelryConnectUrl(token: string) {
    return request<{ success: boolean; url?: string; callbackUrl?: string }>('/ravelry/connect-url', {
      method: 'POST',
      token,
      body: {},
    });
  },
  ravelrySaveUsername(token: string, username: string) {
    return request<{ success: boolean; username: string }>('/ravelry/username', {
      method: 'POST',
      token,
      body: { username },
    });
  },
  ravelryDisconnect(token: string) {
    return request<{ success: boolean }>('/ravelry/disconnect', {
      method: 'POST',
      token,
      body: {},
    });
  },
  async ravelrySearch(
    token: string,
    params: {
      q: string;
      page?: number;
      pageSize?: number;
      craft?: string;
      weight?: string;
      availability?: string;
      sort?: string;
    },
  ) {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params.craft) searchParams.set('craft', params.craft);
    if (params.weight) searchParams.set('weight', params.weight);
    if (params.availability) searchParams.set('availability', params.availability);
    if (params.sort) searchParams.set('sort', params.sort);
    const payload = await request<RavelrySearchResponse>(`/ravelry/search?${searchParams.toString()}`, { token });
    const pagination = payload.pagination as unknown as Record<string, unknown>;
    return {
      success: Boolean(payload.success),
      query: payload.query ?? params.q,
      patterns: payload.patterns.map((pattern) =>
        normalizeRavelryPattern(pattern as unknown as Record<string, unknown>),
      ),
      pagination: {
        page: Number((pagination.page ?? 1) as number),
        pageSize: Number((pagination.pageSize ?? pagination.page_size ?? 24) as number),
        pageCount: Number((pagination.pageCount ?? pagination.page_count ?? 1) as number),
        totalCount: Number((pagination.totalCount ?? pagination.total_count ?? 0) as number),
        returnedCount: Number((pagination.returnedCount ?? pagination.returned_count ?? 0) as number),
        hasNext: Boolean((pagination.hasNext ?? pagination.has_next) as boolean),
        hasPrev: Boolean((pagination.hasPrev ?? pagination.has_prev) as boolean),
      },
    };
  },
  async ravelrySaved(token: string, params: { page?: number; pageSize?: number } = {}) {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const queryString = searchParams.toString();
    const payload = await request<RavelrySearchResponse>(
      `/ravelry/saved${queryString ? `?${queryString}` : ''}`,
      { token },
    );
    const pagination = payload.pagination as unknown as Record<string, unknown>;
    return {
      success: Boolean(payload.success),
      username: payload.username ?? '',
      patterns: payload.patterns.map((pattern) =>
        normalizeRavelryPattern(pattern as unknown as Record<string, unknown>),
      ),
      pagination: {
        page: Number((pagination.page ?? 1) as number),
        pageSize: Number((pagination.pageSize ?? pagination.page_size ?? 24) as number),
        pageCount: Number((pagination.pageCount ?? pagination.page_count ?? 1) as number),
        totalCount: Number((pagination.totalCount ?? pagination.total_count ?? 0) as number),
        returnedCount: Number((pagination.returnedCount ?? pagination.returned_count ?? 0) as number),
        hasNext: Boolean((pagination.hasNext ?? pagination.has_next) as boolean),
        hasPrev: Boolean((pagination.hasPrev ?? pagination.has_prev) as boolean),
      },
    };
  },
  async ravelryPattern(token: string, id: string) {
    const payload = await request<RavelryPatternResponse>(`/ravelry/pattern?id=${encodeURIComponent(id)}`, {
      token,
    });
    return {
      success: Boolean(payload.success),
      pattern: normalizeRavelryPattern(payload.pattern as unknown as Record<string, unknown>),
    };
  },
  async ravelryImport(
    token: string,
    body: { id?: string; libraryPatternId?: string; pattern?: Record<string, unknown> },
  ) {
    const payload = await request<RavelryImportResponse>('/ravelry/import', {
      method: 'POST',
      token,
      body,
      // Ravelry may download a PDF and wait for the analysis workflow before
      // returning. Keep this aligned with the long-running upload endpoints.
      timeoutMs: 600000,
    });
    return {
      ...payload,
      pattern:
        payload.pattern && typeof payload.pattern === 'object'
          ? normalizePattern(payload.pattern as unknown as Record<string, unknown>)
          : null,
      pdfSaved: Boolean((payload as Record<string, unknown>).pdfSaved ?? (payload as Record<string, unknown>).pdf_saved),
      pdfUrl: String((payload as Record<string, unknown>).pdfUrl ?? (payload as Record<string, unknown>).pdf_url ?? ''),
      analysisSucceeded: Boolean(
        (payload as Record<string, unknown>).analysisSucceeded ??
          (payload as Record<string, unknown>).analysis_succeeded,
      ),
      downloadError: String(
        (payload as Record<string, unknown>).downloadError ??
          (payload as Record<string, unknown>).download_error ??
          '',
      ),
      analysisError: String(
        (payload as Record<string, unknown>).analysisError ??
          (payload as Record<string, unknown>).analysis_error ??
          '',
      ),
    };
  },
  async patternChats(patternId: string, token: string) {
    const payload = await request<PatternChatsResponse>(`/patterns/${patternId}/chats`, { token });
    return {
      sessions: payload.sessions.map((session) =>
        normalizeChatSession(session as unknown as Record<string, unknown>),
      ),
    };
  },
  async createChat(
    patternId: string | null | undefined,
    title: string,
    token: string,
    skillLevel = 'beginner',
  ) {
    const payload = await request<CreateChatResponse>('/chats', {
      method: 'POST',
      token,
      body: {
        ...(patternId ? { patternId } : {}),
        title,
        skillLevel,
      },
    });
    return {
      session: normalizeChatSession(payload.session as unknown as Record<string, unknown>),
    };
  },
  async chatMessages(sessionId: string, token: string) {
    const payload = await request<ChatMessagesResponse>(`/chats/${sessionId}/messages`, { token });
    return {
      messages: payload.messages.map((message) =>
        normalizeChatMessage(message as unknown as Record<string, unknown>),
      ),
    };
  },
  async sendChatMessage(
    sessionId: string,
    content: string,
    token: string,
    options?: {
      kind?: string;
      toolMode?: string;
      patternId?: string | null;
    },
  ) {
    const payload = await request<SendChatMessageResponse>(`/chats/${sessionId}/messages`, {
      method: 'POST',
      token,
      timeoutMs: 600000,
      body: {
        content,
        kind: options?.kind ?? 'message',
        toolMode: options?.toolMode ?? 'pattern_chat',
        patternId: options?.patternId ?? null,
      },
    });
    return {
      ...payload,
      message: normalizeChatMessage(payload.message as unknown as Record<string, unknown>),
    };
  },
  async patternRewrites(patternId: string, token: string) {
    const payload = await request<PatternRewritesResponse>(`/patterns/${patternId}/rewrites`, { token });
    return {
      rewrites: payload.rewrites.map((rewrite) =>
        normalizeRewrite(rewrite as unknown as Record<string, unknown>),
      ),
    };
  },
  async createRewrite(patternId: string, prompt: string, token: string) {
    const payload = await request<CreateRewriteResponse>('/rewrites', {
      method: 'POST',
      token,
      body: {
        patternId,
        prompt,
      },
    });
    return {
      ...payload,
      rewrite: normalizeRewrite(payload.rewrite as unknown as Record<string, unknown>),
    };
  },
  analyseVision(
    token: string,
    body: {
      imageDataUri: string;
      question?: string;
      skillLevel?: string;
      toolMode?: string;
    },
  ) {
    return request<VisionAnalyseResponse>('/vision/analyse', {
      method: 'POST',
      token,
      body,
    });
  },
};

export { APIError };

export function projectPhotoFileUrl(projectId: string, photoId: string) {
  return buildProjectPhotoUrl(projectId, photoId);
}

export function buildPatternThumbnailUrl(patternId: string, _token?: string | null, version?: string | null) {
  const params = new URLSearchParams();
  if (version) {
    params.set('v', version);
  }
  const queryString = params.toString();
  return `${config.apiBaseUrl}/patterns/${encodeURIComponent(patternId)}/thumbnail${queryString ? `?${queryString}` : ''}`;
}

export function authenticatedImageSource(uri: string, token?: string | null) {
  const apiBase = config.apiBaseUrl.replace(/\/$/, '');
  const isProtectedApiImage = Boolean(token) && uri.startsWith(`${apiBase}/`);

  return {
    uri,
    ...(isProtectedApiImage
      ? { headers: { authorization: `Bearer ${token}` } }
      : {}),
  };
}
