import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hasFeature, resolveEntitlement } from '../services/entitlements.js';
import { renderPatternThumbnail, renderPatternThumbnailDataUri } from '../services/patternThumbnails.js';
import {
  buildScopedWorkflowUserId,
  englishOnlyInstruction,
  patternHasScopedContent,
  patternNeedsOwnedSource,
  selectedPatternUnavailableMessage,
  ownedSourceRequiredMessage,
} from '../services/patternWorkflowGuards.js';
import { getPatternFile, putPatternFile, signedPatternUrl } from '../services/storage.js';
import { callUploadWorkflowWithFile, callWorkflow } from '../services/workflows.js';
import { callWordPressChatProxy, callWordPressUploadProxy } from '../services/wordpressBridge.js';
import { config } from '../config.js';
import { configuredWordPressSiteUrl } from '../services/wordpressSite.js';

const patternBody = z.object({
  title: z.string().default('Untitled'),
  craftType: z.string().optional(),
  originalFilename: z.string().optional(),
  fileUrl: z.string().url().optional(),
  fileKey: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  patternSummaryHtml: z.string().optional(),
  patternSummaryText: z.string().optional(),
  patternSummaryStructured: z.record(z.unknown()).optional(),
  source: z.string().default('upload'),
  metadata: z.record(z.unknown()).optional(),
  isArchived: z.boolean().optional(),
});

const refreshSummaryBody = z.object({
  skillLevel: z.string().default('beginner'),
});

const patternSummaryPrompt =
  'Create a structured smart summary of the uploaded knitting or crochet pattern. Return the key overview, skills, yarn/materials, tools, gauge/tension, sizes, tricky areas, beginner notes, missing information, potential issues to check, and practical suggested fixes or next actions. If you spot corrections, confusing rows, missing essentials, terminology ambiguity or stitch-count risks, include them clearly in the summary without overclaiming.';
const fileTransferTtlSeconds = 15 * 60;

function isPdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isPlainTextBuffer(buffer: Buffer) {
  if (buffer.length === 0 || buffer.includes(0)) return false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    const disallowedControls = text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)?.length ?? 0;
    return disallowedControls <= Math.max(2, Math.floor(text.length * 0.001));
  } catch {
    return false;
  }
}

function safeDownloadFilename(value: string | null) {
  const sanitized = (value ?? 'pattern.pdf')
    .replace(/[\\/\r\n\t"<>:|?*\u0000-\u001F\u007F]/g, '_')
    .trim()
    .slice(0, 180);
  return sanitized || 'pattern.pdf';
}

function base64Url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function signFileTransferToken(input: { userId: string; patternId: string; fileKey: string }) {
  const payload = base64Url(
    JSON.stringify({
      sub: input.userId,
      pid: input.patternId,
      key: input.fileKey,
      exp: Math.floor(Date.now() / 1000) + fileTransferTtlSeconds,
    }),
  );
  const signature = createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyFileTransferToken(token: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      pid?: unknown;
      key?: unknown;
      exp?: unknown;
    };
    if (
      typeof decoded.sub !== 'string' ||
      typeof decoded.pid !== 'string' ||
      typeof decoded.key !== 'string' ||
      typeof decoded.exp !== 'number' ||
      decoded.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      userId: decoded.sub,
      patternId: decoded.pid,
      fileKey: decoded.key,
    };
  } catch {
    return null;
  }
}

function requestOrigin(request: FastifyRequest) {
  const configuredPublicBaseUrl = config.publicApiBaseUrl.trim().replace(/\/$/, '');
  if (configuredPublicBaseUrl) {
    return configuredPublicBaseUrl;
  }

  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwardedHost = request.headers['x-forwarded-host'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ??
    request.headers.host ??
    `127.0.0.1:${config.port}`;
  return `${proto || 'https'}://${host}`;
}

function resolveClientSurface(request: FastifyRequest) {
  const header = request.headers['x-stitchsense-client-surface'];
  if (Array.isArray(header)) {
    return header[0] ?? 'unknown';
  }
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim();
  }
  return 'unknown';
}

function logPatternSummaryRouting(
  request: FastifyRequest,
  details: {
    patternId: string;
    projectId?: string | null;
    metadataOnlyBlocked?: boolean;
    scopedPatternUnavailable?: boolean;
  },
) {
  request.log.info(
    {
      event: 'pattern_routing',
      clientSurface: resolveClientSurface(request),
      userId: request.authUser.id,
      toolMode: 'pattern_summary',
      patternId: details.patternId,
      sessionId: null,
      projectId: details.projectId ?? null,
      metadataOnlyBlocked: details.metadataOnlyBlocked ?? false,
      scopedPatternUnavailable: details.scopedPatternUnavailable ?? false,
    },
    'Resolved pattern-aware summary routing',
  );
}

function stripAiMarkup(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function maybeParseJson(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!cleaned) {
    return null;
  }
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readWorkflowRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const record = payload as Record<string, unknown>;
  for (const key of ['payload', 'result', 'data']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return { ...record, ...(nested as Record<string, unknown>) };
    }
  }
  return record;
}

