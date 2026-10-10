import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hasFeature, resolveEntitlement } from '../services/entitlements.js';
import {
  buildScopedWorkflowUserId,
  patternHasScopedContent,
  patternNeedsOwnedSource,
  selectedPatternUnavailableMessage,
  ownedSourceRequiredMessage,
} from '../services/patternWorkflowGuards.js';
import { callWorkflow } from '../services/workflows.js';
import { callWordPressImageProxy } from '../services/wordpressBridge.js';

const VISION_QUESTION_LIMIT = 1150;

const analyseVisionBody = z
  .object({
    question: z.string().optional(),
    image_data_uri: z.string().optional(),
    imageDataUri: z.string().optional(),
    mime_type: z.string().optional(),
    mimeType: z.string().optional(),
    skill_level: z.string().optional(),
    skillLevel: z.string().optional(),
    tool_mode: z.string().optional(),
    toolMode: z.string().optional(),
    pattern_id: z.string().uuid().optional(),
    patternId: z.string().uuid().optional(),
  })
  .strict();

type VisionPatternScope = {
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
};

function compactVisionQuestion(value: unknown) {
  const fallback = 'What stitch or issue is visible?';
  const text = typeof value === 'string' && value.trim() ? value : fallback;
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= VISION_QUESTION_LIMIT
    ? compact
    : compact.slice(0, VISION_QUESTION_LIMIT - 1).trimEnd();
}

function firstString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim();
}

async function resolveVisionPatternScope(userId: string, patternId: string) {
  const result = await query<VisionPatternScope>(
    `SELECT id, title, source, file_url, file_key, project_id, file_id, job_id,
            pattern_summary_text, pattern_summary_html, pattern_summary_structured, metadata
     FROM user_patterns
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [patternId, userId],
  );

  return result.rowCount ? result.rows[0] : null;
}

export async function visionRoutes(app: FastifyInstance) {
  app.post('/vision/analyse', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'stitchVision')) return reply.code(402).send({ error: 'Subscription required', entitlement });

    const body = analyseVisionBody.parse(request.body ?? {});
    const patternId = body.pattern_id ?? body.patternId;
    const pattern = patternId ? await resolveVisionPatternScope(request.authUser.id, patternId) : null;
    if (patternId && !pattern) {
      return reply.code(404).send({ error: 'Pattern not found' });
    }

    if (
      pattern &&
      patternNeedsOwnedSource({
        source: pattern.source,
        fileUrl: pattern.file_url,
        fileKey: pattern.file_key,
        fileId: pattern.file_id,
        jobId: pattern.job_id,
        metadata: pattern.metadata,
      })
    ) {
      return reply.code(409).send({ error: ownedSourceRequiredMessage() });
    }

    if (
      pattern &&
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
      return reply.code(409).send({ error: selectedPatternUnavailableMessage() });
    }

    const imageDataUri = body.image_data_uri ?? body.imageDataUri;
    const hasImageData = typeof imageDataUri === 'string' && imageDataUri.trim().startsWith('data:image/');
    const requestedToolMode = firstString(body.tool_mode, body.toolMode);
    const toolMode = hasImageData ? 'stitch_image_analysis' : requestedToolMode ?? 'stitch_image_analysis';
    const skillLevel = firstString(body.skill_level, body.skillLevel) ?? 'beginner';
    const mimeType = firstString(body.mime_type, body.mimeType);
    const scopedWorkflowUserId = buildScopedWorkflowUserId(request.authUser.id, pattern?.id);
    const payload = {
      image_data_uri: imageDataUri,
      imageDataUri,
      mime_type: mimeType,
      mimeType,
      tool_mode: toolMode,
      toolMode,
      requested_tool_mode: requestedToolMode,
      requestedToolMode,
      question: compactVisionQuestion(body.question),
      skill_level: skillLevel,
      skillLevel,
      answer_mode: pattern ? 'pattern_priority' : 'general_stitch_dictionary',
      pattern_available: Boolean(pattern),
      project_id: pattern?.project_id ?? undefined,
      projectId: pattern?.project_id ?? undefined,
      file_id: pattern?.file_id ?? undefined,
      fileId: pattern?.file_id ?? undefined,
      job_id: pattern?.job_id ?? undefined,
      jobId: pattern?.job_id ?? undefined,
      uploaded_pattern_title: pattern?.title ?? undefined,
      uploaded_pattern_summary: pattern?.pattern_summary_text ?? undefined,
      pattern_summary_text: pattern?.pattern_summary_text ?? undefined,
      pattern_summary_html: pattern?.pattern_summary_html ?? undefined,
      pattern_summary_structured: pattern?.pattern_summary_structured ?? undefined,
      pattern_metadata: pattern?.metadata ?? undefined,
      pattern_source: pattern?.source ?? undefined,
      pattern_id: pattern?.id ?? undefined,
      patternId: pattern?.id ?? undefined,
      user_id: scopedWorkflowUserId,
      userId: scopedWorkflowUserId,
      platform_user_id: request.authUser.id,
      platformUserId: request.authUser.id,
    };

    try {
      const bridgedResult = await callWordPressImageProxy(request.authUser.id, payload);
      if (bridgedResult) {
        return reply.code(201).send({ result: bridgedResult, source: 'wordpress-bridge' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'WordPress image proxy failed');
      request.log.warn(
        { err: message, userId: request.authUser.id },
        'WordPress image proxy failed; falling back to direct workflow',
      );

      if (!/404|not found/i.test(message)) {
        return reply.code(502).send({
          error: 'StitchSense could not reach the image analysis service. Please try again.',
          requestId: request.id,
        });
      }
    }

    const result = await callWorkflow('image', payload);
    return reply.code(201).send({ result });
  });
}
