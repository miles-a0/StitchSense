import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import {
  wordpressPendingSyncForUser,
  syncWordPressLibraryForUser,
  wordpressMirrorSnapshotForUser,
  wordpressSyncStatusForUser,
} from '../services/wordpressSync.js';

export async function syncRoutes(app: FastifyInstance) {
  app.post('/sync/wordpress', { preHandler: app.authenticate }, async (request) => {
    return syncWordPressLibraryForUser(request.authUser.id);
  });

  app.get('/sync/wordpress/status', { preHandler: app.authenticate }, async (request) => {
    return wordpressSyncStatusForUser(request.authUser.id);
  });

  app.get('/sync/wordpress/pending', { preHandler: app.authenticate }, async (request) => {
    return wordpressPendingSyncForUser(request.authUser.id);
  });

  app.get('/sync/validation', { preHandler: app.authenticate }, async (request) => {
    const userId = request.authUser.id;
    type SyncBucketRow = { count: number; last_updated_at: string | null };
    type RecentProjectRow = {
      id: string;
      title: string;
      status: string;
      updated_at: string | null;
      deleted_at: string | null;
    };
    type OrphanRow = { count: number };
    const [
      patterns,
      projects,
      counters,
      workLog,
      photos,
      marks,
      chatSessions,
      chatMessages,
      rewrites,
      recentProjects,
      recentDeletedProjects,
      orphanProjects,
      orphanCounters,
      orphanWorkLog,
      orphanPhotos,
      orphanMarks,
      wordpress,
    ] =
      await Promise.all([
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
               FROM user_patterns
               WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
               FROM projects
               WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
               FROM project_counters
               WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(created_at) AS last_updated_at
               FROM project_work_log
               WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
               FROM project_photos
               WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
               FROM project_pattern_marks
               WHERE user_id = $1 AND deleted_at IS NULL`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
               FROM chat_sessions
               WHERE user_id = $1`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(cm.created_at) AS last_updated_at
               FROM chat_messages cm
               JOIN chat_sessions cs ON cs.id = cm.session_id
               WHERE cs.user_id = $1`, [userId]),
        query<SyncBucketRow>(`SELECT COUNT(*)::int AS count, MAX(created_at) AS last_updated_at
               FROM rewrite_sessions
               WHERE user_id = $1`, [userId]),
        query<RecentProjectRow>(
          `SELECT id, title, status, updated_at, deleted_at
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT 5`,
          [userId],
        ),
        query<RecentProjectRow>(
          `SELECT id, title, status, updated_at, deleted_at
           FROM projects
           WHERE user_id = $1
             AND deleted_at IS NOT NULL
           ORDER BY deleted_at DESC
           LIMIT 5`,
          [userId],
        ),
        query<OrphanRow>(
          `SELECT COUNT(*)::int AS count
           FROM projects p
           LEFT JOIN user_patterns up
             ON up.id = p.pattern_id
            AND up.user_id = p.user_id
            AND up.deleted_at IS NULL
           WHERE p.user_id = $1
             AND p.deleted_at IS NULL
             AND up.id IS NULL`,
          [userId],
        ),
        query<OrphanRow>(
          `SELECT COUNT(*)::int AS count
           FROM project_counters pc
           LEFT JOIN projects p
             ON p.id = pc.project_id
            AND p.user_id = pc.user_id
            AND p.deleted_at IS NULL
           WHERE pc.user_id = $1
             AND pc.deleted_at IS NULL
             AND p.id IS NULL`,
          [userId],
        ),
        query<OrphanRow>(
          `SELECT COUNT(*)::int AS count
           FROM project_work_log wl
           LEFT JOIN projects p
             ON p.id = wl.project_id
            AND p.user_id = wl.user_id
            AND p.deleted_at IS NULL
           WHERE wl.user_id = $1
             AND wl.deleted_at IS NULL
             AND p.id IS NULL`,
          [userId],
        ),
        query<OrphanRow>(
          `SELECT COUNT(*)::int AS count
           FROM project_photos pp
           LEFT JOIN projects p
             ON p.id = pp.project_id
            AND p.user_id = pp.user_id
            AND p.deleted_at IS NULL
           WHERE pp.user_id = $1
             AND pp.deleted_at IS NULL
             AND p.id IS NULL`,
          [userId],
        ),
        query<OrphanRow>(
          `SELECT COUNT(*)::int AS count
           FROM project_pattern_marks pm
           LEFT JOIN projects p
             ON p.id = pm.project_id
            AND p.user_id = pm.user_id
            AND p.deleted_at IS NULL
           WHERE pm.user_id = $1
             AND pm.deleted_at IS NULL
             AND p.id IS NULL`,
          [userId],
        ),
        wordpressSyncStatusForUser(userId),
      ]);

    const toBucket = (result: { rows: SyncBucketRow[] }) => ({
      count: Number(result.rows[0]?.count ?? 0),
      lastUpdatedAt: result.rows[0]?.last_updated_at ?? null,
    });

    const libraryBuckets = {
      patterns: toBucket(patterns),
      chatSessions: toBucket(chatSessions),
      chatMessages: toBucket(chatMessages),
      rewrites: toBucket(rewrites),
    };

    const projectBuckets = {
      projects: toBucket(projects),
      counters: toBucket(counters),
      workLogEntries: toBucket(workLog),
      photos: toBucket(photos),
      marks: toBucket(marks),
    };

    const recentProjectRows = recentProjects.rows.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      updatedAt: project.updated_at,
      deletedAt: project.deleted_at,
    }));

    const recentDeletedProjectRows = recentDeletedProjects.rows.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      updatedAt: project.updated_at,
      deletedAt: project.deleted_at,
    }));

    const projectIntegrity = {
      orphanProjects: Number(orphanProjects.rows[0]?.count ?? 0),
      orphanCounters: Number(orphanCounters.rows[0]?.count ?? 0),
      orphanWorkLogEntries: Number(orphanWorkLog.rows[0]?.count ?? 0),
      orphanPhotos: Number(orphanPhotos.rows[0]?.count ?? 0),
      orphanMarks: Number(orphanMarks.rows[0]?.count ?? 0),
    };

    const compareBucket = (
      platformBucket: { count: number; lastUpdatedAt: string | null },
      wordpressCount: number | null,
    ) => ({
      platformCount: platformBucket.count,
      wordpressCount,
      matched: wordpressCount === null ? null : platformBucket.count === wordpressCount,
      platformLastUpdatedAt: platformBucket.lastUpdatedAt,
    });

    let wordpressMirror: Awaited<ReturnType<typeof wordpressMirrorSnapshotForUser>>;
    try {
      wordpressMirror = await wordpressMirrorSnapshotForUser(userId);
    } catch (error) {
      wordpressMirror = {
        available: false,
        reason: error instanceof Error ? error.message : 'wordpress_snapshot_failed',
      };
    }

    return {
      serverTime: new Date().toISOString(),
      wordpress,
      library: libraryBuckets,
      projects: projectBuckets,
      parity: {
        wordpressMirror,
        library: {
          patterns: compareBucket(libraryBuckets.patterns, wordpressMirror.counts?.patterns ?? null),
          chatSessions: compareBucket(libraryBuckets.chatSessions, wordpressMirror.counts?.chats ?? null),
          chatMessages: compareBucket(libraryBuckets.chatMessages, wordpressMirror.counts?.chatMessages ?? null),
          rewrites: compareBucket(libraryBuckets.rewrites, wordpressMirror.counts?.rewrites ?? null),
        },
        projects: {
          mode: 'platform_only',
          note: 'Projects currently live in the shared platform only. Web project parity is still pending.',
          buckets: projectBuckets,
          recentProjects: recentProjectRows,
          recentDeletedProjects: recentDeletedProjectRows,
          integrity: projectIntegrity,
          createUpdateDeleteValidation: {
            activeProjectCount: projectBuckets.projects.count,
            recentMutationCount: recentProjectRows.length,
            recentDeletedCount: recentDeletedProjectRows.length,
            orphanCount:
              projectIntegrity.orphanProjects +
              projectIntegrity.orphanCounters +
              projectIntegrity.orphanWorkLogEntries +
              projectIntegrity.orphanPhotos +
              projectIntegrity.orphanMarks,
            passed:
              projectIntegrity.orphanProjects === 0 &&
              projectIntegrity.orphanCounters === 0 &&
              projectIntegrity.orphanWorkLogEntries === 0 &&
              projectIntegrity.orphanPhotos === 0 &&
              projectIntegrity.orphanMarks === 0,
          },
        },
      },
    };
  });

  app.get('/sync', { preHandler: app.authenticate }, async (request, reply) => {
    const since = typeof request.query === 'object' && request.query ? (request.query as { since?: string }).since : undefined;
    const sinceDate = since ? new Date(since) : new Date(0);
    if (Number.isNaN(sinceDate.getTime())) {
      return reply.code(400).send({ error: 'Invalid since timestamp' });
    }

    const patterns = await query(
      'SELECT * FROM user_patterns WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC',
      [request.authUser.id, sinceDate],
    );
    const chats = await query(
      'SELECT * FROM chat_sessions WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC',
      [request.authUser.id, sinceDate],
    );
    const rewrites = await query(
      'SELECT * FROM rewrite_sessions WHERE user_id = $1 AND created_at > $2 ORDER BY created_at ASC',
      [request.authUser.id, sinceDate],
    );

    return {
      serverTime: new Date().toISOString(),
      patterns: patterns.rows,
      chats: chats.rows,
      rewrites: rewrites.rows,
    };
  });
}