function readWorkflowString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function workflowReturnedFailure(record: Record<string, unknown>) {
  if (record.success === false || record.ok === false) {
    return String(record.error ?? record.message ?? 'Upload workflow failed');
  }
  return '';
}

function extractSummaryPayload(payload: unknown) {
  const source = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  let structured =
    source.structured_data ??
    source.structuredData ??
    source.pattern_summary ??
    source.patternSummary ??
    source.summary ??
    null;
  let answer = source.answer ?? source.overview ?? source.output ?? '';

  if (!structured) {
    const parsed = maybeParseJson(answer) ?? maybeParseJson(source.output);
    if (parsed) {
      structured =
        parsed.pattern_summary ??
        parsed.patternSummary ??
        parsed.structured_data ??
        parsed.structuredData ??
        parsed.summary ??
        null;
      answer = parsed.answer ?? parsed.overview ?? answer;
    }
  }

  return {
    answer: String(answer || '').trim(),
    structured:
      structured && typeof structured === 'object' && !Array.isArray(structured)
        ? (structured as Record<string, unknown>)
        : null,
  };
}

function renderSummaryHtml(structured: Record<string, unknown> | null, fallbackText: string, fallbackTitle: string) {
  const title = String(structured?.pattern_title ?? structured?.title ?? fallbackTitle).trim();
  const overview = String(
    structured?.construction_summary ?? structured?.overview ?? fallbackText ?? 'Pattern summary refreshed.',
  ).trim();

  return [
    '<div class="ss-pattern-summary-card">',
    '<div class="ss-summary-top">',
    '<span class="ss-summary-label">Pattern summary</span>',
    `<h4>${escapeHtml(title || 'Pattern summary')}</h4>`,
    '</div>',
    `<div class="ss-summary-overview"><p>${escapeHtml(stripAiMarkup(overview || fallbackText))
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')}</p></div>`,
    '</div>',
  ].join('');
}

