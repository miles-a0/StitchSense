import type { FastifyInstance } from 'fastify';
import { getPatternFile, storageLinkPath, verifyStorageLink } from '../services/storage.js';

// Only types the upload routes store are served; anything else is sent as a download.
const inlineContentTypes = new Set([
  'application/pdf',
  'text/plain',
  'text/plain; charset=utf-8',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function isMissingObject(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

export async function fileRoutes(app: FastifyInstance) {
  // Access is granted by the signature, issued only after the owning route checked ownership.
  app.get(storageLinkPath, async (request, reply) => {
    const { k, e, s } = request.query as Record<string, unknown>;
    const key = verifyStorageLink(k, e, s);
    if (!key) {
      return reply.code(403).send({ error: 'This file link has expired or is not valid. Please open it again.' });
    }

    let file: Awaited<ReturnType<typeof getPatternFile>>;
    try {
      file = await getPatternFile(key);
    } catch (error) {
      if (isMissingObject(error)) return reply.code(404).send({ error: 'File not found' });
      throw error;
    }

    const contentType = file.contentType.toLowerCase();
    if (inlineContentTypes.has(contentType)) {
      reply.header('content-type', file.contentType);
      reply.header('content-disposition', 'inline');
    } else {
      reply.header('content-type', 'application/octet-stream');
      reply.header('content-disposition', 'attachment');
    }
    if (file.contentLength) {
      reply.header('content-length', String(file.contentLength));
    }
    reply.header('cache-control', 'private, max-age=300');
    reply.header('referrer-policy', 'no-referrer');
    return reply.send(file.body as never);
  });
}
