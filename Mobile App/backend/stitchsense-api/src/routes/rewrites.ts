import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hasFeature, resolveEntitlement } from '../services/entitlements.js';
import {
  buildEnglishWorkflowPrompt,
  buildScopedWorkflowUserId,
  englishOnlyInstruction,
  ownedSourceRequiredMessage,
  patternHasScopedContent,
  patternNeedsOwnedSource,
  selectedPatternUnavailableMessage,
} from '../services/patternWorkflowGuards.js';
import { callWorkflow } from '../services/workflows.js';
import { callWordPressChatProxy } from '../services/wordpressBridge.js';

const rewriteBody = z.object({
  patternId: z.string().uuid(),
  prompt: z.string().min(1),
});

const importRewriteBody = z.object({
  patternId: z.string().uuid(),
  prompt: z.string().optional(),
  rewriteResult: z.string().min(1),
  rewriteChanges: z.array(z.unknown()).optional(),
  rewriteWarnings: z.array(z.unknown()).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  createdAt: z.string().datetime().optional(),
});

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

function logRewriteRouting(
  request: FastifyRequest,
  details: {
    patternId: string;
    metadataOnlyBlocked?: boolean;
  },
) {
  request.log.info(
    {
      event: 'pattern_routing',
      clientSurface: resolveClientSurface(request),
      userId: request.authUser.id,
      toolMode: 'pattern_rewrite',
      patternId: details.patternId,
      sessionId: null,
      projectId: null,
      metadataOnlyBlocked: details.metadataOnlyBlocked ?? false,
    },
    'Resolved pattern-aware rewrite routing',
  );
}

export async function rewriteRoutes(app: FastifyInstance) {
  app.get('/patterns/:id/rewrites', { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await query('SELECT * FROM rewrite_sessions WHERE user_id = $1 AND pattern_id = $2 ORDER BY created_at DESC', [request.authUser.id, id]);
    return { rewrites: result.rows };
  });

  app.post('/rewrites', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'rewrite')) return reply.code(402).send({ error: 'Subscription required', entitlement });

    const body = rewriteBody.parse(request.body);
    const patternResult = await query<{
      id: string;
      source: string | null;
      file_url: string | null;
      file_key: string | null;
      project_id: string | null;
      file_id: string | null;
      job_id: string | null;
      title: string | null;
      pattern_summary_text: string | null;
      pattern_summary_html: string | null;
      pattern_summary_structured: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, source, file_url, file_key, project_id, file_id, job_id, title,
              pattern_summary_text, pattern_summary_html, pattern_summary_structured, metadata
       FROM user_patterns
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [body.patternId, request.authUser.id],
    );

    if (!patternResult.rowCount) {
      return reply.code(404).send({ error: 'Pattern not found' });
    }

    const pattern = patternResult.rows[0];
    if (
      patternNeedsOwnedSource({
        source: pattern.source,
        fileUrl: pattern.file_url,
        fileKey: pattern.file_key,
        fileId: pattern.file_id,
        jobId: pattern.job_id,
        metadata: pattern.metadata,
      })
    ) {
      logRewriteRouting(request, {
        patternId: body.patternId,
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
        metadata: pattern.metadata,
      })
    ) {
      logRewriteRouting(request, {
        patternId: body.patternId,
      });
      return reply.code(409).send({ error: selectedPatternUnavailableMessage() });
    }

    logRewriteRouting(request, {
      patternId: body.patternId,
    });

    const scopedWorkflowUserId = buildScopedWorkflowUserId(request.authUser.id, body.patternId);
    const englishPrompt = buildEnglishWorkflowPrompt(body.prompt);
    const workflowPayload = {
      action: 'chat',
      question: englishPrompt,
      prompt: englishPrompt,
      original_question: body.prompt,
      original_prompt: body.prompt,
      tool_mode: 'pattern_rewrite',
      toolMode: 'pattern_rewrite',
      answer_mode: 'pattern_priority',
      pattern_available: true,
      pattern_id: body.patternId,
      patternId: body.patternId,
      project_id: pattern.project_id ?? undefined,
      projectId: pattern.project_id ?? undefined,
      file_id: pattern.file_id ?? undefined,
      fileId: pattern.file_id ?? undefined,
      job_id: pattern.job_id ?? undefined,
      jobId: pattern.job_id ?? undefined,
      uploaded_pattern_title: pattern.title ?? undefined,
      uploaded_pattern_summary: pattern.pattern_summary_text ?? undefined,
      pattern_summary_text: pattern.pattern_summary_text ?? undefined,
      pattern_summary_html: pattern.pattern_summary_html ?? undefined,
      pattern_summary_structured: pattern.pattern_summary_structured ?? undefined,
      pattern_metadata: pattern.metadata ?? undefined,
      pattern_source: pattern.source ?? undefined,
      user_id: scopedWorkflowUserId,
      userId: scopedWorkflowUserId,
      platform_user_id: request.authUser.id,
      platformUserId: request.authUser.id,
      response_language: 'english',
      target_language: 'english',
      translation_target_language: 'english',
      locale: 'en-GB',
      system_instruction: englishOnlyInstruction(),
    };
    const workflow =
      (await callWordPressChatProxy(request.authUser.id, workflowPayload)) ??
      (await callWorkflow('chat', workflowPayload));
    const answer = typeof workflow === 'object' && workflow && 'answer' in workflow ? String((workflow as { answer: unknown }).answer) : JSON.stringify(workflow);
    const result = await query(
      `INSERT INTO rewrite_sessions (user_id, pattern_id, prompt, rewrite_result)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [request.authUser.id, body.patternId, body.prompt, answer],
    );
    return reply.code(201).send({ rewrite: result.rows[0], workflow });
  });

  app.post('/rewrites/import', { preHandler: app.authenticate }, async (request, reply) => {
    const body = importRewriteBody.parse(request.body);

    const pattern = await query<{ id: string }>('SELECT id FROM user_patterns WHERE id = $1 AND user_id = $2', [body.patternId, request.authUser.id]);
    if (!pattern.rowCount) {
      return reply.code(404).send({ error: 'Pattern not found' });
    }

    const result = await query(
      `INSERT INTO rewrite_sessions
       (user_id, pattern_id, prompt, rewrite_result, rewrite_changes, rewrite_warnings, confidence_score, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, NOW()))
       RETURNING *`,
      [
        request.authUser.id,
        body.patternId,
        body.prompt ?? null,
        body.rewriteResult,
        body.rewriteChanges ?? [],
        body.rewriteWarnings ?? [],
        body.confidenceScore ?? 0,
        body.createdAt ?? null,
      ],
    );

    return reply.code(201).send({ rewrite: result.rows[0], imported: true });
  });
}
