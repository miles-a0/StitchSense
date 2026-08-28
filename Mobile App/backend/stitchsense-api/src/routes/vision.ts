import type { FastifyInstance } from 'fastify';
import { hasFeature, resolveEntitlement } from '../services/entitlements.js';
import { callWorkflow } from '../services/workflows.js';
import { callWordPressImageProxy } from '../services/wordpressBridge.js';

const VISION_QUESTION_LIMIT = 1150;

function compactVisionQuestion(value: unknown) {
  const fallback = 'What stitch or issue is visible?';
  const text = typeof value === 'string' && value.trim() ? value : fallback;
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= VISION_QUESTION_LIMIT
    ? compact
    : compact.slice(0, VISION_QUESTION_LIMIT - 1).trimEnd();
}

export async function visionRoutes(app: FastifyInstance) {
  app.post('/vision/analyse', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'stitchVision')) return reply.code(402).send({ error: 'Subscription required', entitlement });

    const body = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
    const imageDataUri = body.image_data_uri ?? body.imageDataUri;
    const hasImageData = typeof imageDataUri === 'string' && imageDataUri.trim().startsWith('data:image/');
    const payload = {
      ...body,
      image_data_uri: imageDataUri,
      tool_mode: hasImageData ? 'stitch_image_analysis' : body.tool_mode ?? body.toolMode ?? 'stitch_image_analysis',
      requested_tool_mode: body.tool_mode ?? body.toolMode,
      question: compactVisionQuestion(body.question),
      skill_level: body.skill_level ?? body.skillLevel ?? 'beginner',
      user_id: request.authUser.id,
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
        return reply.code(502).send({ error: message });
      }
    }

    const result = await callWorkflow('image', payload);
    return reply.code(201).send({ result });
  });
}
