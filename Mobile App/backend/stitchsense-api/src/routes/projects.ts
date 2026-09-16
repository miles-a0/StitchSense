import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { getPatternFile, putProjectPhoto, signedStorageUrl } from '../services/storage.js';

const projectStatus = z.enum(['planned', 'active', 'paused', 'completed', 'archived']);
const projectProgressMode = z.enum(['percent', 'rows', 'rounds', 'motifs', 'sections']);
const projectCounterType = z.enum(['rows', 'rounds', 'repeats', 'sections', 'motifs', 'custom']);
const projectLogType = z.enum(['note', 'progress', 'session', 'milestone']);
const projectMarkType = z.enum(['resume', 'bookmark', 'annotation']);

const projectCreateBody = z.object({
  patternId: z.string().uuid(),
  title: z.string().min(1).max(160).optional(),
  craftType: z.string().max(80).optional().nullable(),
  status: projectStatus.optional(),
  stageLabel: z.string().min(1).max(120).optional(),
  progressMode: projectProgressMode.optional(),
  progressValue: z.number().optional().nullable(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  recipient: z.string().max(160).optional().nullable(),
  isGift: z.boolean().optional(),
  occasion: z.string().max(160).optional().nullable(),
  deadlineAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  yarnDetails: z.string().max(400).optional().nullable(),
  needleHookDetails: z.string().max(240).optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  isFavorite: z.boolean().optional(),
});

const projectUpdateBody = projectCreateBody
  .omit({ patternId: true })
  .extend({
    title: z.string().min(1).max(160).optional(),
    stageLabel: z.string().min(1).max(120).optional(),
    lastWorkedAt: z.string().datetime().optional().nullable(),
    completedAt: z.string().datetime().optional().nullable(),
  });

const projectCounterCreateBody = z.object({
  label: z.string().min(1).max(120),
  counterType: projectCounterType.optional(),
  currentValue: z.number().int().min(0).optional(),
  targetValue: z.number().int().min(0).optional().nullable(),
  stepValue: z.number().int().min(1).max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
});

const projectCounterUpdateBody = projectCounterCreateBody.partial();

const projectLogCreateBody = z.object({
  entryType: projectLogType.optional(),
  title: z.string().min(1).max(140).optional(),
  body: z.string().optional().nullable(),
  progressPercent: z.number().int().min(0).max(100).optional().nullable(),
  minutesSpent: z.number().int().min(0).max(1440).optional().nullable(),
});

const projectPhotoCreateBody = z.object({
  caption: z.string().max(240).optional().nullable(),
  takenAt: z.string().datetime().optional().nullable(),
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

const projectMarkCreateBody = z.object({
  type: projectMarkType,
  label: z.string().min(1).max(140).optional(),
  pageNumber: z.number().int().min(1).optional().nullable(),
  locationLabel: z.string().max(160).optional().nullable(),
  note: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

async function ensureOwnedProject(userId: string, projectId: string) {
  const result = await query<{ id: string; pattern_id: string }>(
    `SELECT id, pattern_id
     FROM projects
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL`,
    [projectId, userId],
  );

  return result.rows[0] ?? null;
}

async function ensureOwnedPattern(userId: string, patternId: string) {
  const result = await query<{
    id: string;
    title: string;
    craft_type: string | null;
    source: string | null;
    original_filename: string | null;
    file_mime_type: string | null;
    updated_at: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, title, craft_type, source, original_filename, file_mime_type, updated_at, metadata
     FROM user_patterns
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL`,
    [patternId, userId],
  );

  return result.rows[0] ?? null;
}

function projectSelectSql(whereClause: string) {
  return `
    SELECT
      p.*,
      up.title AS linked_pattern_title,
      up.craft_type AS linked_pattern_craft_type,
      up.original_filename AS linked_pattern_original_filename,
      up.file_mime_type AS linked_pattern_file_mime_type,
      up.source AS linked_pattern_source,
      up.updated_at AS linked_pattern_updated_at,
      COALESCE(up.metadata->>'thumbnail_url', NULL) AS linked_pattern_thumbnail_url,
      counter_summary.top_counter_label,
      counter_summary.top_counter_type,
      counter_summary.top_counter_current_value,
      counter_summary.top_counter_target_value,
      work_log_summary.latest_log_title,
      work_log_summary.latest_log_body,
      work_log_summary.latest_log_created_at,
      photo_summary.latest_photo_key,
      photo_summary.latest_photo_id,
      photo_summary.latest_photo_url,
      photo_summary.latest_photo_taken_at
    FROM projects p
    JOIN user_patterns up
      ON up.id = p.pattern_id
     AND up.user_id = p.user_id
     AND up.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT
        pc.label AS top_counter_label,
        pc.counter_type AS top_counter_type,
        pc.current_value AS top_counter_current_value,
        pc.target_value AS top_counter_target_value
      FROM project_counters pc
      WHERE pc.project_id = p.id
        AND pc.user_id = p.user_id
        AND pc.deleted_at IS NULL
      ORDER BY pc.sort_order ASC, pc.created_at ASC
      LIMIT 1
    ) AS counter_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        wl.title AS latest_log_title,
        wl.body AS latest_log_body,
        wl.created_at AS latest_log_created_at
      FROM project_work_log wl
      WHERE wl.project_id = p.id
        AND wl.user_id = p.user_id
        AND wl.deleted_at IS NULL
      ORDER BY wl.created_at DESC
      LIMIT 1
    ) AS work_log_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        pp.id AS latest_photo_id,
        pp.file_key AS latest_photo_key,
        pp.taken_at AS latest_photo_taken_at,
        NULL::text AS latest_photo_url
      FROM project_photos pp
      WHERE pp.project_id = p.id
        AND pp.user_id = p.user_id
        AND pp.deleted_at IS NULL
      ORDER BY pp.taken_at DESC, pp.created_at DESC
      LIMIT 1
    ) AS photo_summary ON TRUE
    ${whereClause}
  `;
}

async function withSignedProjectMedia<T extends Record<string, unknown>>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      latest_photo_url:
        typeof row.latest_photo_key === 'string' && row.latest_photo_key
          ? await signedStorageUrl(row.latest_photo_key, 900)
          : null,
    })),
  );
}

async function withSignedProjectPhoto<T extends { file_key?: string | null }>(row: T) {
  return {
    ...row,
    photo_url: row.file_key ? await signedStorageUrl(row.file_key, 900) : null,
  };
}

async function selectOwnedProjectRows(userId: string, projectId: string) {
  const result = await query(
    `${projectSelectSql(
      `WHERE p.id = $1
         AND p.user_id = $2
         AND p.deleted_at IS NULL`,
    )}`,
    [projectId, userId],
  );

  return result.rows;
}

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: app.authenticate }, async (request) => {
    const input =
      typeof request.query === 'object' && request.query
        ? (request.query as {
            search?: string;
            status?: string;
            patternId?: string;
          })
        : {};

    const search = String(input.search ?? '').trim() || null;
    const status = String(input.status ?? '').trim() || null;
    const patternId = String(input.patternId ?? '').trim() || null;

    const result = await query(
      `${projectSelectSql(
        `WHERE p.user_id = $1
           AND p.deleted_at IS NULL
           AND ($2::text IS NULL OR p.status = $2)
           AND ($3::uuid IS NULL OR p.pattern_id = $3)
           AND (
             $4::text IS NULL
             OR p.title ILIKE '%' || $4 || '%'
             OR COALESCE(p.recipient, '') ILIKE '%' || $4 || '%'
             OR COALESCE(p.occasion, '') ILIKE '%' || $4 || '%'
             OR COALESCE(p.notes, '') ILIKE '%' || $4 || '%'
             OR up.title ILIKE '%' || $4 || '%'
           )`,
      )}
       ORDER BY p.is_favorite DESC, p.updated_at DESC`,
      [request.authUser.id, status, patternId, search],
    );

    return { projects: await withSignedProjectMedia(result.rows) };
  });

  app.post('/projects', { preHandler: app.authenticate }, async (request, reply) => {
    const body = projectCreateBody.parse(request.body);
    const pattern = await ensureOwnedPattern(request.authUser.id, body.patternId);
    if (!pattern) {
      return reply.code(404).send({ error: 'Linked pattern not found' });
    }

    const inserted = await query<{ id: string }>(
      `INSERT INTO projects (
          user_id,
          pattern_id,
          title,
          craft_type,
          status,
          stage_label,
          progress_mode,
          progress_value,
          progress_percent,
          recipient,
          is_gift,
          occasion,
          deadline_at,
          notes,
          yarn_details,
          needle_hook_details,
          cover_image_url,
          is_favorite,
          last_worked_at,
          completed_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),
          CASE WHEN $5 = 'completed' THEN NOW() ELSE NULL END
        )
        RETURNING id`,
      [
        request.authUser.id,
        body.patternId,
        body.title?.trim() || pattern.title,
        body.craftType?.trim() || pattern.craft_type,
        body.status ?? 'active',
        body.stageLabel?.trim() || 'Getting started',
        body.progressMode ?? 'percent',
        body.progressValue ?? null,
        body.progressPercent ?? 0,
        body.recipient?.trim() || null,
        body.isGift ?? false,
        body.occasion?.trim() || null,
        body.deadlineAt ?? null,
        body.notes?.trim() || null,
        body.yarnDetails?.trim() || null,
        body.needleHookDetails?.trim() || null,
        body.coverImageUrl ?? null,
        body.isFavorite ?? false,
      ],
    );

    const rows = await selectOwnedProjectRows(request.authUser.id, inserted.rows[0].id);
    return reply.code(201).send({ project: (await withSignedProjectMedia(rows))[0] });
  });

  app.get('/projects/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await selectOwnedProjectRows(request.authUser.id, id);
    if (!rows.length) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return { project: (await withSignedProjectMedia(rows))[0] };
  });

  app.get('/projects/:id/sync-validation', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query<{
      id: string;
      title: string;
      pattern_id: string;
      status: string;
      progress_percent: number;
      updated_at: string | null;
      deleted_at: string | null;
      linked_pattern_exists: boolean;
      counters_count: number;
      work_log_count: number;
      photos_count: number;
      marks_count: number;
    }>(
      `SELECT
         p.id,
         p.title,
         p.pattern_id,
         p.status,
         p.progress_percent,
         p.updated_at,
         p.deleted_at,
         EXISTS (
           SELECT 1
           FROM user_patterns up
           WHERE up.id = p.pattern_id
             AND up.user_id = p.user_id
             AND up.deleted_at IS NULL
         ) AS linked_pattern_exists,
         (
           SELECT COUNT(*)::int
           FROM project_counters pc
           WHERE pc.project_id = p.id
             AND pc.user_id = p.user_id
             AND pc.deleted_at IS NULL
         ) AS counters_count,
         (
           SELECT COUNT(*)::int
           FROM project_work_log wl
           WHERE wl.project_id = p.id
             AND wl.user_id = p.user_id
             AND wl.deleted_at IS NULL
         ) AS work_log_count,
         (
           SELECT COUNT(*)::int
           FROM project_photos pp
           WHERE pp.project_id = p.id
             AND pp.user_id = p.user_id
             AND pp.deleted_at IS NULL
         ) AS photos_count,
         (
           SELECT COUNT(*)::int
           FROM project_pattern_marks pm
           WHERE pm.project_id = p.id
             AND pm.user_id = p.user_id
             AND pm.deleted_at IS NULL
         ) AS marks_count
       FROM projects p
       WHERE p.id = $1
         AND p.user_id = $2
       LIMIT 1`,
      [id, request.authUser.id],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const project = result.rows[0];
    return {
      serverTime: new Date().toISOString(),
      project: {
        id: project.id,
        title: project.title,
        patternId: project.pattern_id,
        status: project.status,
        progressPercent: project.progress_percent,
        updatedAt: project.updated_at,
        deletedAt: project.deleted_at,
        activeOnPlatform: project.deleted_at === null,
        linkedPatternExists: project.linked_pattern_exists,
      },
      childRecords: {
        counters: Number(project.counters_count ?? 0),
        workLogEntries: Number(project.work_log_count ?? 0),
        photos: Number(project.photos_count ?? 0),
        marks: Number(project.marks_count ?? 0),
      },
      checks: {
        createVisibleInPlatform: project.deleted_at === null,
        updateTimestampPresent: Boolean(project.updated_at),
        deleteSoftStateConsistent: project.deleted_at === null || Boolean(project.deleted_at),
        linkedPatternIntegrity: project.linked_pattern_exists,
      },
    };
  });

  app.put('/projects/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = projectUpdateBody.parse(request.body);

    const updated = await query<{ id: string }>(
      `UPDATE projects
       SET title = COALESCE($3, title),
           craft_type = COALESCE($4, craft_type),
           status = COALESCE($5, status),
           stage_label = COALESCE($6, stage_label),
           progress_mode = COALESCE($7, progress_mode),
           progress_value = CASE WHEN $8::numeric IS NULL THEN progress_value ELSE $8 END,
           progress_percent = COALESCE($9, progress_percent),
           recipient = CASE WHEN $10::text IS NULL THEN recipient ELSE $10 END,
           is_gift = COALESCE($11, is_gift),
           occasion = CASE WHEN $12::text IS NULL THEN occasion ELSE $12 END,
           deadline_at = CASE WHEN $13::timestamptz IS NULL THEN deadline_at ELSE $13 END,
           notes = CASE WHEN $14::text IS NULL THEN notes ELSE $14 END,
           yarn_details = CASE WHEN $15::text IS NULL THEN yarn_details ELSE $15 END,
           needle_hook_details = CASE WHEN $16::text IS NULL THEN needle_hook_details ELSE $16 END,
           cover_image_url = CASE WHEN $17::text IS NULL THEN cover_image_url ELSE $17 END,
           is_favorite = COALESCE($18, is_favorite),
           last_worked_at = COALESCE($19, last_worked_at, NOW()),
           completed_at = CASE
             WHEN COALESCE($5, status) = 'completed' THEN COALESCE($20, completed_at, NOW())
             WHEN COALESCE($5, status) <> 'completed' THEN NULL
             ELSE completed_at
           END,
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       RETURNING id`,
      [
        id,
        request.authUser.id,
        body.title?.trim() || null,
        body.craftType?.trim() || null,
        body.status ?? null,
        body.stageLabel?.trim() || null,
        body.progressMode ?? null,
        body.progressValue ?? null,
        body.progressPercent ?? null,
        body.recipient?.trim() || null,
        body.isGift ?? null,
        body.occasion?.trim() || null,
        body.deadlineAt ?? null,
        body.notes?.trim() || null,
        body.yarnDetails?.trim() || null,
        body.needleHookDetails?.trim() || null,
        body.coverImageUrl ?? null,
        body.isFavorite ?? null,
        body.lastWorkedAt ?? null,
        body.completedAt ?? null,
      ],
    );

    if (!updated.rowCount) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    const rows = await selectOwnedProjectRows(request.authUser.id, updated.rows[0].id);
    return { project: (await withSignedProjectMedia(rows))[0] };
  });

  app.delete('/projects/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `UPDATE projects
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       RETURNING id`,
      [id, request.authUser.id],
    );
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return reply.code(204).send();
  });

  app.get('/projects/:id/photos', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `SELECT id, project_id, user_id, file_key, file_mime_type, file_size, caption, taken_at, created_at, updated_at
       FROM project_photos
       WHERE project_id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       ORDER BY taken_at DESC, created_at DESC`,
      [id, request.authUser.id],
    );

    const photos = await Promise.all(
      result.rows.map((row) => withSignedProjectPhoto(row as { file_key?: string | null })),
    );

    return { photos };
  });

  app.post('/projects/:id/photos', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let filename = 'project-photo.jpg';
    const meta: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename || filename;
      } else {
        meta[part.fieldname] = String(part.value ?? '');
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'No image uploaded' });
    }

    const detectedMimeType = detectImageMimeType(fileBuffer);
    if (!detectedMimeType) {
      return reply.code(415).send({ error: 'Please upload a JPEG, PNG, or WebP image.' });
    }

    const body = projectPhotoCreateBody.parse({
      caption: meta.caption ?? null,
      takenAt: meta.takenAt ?? null,
    });

    const stored = await putProjectPhoto({
      userId: request.authUser.id,
      projectId: id,
      filename,
      contentType: detectedMimeType,
      buffer: fileBuffer,
    });

    const result = await query(
      `INSERT INTO project_photos (
          project_id, user_id, file_key, file_mime_type, file_size, caption, taken_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))
        RETURNING id, project_id, user_id, file_key, file_mime_type, file_size, caption, taken_at, created_at, updated_at`,
      [
        id,
        request.authUser.id,
        stored.key,
        detectedMimeType,
        stored.size,
        body.caption?.trim() || null,
        body.takenAt ?? null,
      ],
    );

    await query(
      `UPDATE projects
       SET last_worked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, request.authUser.id],
    );

    const photo = result.rows[0];
    return reply.code(201).send({
      photo: await withSignedProjectPhoto(photo as { file_key?: string | null }),
    });
  });

  app.get('/projects/:id/photos/:photoId/file', { preHandler: app.authenticate }, async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query<{
      file_key: string;
      file_mime_type: string | null;
    }>(
      `SELECT file_key, file_mime_type
       FROM project_photos
       WHERE id = $1
         AND project_id = $2
         AND user_id = $3
         AND deleted_at IS NULL`,
      [photoId, id, request.authUser.id],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Project photo not found' });
    }

    const row = result.rows[0];
    const file = await getPatternFile(row.file_key);
    reply.header('content-type', row.file_mime_type ?? file.contentType ?? 'image/jpeg');
    if (file.contentLength) {
      reply.header('content-length', String(file.contentLength));
    }
    reply.header('cache-control', 'private, max-age=300');
    return reply.send(file.body as never);
  });

  app.delete('/projects/:id/photos/:photoId', { preHandler: app.authenticate }, async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `UPDATE project_photos
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND project_id = $2
         AND user_id = $3
         AND deleted_at IS NULL
       RETURNING id`,
      [photoId, id, request.authUser.id],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Project photo not found' });
    }

    await query(`UPDATE projects SET updated_at = NOW() WHERE id = $1 AND user_id = $2`, [
      id,
      request.authUser.id,
    ]);

    return reply.code(204).send();
  });

  app.get('/projects/:id/marks', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `SELECT id, project_id, user_id, pattern_id, mark_type, label, page_number, location_label, note, sort_order, created_at, updated_at
       FROM project_pattern_marks
       WHERE project_id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       ORDER BY
         CASE WHEN mark_type = 'resume' THEN 0 ELSE 1 END,
         sort_order ASC,
         created_at DESC`,
      [id, request.authUser.id],
    );

    return { marks: result.rows };
  });

  app.post('/projects/:id/marks', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const body = projectMarkCreateBody.parse(request.body);
    const label =
      body.label?.trim() ||
      (body.type === 'resume'
        ? 'Reading position'
        : body.pageNumber
          ? `Page ${body.pageNumber}`
          : body.locationLabel?.trim() || 'Pattern note');

    let result;

    if (body.type === 'resume') {
      result = await query(
        `WITH updated AS (
           UPDATE project_pattern_marks
           SET label = $4,
               page_number = $5,
               location_label = $6,
               note = $7,
               updated_at = NOW()
           WHERE project_id = $1
             AND user_id = $2
             AND mark_type = 'resume'
             AND deleted_at IS NULL
           RETURNING id, project_id, user_id, pattern_id, mark_type, label, page_number, location_label, note, sort_order, created_at, updated_at
         ), inserted AS (
           INSERT INTO project_pattern_marks (
             project_id, user_id, pattern_id, mark_type, label, page_number, location_label, note, sort_order
           )
           SELECT $1, $2, $3, 'resume', $4, $5, $6, $7, 0
           WHERE NOT EXISTS (SELECT 1 FROM updated)
           RETURNING id, project_id, user_id, pattern_id, mark_type, label, page_number, location_label, note, sort_order, created_at, updated_at
         )
         SELECT * FROM updated
         UNION ALL
         SELECT * FROM inserted`,
        [
          id,
          request.authUser.id,
          ownedProject.pattern_id,
          label,
          body.pageNumber ?? null,
          body.locationLabel?.trim() || null,
          body.note?.trim() || null,
        ],
      );
    } else {
      result = await query(
        `INSERT INTO project_pattern_marks (
           project_id, user_id, pattern_id, mark_type, label, page_number, location_label, note, sort_order
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, project_id, user_id, pattern_id, mark_type, label, page_number, location_label, note, sort_order, created_at, updated_at`,
        [
          id,
          request.authUser.id,
          ownedProject.pattern_id,
          body.type,
          label,
          body.pageNumber ?? null,
          body.locationLabel?.trim() || null,
          body.note?.trim() || null,
          body.sortOrder ?? 0,
        ],
      );
    }

    await query(`UPDATE projects SET last_worked_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    return reply.code(201).send({ mark: result.rows[0] });
  });

  app.delete('/projects/:id/marks/:markId', { preHandler: app.authenticate }, async (request, reply) => {
    const { id, markId } = request.params as { id: string; markId: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `UPDATE project_pattern_marks
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND project_id = $2
         AND user_id = $3
         AND deleted_at IS NULL
       RETURNING id`,
      [markId, id, request.authUser.id],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Project mark not found' });
    }

    await query(`UPDATE projects SET updated_at = NOW() WHERE id = $1 AND user_id = $2`, [
      id,
      request.authUser.id,
    ]);

    return reply.code(204).send();
  });

  app.get('/projects/:id/counters', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `SELECT *
       FROM project_counters
       WHERE project_id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [id, request.authUser.id],
    );

    return { counters: result.rows };
  });

  app.post('/projects/:id/counters', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = projectCounterCreateBody.parse(request.body);
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `INSERT INTO project_counters (
          project_id, user_id, label, counter_type, current_value, target_value, step_value, sort_order, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *`,
      [
        id,
        request.authUser.id,
        body.label.trim(),
        body.counterType ?? 'custom',
        body.currentValue ?? 0,
        body.targetValue ?? null,
        body.stepValue ?? 1,
        body.sortOrder ?? 0,
        body.notes?.trim() || null,
      ],
    );

    await query(`UPDATE projects SET last_worked_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    return reply.code(201).send({ counter: result.rows[0] });
  });

  app.put('/projects/:id/counters/:counterId', { preHandler: app.authenticate }, async (request, reply) => {
    const { id, counterId } = request.params as { id: string; counterId: string };
    const body = projectCounterUpdateBody.parse(request.body);
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `UPDATE project_counters
       SET label = COALESCE($4, label),
           counter_type = COALESCE($5, counter_type),
           current_value = COALESCE($6, current_value),
           target_value = CASE WHEN $7::int IS NULL THEN target_value ELSE $7 END,
           step_value = COALESCE($8, step_value),
           sort_order = COALESCE($9, sort_order),
           notes = CASE WHEN $10::text IS NULL THEN notes ELSE $10 END,
           updated_at = NOW()
       WHERE id = $1
         AND project_id = $2
         AND user_id = $3
         AND deleted_at IS NULL
       RETURNING *`,
      [
        counterId,
        id,
        request.authUser.id,
        body.label?.trim() || null,
        body.counterType ?? null,
        body.currentValue ?? null,
        body.targetValue ?? null,
        body.stepValue ?? null,
        body.sortOrder ?? null,
        body.notes?.trim() || null,
      ],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Counter not found' });
    }

    await query(`UPDATE projects SET last_worked_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    return { counter: result.rows[0] };
  });

  app.delete('/projects/:id/counters/:counterId', { preHandler: app.authenticate }, async (request, reply) => {
    const { id, counterId } = request.params as { id: string; counterId: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `UPDATE project_counters
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND project_id = $2
         AND user_id = $3
         AND deleted_at IS NULL
       RETURNING id`,
      [counterId, id, request.authUser.id],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Counter not found' });
    }

    await query(`UPDATE projects SET last_worked_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    return reply.code(204).send();
  });

  app.get('/projects/:id/work-log', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `SELECT *
       FROM project_work_log
       WHERE project_id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id, request.authUser.id],
    );

    return { entries: result.rows };
  });

  app.post('/projects/:id/work-log', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = projectLogCreateBody.parse(request.body);
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `WITH entry AS (
          INSERT INTO project_work_log (
            project_id, user_id, entry_type, title, body, progress_percent, minutes_spent
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING *
        ),
        project_update AS (
          UPDATE projects
          SET progress_percent = COALESCE($6, progress_percent),
              last_worked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
          RETURNING id
        )
        SELECT * FROM entry`,
      [
        id,
        request.authUser.id,
        body.entryType ?? 'note',
        body.title?.trim() || 'Update',
        body.body?.trim() || null,
        body.progressPercent ?? null,
        body.minutesSpent ?? null,
      ],
    );

    return reply.code(201).send({ entry: result.rows[0] });
  });

  app.delete('/projects/:id/work-log/:entryId', { preHandler: app.authenticate }, async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const ownedProject = await ensureOwnedProject(request.authUser.id, id);
    if (!ownedProject) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await query(
      `UPDATE project_work_log
       SET deleted_at = NOW()
       WHERE id = $1
         AND project_id = $2
         AND user_id = $3
         AND deleted_at IS NULL
       RETURNING id`,
      [entryId, id, request.authUser.id],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Work log entry not found' });
    }

    return reply.code(204).send();
  });
}
