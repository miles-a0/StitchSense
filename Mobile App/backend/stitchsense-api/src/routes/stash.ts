import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { getPatternFile, putStashPhoto, signedStorageUrl } from '../services/storage.js';

const stashCategory = z.enum(['yarn', 'needle-hook', 'tool']);

const stashBody = z.object({
  category: stashCategory,
  name: z.string().min(1).max(180),
  quantity: z.string().max(80).optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  brand: z.string().max(160).optional().nullable(),
  yarnWeight: z.string().max(80).optional().nullable(),
  fibre: z.string().max(160).optional().nullable(),
  colour: z.string().max(120).optional().nullable(),
  dyeLot: z.string().max(120).optional().nullable(),
  size: z.string().max(80).optional().nullable(),
  material: z.string().max(120).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  reservedFor: z.string().max(160).optional().nullable(),
  notes: z.string().max(3000).optional().nullable(),
});

const stashUpdateBody = stashBody.partial().extend({
  category: stashCategory.optional(),
  name: z.string().min(1).max(180).optional(),
});

function detectImageMimeType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function stashSelect(whereClause: string) {
  return `
    SELECT
      id,
      user_id,
      category,
      name,
      quantity,
      unit,
      brand,
      yarn_weight,
      fibre,
      colour,
      dye_lot,
      size,
      material,
      location,
      reserved_for,
      notes,
      image_file_key,
      image_mime_type,
      image_file_size,
      metadata,
      created_at,
      updated_at
    FROM stash_items
    ${whereClause}
  `;
}

async function decorateStashItem<T extends { id: string; image_file_key?: string | null }>(row: T) {
  return {
    ...row,
    image_url: row.image_file_key ? await signedStorageUrl(row.image_file_key, 900) : null,
  };
}

async function ensureOwnedStashItem(userId: string, itemId: string) {
  const result = await query<{ id: string; image_file_key: string | null; image_mime_type: string | null }>(
    `SELECT id, image_file_key, image_mime_type
     FROM stash_items
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL`,
    [itemId, userId],
  );
  return result.rows[0] ?? null;
}

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function trimmedNullable(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : null;
}