export async function patternRoutes(app: FastifyInstance) {
  app.get('/patterns/file-transfer', async (request, reply) => {
    const token =
      typeof request.query === 'object' && request.query
        ? String((request.query as { token?: unknown }).token ?? '')
        : '';
    const transfer = verifyFileTransferToken(token);
    if (!transfer) {
      return reply.code(401).send({ error: 'Invalid or expired file transfer link' });
    }

    const result = await query<{
      original_filename: string | null;
      file_mime_type: string | null;
      file_key: string | null;
    }>(
      `SELECT original_filename, file_mime_type, file_key
       FROM user_patterns
       WHERE id = $1
         AND user_id = $2
         AND file_key = $3
         AND deleted_at IS NULL
       LIMIT 1`,
      [transfer.patternId, transfer.userId, transfer.fileKey],
    );
    if (!result.rowCount || !result.rows[0].file_key) {
      return reply.code(404).send({ error: 'Pattern file not found' });
    }

    const row = result.rows[0];
    const fileKey = row.file_key;
    if (!fileKey) {
      return reply.code(404).send({ error: 'Pattern file not found' });
    }
    const file = await getPatternFile(fileKey);
    reply.header('content-type', row.file_mime_type ?? file.contentType ?? 'application/pdf');
    reply.header('content-disposition', `attachment; filename="${safeDownloadFilename(row.original_filename)}"`);
    if (file.contentLength) {
      reply.header('content-length', String(file.contentLength));
    }
    return reply.send(file.body);
  });

  app.get('/patterns', { preHandler: app.authenticate }, async (request) => {
    const search =
      typeof request.query === 'object' && request.query ? (request.query as { search?: string }).search : '';
    const result = await query(
      `SELECT *
       FROM user_patterns
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%' OR pattern_summary_text ILIKE '%' || $2 || '%')
       ORDER BY updated_at DESC
       LIMIT 100`,
      [request.authUser.id, search || null],
    );
    return { patterns: result.rows };
  });

  app.post('/patterns', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'patternUploads'))
      return reply.code(402).send({ error: 'Subscription required', entitlement });

    const body = patternBody.parse(request.body);
    const result = await query(
      `INSERT INTO user_patterns
       (user_id, title, craft_type, original_filename, file_url, file_key, pattern_summary_html, pattern_summary_text, pattern_summary_structured, source, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id, (metadata->>'ravelry_id'))
         WHERE deleted_at IS NULL AND COALESCE(metadata->>'ravelry_id', '') <> ''
       DO UPDATE SET
         title = EXCLUDED.title,
         craft_type = EXCLUDED.craft_type,
         original_filename = EXCLUDED.original_filename,
         file_url = EXCLUDED.file_url,
         file_key = EXCLUDED.file_key,
         pattern_summary_html = EXCLUDED.pattern_summary_html,
         pattern_summary_text = EXCLUDED.pattern_summary_text,
         pattern_summary_structured = EXCLUDED.pattern_summary_structured,
         source = EXCLUDED.source,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING *`,
      [
        request.authUser.id,
        body.title,
        body.craftType ?? null,
        body.originalFilename ?? null,
        body.fileUrl ?? null,
        body.fileKey ?? null,
        body.patternSummaryHtml ?? null,
        body.patternSummaryText ?? null,
        body.patternSummaryStructured ?? {},
        body.source,
        body.metadata ?? {},
      ],
    );
    return reply.code(201).send({ pattern: result.rows[0] });
  });

  app.get('/patterns/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query('SELECT * FROM user_patterns WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [
      id,
      request.authUser.id,
    ]);
    if (!result.rowCount) return reply.code(404).send({ error: 'Pattern not found' });
    return { pattern: result.rows[0] };
  });

  app.put('/patterns/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patternBody.partial().parse(request.body);
    const result = await query(
      `UPDATE user_patterns
       SET title = COALESCE($3, title),
           craft_type = COALESCE($4, craft_type),
           original_filename = COALESCE($5, original_filename),
           file_url = COALESCE($6, file_url),
           file_key = COALESCE($7, file_key),
           source_url = COALESCE($8, source_url),
           pattern_summary_html = COALESCE($9, pattern_summary_html),
           pattern_summary_text = COALESCE($10, pattern_summary_text),
           pattern_summary_structured = COALESCE($11, pattern_summary_structured),
           source = COALESCE($12, source),
           metadata = COALESCE($13, metadata),
           is_archived = COALESCE($14, is_archived),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        request.authUser.id,
        body.title ?? null,
        body.craftType ?? null,
        body.originalFilename ?? null,
        body.fileUrl ?? null,
        body.fileKey ?? null,
        body.sourceUrl ?? null,
        body.patternSummaryHtml ?? null,
        body.patternSummaryText ?? null,
        body.patternSummaryStructured ?? null,
        body.source ?? null,
        body.metadata ?? null,
        body.isArchived ?? null,
      ],
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Pattern not found' });
    return { pattern: result.rows[0] };
  });

  app.post('/patterns/:id/summary/refresh', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'aiChat'))
      return reply.code(402).send({ error: 'Subscription required', entitlement });

    const { id } = request.params as { id: string };
    const body = refreshSummaryBody.parse(request.body ?? {});
    const patternResult = await query<{
      id: string;
      title: string | null;
      source: string | null;
      file_url: string | null;
      file_key: string | null;
      project_id: string | null;
      file_id: string | null;
      job_id: string | null;
      pattern_summary_text: string | null;
      pattern_summary_html: string | null;
      pattern_summary_structured: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, title, source, file_url, file_key, project_id, file_id, job_id,
              pattern_summary_text, pattern_summary_html, pattern_summary_structured, metadata
       FROM user_patterns
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [id, request.authUser.id],
    );

    if (!patternResult.rowCount) {
      return reply.code(404).send({ error: 'Pattern not found' });
    }

    const pattern = patternResult.rows[0];
    const metadata = pattern.metadata ?? {};
    if (
      patternNeedsOwnedSource({
        source: pattern.source,
        fileUrl: pattern.file_url,
        fileKey: pattern.file_key,
        fileId: pattern.file_id,
        jobId: pattern.job_id,
        metadata,
      })
    ) {
      logPatternSummaryRouting(request, {
        patternId: id,
        projectId: pattern.project_id,
        metadataOnlyBlocked: true,
      });
      return reply.code(409).send({ error: ownedSourceRequiredMessage() });
    }

    if (
      !patternHasScopedContent({
        fileUrl: pattern.file_url,
        fileKey: pattern.file_key,
        fileId: pattern.file_id,
        jobId: pattern.job_id,
        patternSummaryText: pattern.pattern_summary_text,
        patternSummaryHtml: pattern.pattern_summary_html,
        patternSummaryStructured: pattern.pattern_summary_structured,
        metadata,
      })
    ) {
      logPatternSummaryRouting(request, {
        patternId: id,
        projectId: pattern.project_id,
        scopedPatternUnavailable: true,
      });
      return reply.code(409).send({ error: selectedPatternUnavailableMessage() });
    }

    const summaryText = pattern.pattern_summary_text ?? stripAiMarkup(pattern.pattern_summary_html ?? '');
    const scopedWorkflowUserId = buildScopedWorkflowUserId(request.authUser.id, id);
    const workflowPayload = {
      action: 'chat',
      question: patternSummaryPrompt,
      original_question: patternSummaryPrompt,
      tool_mode: 'pattern_summary',
      toolMode: 'pattern_summary',
      skill_level: body.skillLevel,
      history: [],
      answer_mode: 'pattern_priority',
      pattern_available: true,
      project_id: pattern.project_id ?? undefined,
      projectId: pattern.project_id ?? undefined,
      file_id: pattern.file_id ?? undefined,
      fileId: pattern.file_id ?? undefined,
      job_id: pattern.job_id ?? undefined,
      jobId: pattern.job_id ?? undefined,
      uploaded_pattern_title: pattern.title ?? undefined,
      uploaded_pattern_summary: summaryText || undefined,
      pattern_summary_text: summaryText || undefined,
      pattern_summary_html: pattern.pattern_summary_html ?? undefined,
      pattern_summary_structured: pattern.pattern_summary_structured ?? undefined,
      pattern_metadata: metadata,
      pattern_source: pattern.source ?? undefined,
      user_id: scopedWorkflowUserId,
      userId: scopedWorkflowUserId,
      platform_user_id: request.authUser.id,
      platformUserId: request.authUser.id,
      pattern_id: id,
      patternId: id,
      response_language: 'english',
      target_language: 'english',
      translation_target_language: 'english',
      locale: 'en-GB',
      system_instruction: englishOnlyInstruction(),
    };

    logPatternSummaryRouting(request, {
      patternId: id,
      projectId: pattern.project_id,
    });

    let workflow: unknown;
    try {
      workflow = await callWorkflow('chat', workflowPayload);
    } catch (error) {
      request.log.warn({ error }, 'Direct pattern summary workflow failed; trying WordPress chat proxy fallback');
      try {
        workflow = await callWordPressChatProxy(request.authUser.id, workflowPayload);
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : 'Workflow chat failed';
        request.log.error({ error: fallbackError }, 'Pattern summary refresh failed');
        return reply.code(502).send({ error: message });
      }
    }

    const extracted = extractSummaryPayload(workflow);
    const nextText = extracted.answer || 'Pattern summary refreshed.';
    const nextHtml = renderSummaryHtml(extracted.structured, nextText, pattern.title ?? 'Pattern summary');

    const result = await query(
      `UPDATE user_patterns
       SET pattern_summary_html = $3,
           pattern_summary_text = $4,
           pattern_summary_structured = $5,
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
       RETURNING *`,
      [id, request.authUser.id, nextHtml, nextText, extracted.structured ?? {}],
    );

    return { pattern: result.rows[0], workflow };
  });

  app.delete('/patterns/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patternResult = await query<{
      id: string;
      source: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, source, metadata
       FROM user_patterns
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, request.authUser.id],
    );
    if (!patternResult.rowCount) {
      return reply.code(404).send({ error: 'Pattern not found' });
    }

    if (config.wordpress.sharedSecret) {
      const linked = await query<{
        provider_user_id: string;
        metadata: {
          siteUrl?: string;
          wpUserId?: string | number;
          [key: string]: unknown;
        };
      }>(
        `SELECT provider_user_id, metadata
         FROM linked_accounts
         WHERE user_id = $1
           AND provider = 'wordpress'
         ORDER BY linked_accounts.created_at ASC
         LIMIT 1`,
        [request.authUser.id],
      );

      if (linked.rowCount) {
        const row = linked.rows[0];
        const providerParts = row.provider_user_id.split('|');
        let siteUrl = '';
        try {
          siteUrl = configuredWordPressSiteUrl();
        } catch {
          siteUrl = '';
        }
        const wpUserId = String(row.metadata?.wpUserId ?? providerParts[1] ?? '').trim();

        if (siteUrl && wpUserId) {
          const url = new URL(`${siteUrl}/wp-json/stitchsense/v1/platform-library/patterns/${encodeURIComponent(id)}`);
          url.searchParams.set('wpUserId', wpUserId);

          const response = await fetch(url.toString(), {
            method: 'DELETE',
            redirect: 'error',
            headers: {
              accept: 'application/json',
              'x-stitchsense-wordpress-secret': config.wordpress.sharedSecret,
            },
          });

          if (!response.ok && response.status !== 404) {
            let detail = `WordPress library delete failed with HTTP ${response.status}`;
            try {
              const payload = (await response.json()) as Record<string, unknown>;
              if (typeof payload.error === 'string' && payload.error.trim()) {
                detail = payload.error;
              } else if (typeof payload.message === 'string' && payload.message.trim()) {
                detail = payload.message;
              }
            } catch {
              // Keep the default detail string if the bridge did not return JSON.
            }
            return reply.code(502).send({ error: detail });
          }
        }
      }
    }

    await query(
      `UPDATE user_patterns
       SET deleted_at = NOW(),
           updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'wordpress_deleted_at', NOW(),
             'wordpress_tombstone_source', 'pattern_delete'
           )
       WHERE id = $1
         AND user_id = $2`,
      [id, request.authUser.id],
    );
    return reply.code(204).send();
  });

  app.post('/patterns/:id/file', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'patternUploads'))
      return reply.code(402).send({ error: 'Subscription required', entitlement });

    const { id } = request.params as { id: string };
    const patternResult = await query<{
      id: string;
      title: string | null;
      craft_type: string | null;
      source_url: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, title, craft_type, source_url, metadata
       FROM user_patterns
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [id, request.authUser.id],
    );
    if (!patternResult.rowCount) return reply.code(404).send({ error: 'Pattern not found' });
    const pattern = patternResult.rows[0];

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });

    const buffer = await file.toBuffer();
    const filename = file.filename || 'pattern.pdf';
    const looksLikePdf = isPdfBuffer(buffer);
    const looksLikeText = /\.(txt|md)$/i.test(filename) && isPlainTextBuffer(buffer);
    const isAllowedUpload = looksLikePdf || looksLikeText;
    const validatedMimeType = looksLikePdf ? 'application/pdf' : 'text/plain; charset=utf-8';

    if (!isAllowedUpload) {
      return reply.code(415).send({ error: 'Please upload a PDF or text-based pattern file.' });
    }

    const stored = await putPatternFile({
      userId: request.authUser.id,
      patternId: id,
      filename,
      contentType: validatedMimeType,
      buffer,
    });

    const isPdfUpload = looksLikePdf;
    let metadataPatch: Record<string, unknown> | null = null;
    if (isPdfUpload) {
      try {
        metadataPatch = {
          thumbnail_url: await renderPatternThumbnailDataUri({
            fileKey: stored.key,
          }),
          thumbnail_generated_at: new Date().toISOString(),
        };
      } catch (error) {
        request.log.warn({ error, patternId: id }, 'Could not generate uploaded PDF thumbnail');
      }
    }

    let workflowPatch: Record<string, unknown> = {};
    let summaryText: string | null = null;
    let summaryHtml: string | null = null;
    let summaryStructured: Record<string, unknown> | null = null;
    const workflowPayload = {
      file_name: filename,
      mime_type: validatedMimeType,
      file_size: stored.size,
      project_name: pattern.title || filename.replace(/\.[^/.]+$/, ''),
      craft_type: pattern.craft_type ?? '',
      project_type: 'mobile_chat_pattern',
      upload_nonce: `mobile_${id}`,
      upload_transport: 'stitchsense_platform_file',
      platform_pattern_id: id,
      source_url: pattern.source_url ?? '',
      file_extension: filename.split('.').pop()?.toLowerCase() ?? '',
      response_language: 'english',
      target_language: 'english',
      translation_target_language: 'english',
      locale: 'en-GB',
      system_instruction:
        'Return all StitchSense summaries in English only. Index the full uploaded pattern text for later pattern_step_guide chat requests.',
    };
    try {
      let uploadWorkflow: unknown;
      const dataUriPayload = {
        ...workflowPayload,
        upload_transport: 'stitchsense_platform_file_data_uri',
        file_data_uri: `data:${validatedMimeType};base64,${buffer.toString('base64')}`,
      };
      const transferToken = signFileTransferToken({
        userId: request.authUser.id,
        patternId: id,
        fileKey: stored.key,
      });
      const transferUrl = new URL('/patterns/file-transfer', requestOrigin(request));
      transferUrl.searchParams.set('token', transferToken);
      request.log.info(
        {
          event: 'upload_transfer_url_prepared',
          patternId: id,
          transferHost: transferUrl.host,
          transferProtocol: transferUrl.protocol,
          hasConfiguredPublicBaseUrl: Boolean(config.publicApiBaseUrl.trim()),
        },
        'Prepared temporary upload transfer URL for WordPress fallback',
      );
      const wordpressUrlPayload = {
        ...workflowPayload,
        upload_transport: 'stitchsense_platform_file_url',
        file_url: transferUrl.toString(),
        file_data_uri: undefined,
      };

      try {
        uploadWorkflow = await callUploadWorkflowWithFile({
          buffer,
          filename,
          mimeType: validatedMimeType,
          payload: workflowPayload,
        });
      } catch (multipartError) {
        request.log.warn(
          { error: multipartError, patternId: id },
          'Multipart upload workflow failed; retrying with JSON file_data_uri',
        );
        try {
          uploadWorkflow = await callWorkflow('upload', dataUriPayload);
        } catch (jsonError) {
          request.log.warn(
            { error: jsonError, patternId: id },
            'Direct JSON upload workflow failed; retrying through WordPress upload bridge with signed file URL',
          );
          uploadWorkflow = await callWordPressUploadProxy(request.authUser.id, wordpressUrlPayload);
          if (!uploadWorkflow) {
            throw jsonError;
          }
        }
      }
      const workflowRecord = readWorkflowRecord(uploadWorkflow);
      const workflowFailure = workflowReturnedFailure(workflowRecord);
      if (workflowFailure) {
        throw new Error(workflowFailure);
      }
      const extracted = extractSummaryPayload(workflowRecord);
      summaryText = extracted.answer || null;
      summaryStructured = extracted.structured;
      summaryHtml = summaryText ? renderSummaryHtml(summaryStructured, summaryText, pattern.title ?? filename) : null;
      workflowPatch = {
        project_id: readWorkflowString(workflowRecord, ['project_id', 'projectId']),
        file_id: readWorkflowString(workflowRecord, ['file_id', 'fileId']),
        job_id: readWorkflowString(workflowRecord, ['job_id', 'jobId']),
        detected_title: readWorkflowString(workflowRecord, ['detected_title', 'detectedTitle']),
        detected_design_code: readWorkflowString(workflowRecord, ['detected_design_code', 'detectedDesignCode']),
        upload_workflow_indexed_at: new Date().toISOString(),
      };
      workflowPatch = Object.fromEntries(Object.entries(workflowPatch).filter(([, value]) => value));
    } catch (error) {
      request.log.error({ error, patternId: id }, 'Upload workflow indexing failed');
      workflowPatch = {
        upload_workflow_error: error instanceof Error ? error.message : 'Upload workflow indexing failed',
        upload_workflow_failed_at: new Date().toISOString(),
      };
    }

    await query(
      `UPDATE user_patterns
       SET file_key = $3,
           original_filename = $4,
           file_mime_type = $5,
           file_size = $6,
           file_extension = $7,
           storage_provider = $8,
           project_id = COALESCE(NULLIF($9, ''), project_id),
           file_id = COALESCE(NULLIF($10, ''), file_id),
           job_id = COALESCE(NULLIF($11, ''), job_id),
           pattern_summary_text = COALESCE($12, pattern_summary_text),
           pattern_summary_html = COALESCE($13, pattern_summary_html),
           pattern_summary_structured = COALESCE($14::jsonb, pattern_summary_structured),
           metadata = CASE
             WHEN $15::jsonb IS NULL THEN metadata
             ELSE COALESCE(metadata, '{}'::jsonb) || $15::jsonb
           END,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [
        id,
        request.authUser.id,
        stored.key,
        filename,
        validatedMimeType,
        stored.size,
        filename.split('.').pop()?.toLowerCase() ?? null,
        stored.provider,
        (workflowPatch.project_id as string | undefined) ?? '',
        (workflowPatch.file_id as string | undefined) ?? '',
        (workflowPatch.job_id as string | undefined) ?? '',
        summaryText,
        summaryHtml,
        summaryStructured ? JSON.stringify(summaryStructured) : null,
        JSON.stringify({ ...(metadataPatch ?? {}), ...workflowPatch }),
      ],
    );
    return reply.code(201).send({
      fileKey: stored.key,
      fileSize: stored.size,
      storageProvider: stored.provider,
      projectId: workflowPatch.project_id ?? null,
      fileId: workflowPatch.file_id ?? null,
      jobId: workflowPatch.job_id ?? null,
      indexed: Boolean(workflowPatch.project_id || workflowPatch.file_id || workflowPatch.job_id),
      indexingError: workflowPatch.upload_workflow_error ?? null,
    });
  });

  app.post('/workflows/upload', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'patternUploads'))
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    const result = await callWorkflow('upload', {
      userId: request.authUser.id,
      payload: request.body,
    });
    return { result };
  });

  app.post('/workflows/library-proxy', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'patternUploads'))
      return reply.code(402).send({ error: 'Subscription required', entitlement });
    const result = await callWorkflow('library', {
      userId: request.authUser.id,
      payload: request.body,
    });
    return { result };
  });

  app.get('/patterns/:id/file-url', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      'SELECT file_url, file_key FROM user_patterns WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, request.authUser.id],
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Pattern not found' });
    const row = result.rows[0];
    if (row.file_key) {
      return {
        fileUrl: await signedPatternUrl(row.file_key, 900),
        fileKey: row.file_key,
        expiresIn: 900,
      };
    }
    return {
      fileUrl: row.file_url,
      fileKey: null,
      expiresIn: row.file_url ? null : 0,
    };
  });

  app.get('/patterns/:id/file', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `SELECT file_url, file_key, original_filename, file_mime_type
       FROM user_patterns
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, request.authUser.id],
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Pattern not found' });

    const row = result.rows[0];

    if (row.file_key) {
      const file = await getPatternFile(row.file_key);
      reply.header('content-type', row.file_mime_type ?? file.contentType ?? 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${safeDownloadFilename(row.original_filename)}"`);
      if (file.contentLength) {
        reply.header('content-length', String(file.contentLength));
      }
      return reply.send(file.body as never);
    }

    if (row.file_url) {
      return reply.redirect(String(row.file_url));
    }

    return reply.code(404).send({ error: 'No file is linked to this pattern yet' });
  });

  app.get('/patterns/:id/thumbnail', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query<{
      file_url: string | null;
      file_key: string | null;
      original_filename: string | null;
      file_mime_type: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT file_url, file_key, original_filename, file_mime_type, metadata
       FROM user_patterns
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, request.authUser.id],
    );
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Pattern not found' });
    }

    const row = result.rows[0];
    const metadata = row.metadata ?? {};
    const thumbnailUrl =
      (metadata.thumbnail_url as string | undefined) ?? (metadata.thumbnailUrl as string | undefined) ?? '';

    if (thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)) {
      return reply.redirect(thumbnailUrl);
    }

    const filename = row.original_filename ?? '';
    const mimeType = row.file_mime_type ?? '';
    const isPdf = mimeType.toLowerCase().includes('pdf') || /\.pdf$/i.test(filename);
    if (!isPdf) {
      return reply.code(404).send({ error: 'No PDF thumbnail is available for this pattern' });
    }

    try {
      const thumbnail = await renderPatternThumbnail({
        fileKey: row.file_key,
        fileUrl: row.file_url,
      });
      reply.header('content-type', 'image/jpeg');
      reply.header('cache-control', 'private, max-age=300');
      return reply.send(thumbnail);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate a PDF thumbnail.';
      return reply.code(502).send({ error: message });
    }
  });
}