export async function stashRoutes(app: FastifyInstance) {
  app.get('/stash', { preHandler: app.authenticate }, async (request) => {
    const input =
      typeof request.query === 'object' && request.query
        ? (request.query as { category?: string; search?: string })
        : {};
    const category = String(input.category ?? '').trim() || null;
    const search = String(input.search ?? '').trim() || null;

    const result = await query(
      `${stashSelect(
        `WHERE user_id = $1
           AND deleted_at IS NULL
           AND ($2::text IS NULL OR category = $2)
           AND (
             $3::text IS NULL
             OR name ILIKE '%' || $3 || '%'
             OR COALESCE(brand, '') ILIKE '%' || $3 || '%'
             OR COALESCE(yarn_weight, '') ILIKE '%' || $3 || '%'
             OR COALESCE(fibre, '') ILIKE '%' || $3 || '%'
             OR COALESCE(colour, '') ILIKE '%' || $3 || '%'
             OR COALESCE(size, '') ILIKE '%' || $3 || '%'
             OR COALESCE(material, '') ILIKE '%' || $3 || '%'
             OR COALESCE(notes, '') ILIKE '%' || $3 || '%'
           )`,
      )}
       ORDER BY updated_at DESC`,
      [request.authUser.id, category, search],
    );

    return { items: await Promise.all(result.rows.map((row) => decorateStashItem(row as { id: string; image_file_key?: string | null }))) };
  });

  app.post('/stash', { preHandler: app.authenticate }, async (request, reply) => {
    const body = stashBody.parse(request.body);
    const result = await query(
      `INSERT INTO stash_items (
         user_id, category, name, quantity, unit, brand, yarn_weight, fibre, colour, dye_lot,
         size, material, location, reserved_for, notes
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        request.authUser.id,
        body.category,
        body.name.trim(),
        body.quantity?.trim() || null,
        body.unit?.trim() || null,
        body.brand?.trim() || null,
        body.yarnWeight?.trim() || null,
        body.fibre?.trim() || null,
        body.colour?.trim() || null,
        body.dyeLot?.trim() || null,
        body.size?.trim() || null,
        body.material?.trim() || null,
        body.location?.trim() || null,
        body.reservedFor?.trim() || null,
        body.notes?.trim() || null,
      ],
    );

    return reply.code(201).send({ item: await decorateStashItem(result.rows[0] as { id: string; image_file_key?: string | null }) });
  });

  app.put('/stash/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const owned = await ensureOwnedStashItem(request.authUser.id, id);
    if (!owned) {
      return reply.code(404).send({ error: 'Stash item not found' });
    }

    const body = stashUpdateBody.parse(request.body);
    const rawBody = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
    const result = await query(
      `UPDATE stash_items
       SET category = COALESCE($3, category),
           name = COALESCE($4, name),
           quantity = CASE WHEN $5::boolean THEN $6 ELSE quantity END,
           unit = CASE WHEN $7::boolean THEN $8 ELSE unit END,
           brand = CASE WHEN $9::boolean THEN $10 ELSE brand END,
           yarn_weight = CASE WHEN $11::boolean THEN $12 ELSE yarn_weight END,
           fibre = CASE WHEN $13::boolean THEN $14 ELSE fibre END,
           colour = CASE WHEN $15::boolean THEN $16 ELSE colour END,
           dye_lot = CASE WHEN $17::boolean THEN $18 ELSE dye_lot END,
           size = CASE WHEN $19::boolean THEN $20 ELSE size END,
           material = CASE WHEN $21::boolean THEN $22 ELSE material END,
           location = CASE WHEN $23::boolean THEN $24 ELSE location END,
           reserved_for = CASE WHEN $25::boolean THEN $26 ELSE reserved_for END,
           notes = CASE WHEN $27::boolean THEN $28 ELSE notes END,
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        request.authUser.id,
        body.category ?? null,
        body.name?.trim() || null,
        hasOwn(rawBody, 'quantity'),
        trimmedNullable(body.quantity),
        hasOwn(rawBody, 'unit'),
        trimmedNullable(body.unit),
        hasOwn(rawBody, 'brand'),
        trimmedNullable(body.brand),
        hasOwn(rawBody, 'yarnWeight'),
        trimmedNullable(body.yarnWeight),
        hasOwn(rawBody, 'fibre'),
        trimmedNullable(body.fibre),
        hasOwn(rawBody, 'colour'),
        trimmedNullable(body.colour),
        hasOwn(rawBody, 'dyeLot'),
        trimmedNullable(body.dyeLot),
        hasOwn(rawBody, 'size'),
        trimmedNullable(body.size),
        hasOwn(rawBody, 'material'),
        trimmedNullable(body.material),
        hasOwn(rawBody, 'location'),
        trimmedNullable(body.location),
        hasOwn(rawBody, 'reservedFor'),
        trimmedNullable(body.reservedFor),
        hasOwn(rawBody, 'notes'),
        trimmedNullable(body.notes),
      ],
    );

    return { item: await decorateStashItem(result.rows[0] as { id: string; image_file_key?: string | null }) };
  });

  app.post('/stash/:id/image', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const owned = await ensureOwnedStashItem(request.authUser.id, id);
    if (!owned) {
      return reply.code(404).send({ error: 'Stash item not found' });
    }

    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let filename = 'stash-photo.jpg';

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename || filename;
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'No image uploaded' });
    }

    const detectedMimeType = detectImageMimeType(fileBuffer);
    if (!detectedMimeType) {
      return reply.code(415).send({ error: 'Please upload a JPEG, PNG, or WebP image.' });
    }

    const stored = await putStashPhoto({
      userId: request.authUser.id,
      stashItemId: id,
      filename,
      contentType: detectedMimeType,
      buffer: fileBuffer,
    });

    const result = await query(
      `UPDATE stash_items
       SET image_file_key = $3,
           image_mime_type = $4,
           image_file_size = $5,
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       RETURNING *`,
      [id, request.authUser.id, stored.key, detectedMimeType, stored.size],
    );

    return { item: await decorateStashItem(result.rows[0] as { id: string; image_file_key?: string | null }) };
  });

  app.get('/stash/:id/image', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const owned = await ensureOwnedStashItem(request.authUser.id, id);
    if (!owned?.image_file_key) {
      return reply.code(404).send({ error: 'Stash image not found' });
    }

    const file = await getPatternFile(owned.image_file_key);
    reply.header('content-type', owned.image_mime_type ?? file.contentType ?? 'image/jpeg');
    if (file.contentLength) {
      reply.header('content-length', String(file.contentLength));
    }
    reply.header('cache-control', 'private, max-age=300');
    return reply.send(file.body as never);
  });

  app.delete('/stash/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `UPDATE stash_items
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       RETURNING id`,
      [id, request.authUser.id],
    );
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Stash item not found' });
    }
    return reply.code(204).send();
  });
}
