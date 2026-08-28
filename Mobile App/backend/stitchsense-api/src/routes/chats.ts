import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hasFeature, resolveEntitlement } from '../services/entitlements.js';
import {
  buildOwnedSourceRequiredResponse,
  englishOnlyInstruction,
  buildScopedWorkflowUserId,
  patternHasScopedContent,
  patternNeedsOwnedSource,
  selectedPatternUnavailableMessage,
} from '../services/patternWorkflowGuards.js';
import { extractPatternInstructionText } from '../services/patternTextExtraction.js';
import { resolvePatternGuideContinuation } from '../services/patternGuideContinuation.js';
import { callWorkflow } from '../services/workflows.js';
import { callWordPressChatProxy } from '../services/wordpressBridge.js';

const createChatBody = z.object({
  patternId: z.string().uuid().optional(),
  title: z.string().default('Untitled chat'),
  skillLevel: z.string().default('beginner'),
});

const messageBody = z.object({
  content: z.string().min(1),
  kind: z.string().default('message'),
  toolMode: z.string().default('pattern_chat'),
  patternId: z.string().uuid().nullable().optional(),
});

const WORKFLOW_QUESTION_LIMIT = 1200;

const importMessagesBody = z.object({
  messages: z.array(
    z.object({
      role: z.string().default('user'),
      content: z.string().min(1),
      kind: z.string().default('message'),
      toolMode: z.string().optional(),
      createdAt: z.string().datetime().optional(),
    }),
  ).min(1),
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

function logPatternRouting(
  request: FastifyRequest,
  details: {
    toolMode: string;
    patternId: string | null;
    sessionId?: string | null;
    projectId?: string | null;
    metadataOnlyBlocked?: boolean;
  },
) {
  request.log.info(
    {
      event: 'pattern_routing',
      clientSurface: resolveClientSurface(request),
      userId: request.authUser.id,
      toolMode: details.toolMode,
      patternId: details.patternId,
      sessionId: details.sessionId ?? null,
      projectId: details.projectId ?? null,
      metadataOnlyBlocked: details.metadataOnlyBlocked ?? false,
    },
    'Resolved pattern-aware chat routing',
  );
}

function buildSessionTitleFromPrompt(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Untitled chat';
  }
  return normalized.length > 60 ? `${normalized.slice(0, 60).trimEnd()}…` : normalized;
}

function compactWorkflowQuestion(content: string) {
  const trimmed = content.trim();
  return trimmed.length <= WORKFLOW_QUESTION_LIMIT
    ? trimmed
    : trimmed.slice(0, WORKFLOW_QUESTION_LIMIT - 1).trimEnd();
}

function isLargeGuideRequest(content: string) {
  return /row\s*by\s*row|round\s*by\s*round|step\s*by\s*step|detailed\s+guide|complete\s+guide|full\s+guide|how\s+do\s+i\s+make|guide\s+to\s+making/i.test(content);
}

function isTransportStatusText(value: string) {
  return /^(HTTP\s*)?20\d\b/i.test(value.trim()) || /^(ok|success)$/i.test(value.trim());
}

function stringValue(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const normalized = String(value).trim();
  return normalized && !isTransportStatusText(normalized) ? normalized : null;
}

function extractWorkflowAnswer(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) {
    return null;
  }

  const directString = stringValue(value);
  if (directString) {
    if ((directString.startsWith('{') && directString.endsWith('}')) || (directString.startsWith('[') && directString.endsWith(']'))) {
      try {
        return extractWorkflowAnswer(JSON.parse(directString), depth + 1) ?? directString;
      } catch {
        return directString;
      }
    }
    return directString;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const answer = extractWorkflowAnswer(entry, depth + 1);
      if (answer) return answer;
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    'answer',
    'reply',
    'response',
    'content',
    'text',
    'output',
    'completion',
  ];
  for (const key of preferredKeys) {
    const answer = extractWorkflowAnswer(record[key], depth + 1);
    if (answer) return answer;
  }

  const nestedKeys = ['body', 'data', 'result', 'results', 'payload', 'workflow', 'message'];
  for (const key of nestedKeys) {
    const answer = extractWorkflowAnswer(record[key], depth + 1);
    if (answer) return answer;
  }

  return null;
}

function workflowAnswerOrNull(value: unknown) {
  const answer = extractWorkflowAnswer(value);
  return answer && !isTransportStatusText(answer) ? answer : null;
}

function workflowRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function workflowNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasReliablePatternRetrieval(workflow: unknown) {
  const record = workflowRecord(workflow);
  const contextCount = workflowNumber(record.context_count ?? record.contextCount);
  return Boolean(
    contextCount && contextCount > 0 &&
      record.using_pattern_summary_fallback !== true &&
      record.usingPatternSummaryFallback !== true,
  );
}

function patternEvidenceRequiredMessage() {
  return [
    'I can see this is a pattern-specific request, but I do not have reliable row-by-row pattern text available for this chat yet.',
    '',
    'I will not guess stitch counts or sections from a summary, because that could make the project wrong.',
    '',
    'Please re-upload this exact pattern, or open it from your Library once indexing has completed, then ask again. Once the full pattern text is available I can give you a proper row-by-row guide based on the actual instructions.',
  ].join('\n');
}

function hasDirectPatternText(value: string | null) {
  return Boolean(value && value.trim().length >= 500);
}

function readCachedPatternText(metadata: Record<string, unknown>) {
  const value = metadata.extracted_text;
  return typeof value === 'string' && hasDirectPatternText(value) ? value.trim() : null;
}

export async function chatRoutes(app: FastifyInstance) {
  app.get('/patterns/:id/chats', { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await query('SELECT * FROM chat_sessions WHERE user_id = $1 AND pattern_id = $2 ORDER BY updated_at DESC', [request.authUser.id, id]);
    return { sessions: result.rows };
  });

  app.post('/chats', { preHandler: app.authenticate }, async (request, reply) => {
    const body = createChatBody.parse(request.body);
    if (body.patternId) {
      const patternResult = await query<{ id: string }>(
        `SELECT id
         FROM user_patterns
         WHERE id = $1
           AND user_id = $2
         LIMIT 1`,
        [body.patternId, request.authUser.id],
      );

      if (!patternResult.rowCount) {
        return reply.code(404).send({ error: 'Pattern not found' });
      }
    }

    const result = await query(
      `INSERT INTO chat_sessions (user_id, pattern_id, title, skill_level)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [request.authUser.id, body.patternId ?? null, body.title, body.skillLevel],
    );
    logPatternRouting(request, {
      toolMode: 'chat_session_create',
      patternId: body.patternId ?? null,
      sessionId: String(result.rows[0]?.id ?? ''),
    });
    return reply.code(201).send({ session: result.rows[0] });
  });

  app.get('/chats/:id/messages', { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `SELECT cm.*
       FROM chat_messages cm
       INNER JOIN chat_sessions cs ON cs.id = cm.session_id
       WHERE cs.user_id = $1 AND cm.session_id = $2
       ORDER BY cm.id ASC`,
      [request.authUser.id, id],
    );
    return { messages: result.rows };
  });

  app.post('/chats/:id/messages', { preHandler: app.authenticate }, async (request, reply) => {
    const entitlement = await resolveEntitlement(request.authUser.id);
    if (!hasFeature(entitlement, 'aiChat')) return reply.code(402).send({ error: 'Subscription required', entitlement });

    const { id } = request.params as { id: string };
    const body = messageBody.parse(request.body);
    const sessionAccess = await query<{ id: string; pattern_id: string | null }>(
      `SELECT id, pattern_id
       FROM chat_sessions
       WHERE id = $1
         AND user_id = $2
       LIMIT 1`,
      [id, request.authUser.id],
    );

    if (!sessionAccess.rowCount) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const activeSession = sessionAccess.rows[0];
    if (
      body.patternId !== undefined &&
      (activeSession.pattern_id ?? null) !== (body.patternId ?? null)
    ) {
      return reply.code(409).send({
        error: 'This chat session belongs to a different pattern. Please start a fresh chat for the selected pattern.',
      });
    }

    if (activeSession.pattern_id && !body.patternId) {
      return reply.code(409).send({
        error:
          'This chat session is bound to a specific pattern. Please reopen the selected pattern and start a fresh chat if needed.',
      });
    }

    await query(
      `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode)
       VALUES ($1, 'user', $2, $3, $4)`,
      [id, body.content, body.kind, body.toolMode],
    );

    const sessionResult = await query<{
      id: string;
      title: string;
      skill_level: string;
      pattern_id: string | null;
      pattern_title: string | null;
      pattern_summary_text: string | null;
      pattern_summary_html: string | null;
      pattern_summary_structured: Record<string, unknown> | null;
      project_id: string | null;
      file_id: string | null;
      job_id: string | null;
	      file_url: string | null;
	      file_key: string | null;
	      file_mime_type: string | null;
	      original_filename: string | null;
	      source: string | null;
	      metadata: Record<string, unknown> | null;
	    }>(
      `SELECT
         cs.id,
         cs.title,
         cs.skill_level,
         cs.pattern_id,
         up.title AS pattern_title,
         up.pattern_summary_text,
         up.pattern_summary_html,
         up.pattern_summary_structured,
         up.project_id,
         up.file_id,
         up.job_id,
	         up.file_url,
	         up.file_key,
	         up.file_mime_type,
	         up.original_filename,
	         up.source,
	         up.metadata
       FROM chat_sessions cs
       LEFT JOIN user_patterns up ON up.id = cs.pattern_id
       WHERE cs.id = $1
         AND cs.user_id = $2
       LIMIT 1`,
      [id, request.authUser.id],
    );

    if (!sessionResult.rowCount) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const historyResult = await query<{
      role: string;
      content: string;
      kind: string | null;
      tool_mode: string | null;
    }>(
      `SELECT role, content, kind, tool_mode
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY id DESC
       LIMIT 8`,
      [id],
    );

    const session = sessionResult.rows[0];
    const patternMetadata = session.metadata ?? {};
    const scopedWorkflowUserId = buildScopedWorkflowUserId(
      request.authUser.id,
      session.pattern_id,
      session.id,
    );
    const selectedPatternHasScopedContent = !session.pattern_id
      ? true
      : patternHasScopedContent({
          fileUrl: session.file_url,
          fileKey: session.file_key,
          fileId: session.file_id,
          jobId: session.job_id,
          patternSummaryText: session.pattern_summary_text,
          patternSummaryHtml: session.pattern_summary_html,
          patternSummaryStructured: session.pattern_summary_structured,
          metadata: patternMetadata,
        });

    if (
      session.pattern_id &&
      patternNeedsOwnedSource({
        source: session.source,
        fileUrl: session.file_url,
        fileKey: session.file_key,
        fileId: session.file_id,
        jobId: session.job_id,
        metadata: patternMetadata,
      })
    ) {
      logPatternRouting(request, {
        toolMode: body.toolMode,
        patternId: session.pattern_id,
        sessionId: session.id,
        projectId: session.project_id,
        metadataOnlyBlocked: true,
      });
      const answer = buildOwnedSourceRequiredResponse().answer;
      const saved = await query(
        `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode)
         VALUES ($1, 'assistant', $2, $3, $4)
         RETURNING *`,
        [id, answer, body.kind, body.toolMode],
      );
      await query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, request.authUser.id]);
      return reply.code(201).send({
        message: saved.rows[0],
        workflow: buildOwnedSourceRequiredResponse(),
      });
    }

    if (session.pattern_id && !selectedPatternHasScopedContent) {
      logPatternRouting(request, {
        toolMode: body.toolMode,
        patternId: session.pattern_id,
        sessionId: session.id,
        projectId: session.project_id,
      });
      const answer = selectedPatternUnavailableMessage();
      const saved = await query(
        `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode)
         VALUES ($1, 'assistant', $2, $3, $4)
         RETURNING *`,
        [id, answer, body.kind, body.toolMode],
      );
      await query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, request.authUser.id]);
      return reply.code(201).send({
        message: saved.rows[0],
        workflow: {
          answer,
          success: true,
          scoped_pattern_unavailable: true,
        },
      });
    }

    const guideContinuation = session.pattern_id
      ? resolvePatternGuideContinuation(body.content, historyResult.rows)
      : null;
    const workflowQuestion = compactWorkflowQuestion(
      guideContinuation?.question ?? body.content,
    );
    const workflowToolMode =
      session.pattern_id && (isLargeGuideRequest(body.content) || guideContinuation)
        ? 'pattern_step_guide'
        : body.toolMode;
    let directPatternText: string | null = null;
    let directPatternTextMeta: Record<string, unknown> | null = null;
    if (session.pattern_id && workflowToolMode === 'pattern_step_guide') {
      directPatternText = readCachedPatternText(patternMetadata);
      if (directPatternText) {
        directPatternTextMeta = {
          extracted_text_source: patternMetadata.extracted_text_source ?? 'metadata',
          extracted_text_chars: directPatternText.length,
          extracted_text_cached: true,
        };
      } else if (session.file_key) {
        try {
          const extracted = await extractPatternInstructionText({
            fileKey: session.file_key,
            mimeType: session.file_mime_type,
            filename: session.original_filename,
          });
          if (hasDirectPatternText(extracted.text)) {
            directPatternText = extracted.text;
            directPatternTextMeta = {
              extracted_text_source: extracted.source,
              extracted_text_chars: extracted.chars,
              extracted_text_truncated: extracted.truncated,
              extracted_text_updated_at: new Date().toISOString(),
            };
            await query(
              `UPDATE user_patterns
               SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                   updated_at = NOW()
               WHERE id = $1
                 AND user_id = $2`,
              [
                session.pattern_id,
                request.authUser.id,
                JSON.stringify({
                  ...directPatternTextMeta,
                  extracted_text: extracted.text,
                }),
              ],
            );
          } else {
            request.log.warn(
              {
                patternId: session.pattern_id,
                sessionId: session.id,
                fileKey: session.file_key,
                source: extracted.source,
                chars: extracted.chars,
              },
              'Pattern guide direct extraction produced too little text',
            );
          }
        } catch (error) {
          request.log.warn(
            {
              error,
              patternId: session.pattern_id,
              sessionId: session.id,
              fileKey: session.file_key,
            },
            'Pattern guide direct extraction failed',
          );
        }
      }
    }
    const guideSystemInstruction =
      session.pattern_id && workflowToolMode === 'pattern_step_guide'
        ? [
            'For large pattern guides, use the selected pattern text as primary evidence and return the fullest useful answer the workflow can provide.',
            'If pattern_instruction_text is present, treat it as the authoritative source. Do not use general knitting knowledge to invent row counts, stitch counts, sizes, or garment sections.',
            'Only ask the user to choose a size when the source pattern explicitly lists size options. If no sizes are listed, treat the pattern as one-size and proceed.',
            'Identify the natural sections only from the actual pattern text. Do not mention front/back/sleeves unless those sections appear in this pattern. Do not suggest generic next sections for another garment type.',
            'For row-by-row or round-by-round requests, include the actual rows/rounds, stitch counts, stitch symbols or abbreviations, and concise explanations where they are visible in the source.',
            'If the source text does not expose enough row detail, say exactly what is missing instead of guessing.',
          ].join(' ')
        : '';
    const genericPatternTitle = session.pattern_title ? `${session.pattern_title} chat` : null;
    const shouldRetitleSession =
      (session.title === 'Untitled chat' ||
        session.title === 'Pattern conversation' ||
        (genericPatternTitle !== null && session.title === genericPatternTitle));

    if (shouldRetitleSession) {
      const nextTitle = buildSessionTitleFromPrompt(body.content);
      await query(
        `UPDATE chat_sessions
         SET title = $3,
             updated_at = NOW()
         WHERE id = $1
           AND user_id = $2`,
        [id, request.authUser.id, nextTitle],
      );
      session.title = nextTitle;
    }

    const aiPayload = {
      action: 'chat',
      question: workflowQuestion,
      original_question: workflowQuestion,
      tool_mode: workflowToolMode,
      toolMode: workflowToolMode,
      session_id: id,
      skill_level: session.skill_level ?? 'beginner',
      history: historyResult.rows.reverse().map((message) => ({
        role: message.role,
        content: message.content,
        kind: message.kind ?? 'message',
        tool_mode: message.tool_mode ?? undefined,
      })),
      answer_mode: session.pattern_id ? 'pattern_priority' : 'general_stitch_dictionary',
      pattern_available: Boolean(session.pattern_id),
      project_id: session.project_id ?? undefined,
      projectId: session.project_id ?? undefined,
      file_id: session.file_id ?? undefined,
      fileId: session.file_id ?? undefined,
      job_id: session.job_id ?? undefined,
      jobId: session.job_id ?? undefined,
      uploaded_pattern_title: session.pattern_title ?? undefined,
      uploaded_pattern_summary: session.pattern_summary_text ?? undefined,
      pattern_summary_text: session.pattern_summary_text ?? undefined,
      pattern_summary_html: session.pattern_summary_html ?? undefined,
      pattern_summary_structured: session.pattern_summary_structured ?? undefined,
      pattern_metadata: patternMetadata,
      pattern_instruction_text: directPatternText ?? undefined,
      pattern_instruction_context_status: directPatternText
        ? 'direct_uploaded_file_text_available'
        : undefined,
      pattern_context_mode: directPatternText ? 'pattern_instruction_text' : undefined,
      pattern_instruction_metadata: directPatternTextMeta ?? undefined,
      pattern_instruction_prompt: directPatternText
        ? 'Use pattern_instruction_text as the exact source for this answer. Quote or paraphrase only rows, stitch counts, sizes, and sections found there. If a requested row or count is absent, say it is not visible in the extracted text.'
        : undefined,
      pattern_source: session.source ?? undefined,
      user_id: scopedWorkflowUserId,
      userId: scopedWorkflowUserId,
      platform_user_id: request.authUser.id,
      platformUserId: request.authUser.id,
      pattern_id: session.pattern_id ?? undefined,
      patternId: session.pattern_id ?? undefined,
      response_language: 'english',
      target_language: 'english',
      translation_target_language: 'english',
      locale: 'en-GB',
      system_instruction: [englishOnlyInstruction(), guideSystemInstruction].filter(Boolean).join('\n'),
    };

    logPatternRouting(request, {
      toolMode: workflowToolMode,
      patternId: session.pattern_id,
      sessionId: session.id,
      projectId: session.project_id,
    });

    let ai: unknown;
    let answer: string | null = null;
    try {
      try {
        ai = await callWordPressChatProxy(request.authUser.id, aiPayload);
      } catch (error) {
        request.log.warn({ error, aiPayload }, 'WordPress chat proxy failed; trying direct workflow fallback');
        ai = null;
      }
	      answer = workflowAnswerOrNull(ai);
	      if (!answer) {
	        request.log.warn({ aiPayload, ai }, 'WordPress chat proxy returned no usable answer; trying direct workflow fallback');
	        ai = await callWorkflow('chat', aiPayload);
	        answer = workflowAnswerOrNull(ai);
	      }
	      request.log.info(
	        {
	          event: 'chat_workflow_context',
	          patternId: session.pattern_id,
	          sessionId: session.id,
	          toolMode: workflowToolMode,
		          contextCount: workflowNumber(workflowRecord(ai).context_count ?? workflowRecord(ai).contextCount) ?? 0,
		          directPatternTextChars: directPatternText?.length ?? 0,
		          usingPatternSummaryFallback: Boolean(
	            workflowRecord(ai).using_pattern_summary_fallback ??
	              workflowRecord(ai).usingPatternSummaryFallback,
	          ),
	        },
	        'Resolved chat workflow context quality',
	      );
	      if (
	        session.pattern_id &&
		        workflowToolMode === 'pattern_step_guide' &&
		        !hasDirectPatternText(directPatternText) &&
		        !hasReliablePatternRetrieval(ai)
		      ) {
	        request.log.warn({ aiPayload, ai }, 'Pattern step guide blocked because workflow returned no reliable scoped pattern retrieval');
	        answer = patternEvidenceRequiredMessage();
	        ai = {
	          success: true,
	          answer,
	          pattern_evidence_required: true,
	          context_count: workflowNumber(workflowRecord(ai).context_count ?? workflowRecord(ai).contextCount) ?? 0,
	        };
	      }
	    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow chat failed';
      request.log.error({ error, aiPayload }, 'Chat workflow failed');
      return reply.code(502).send({ error: message });
    }

    if (!answer) {
      request.log.error({ aiPayload, ai }, 'Chat workflow returned no usable answer');
      return reply.code(502).send({
        error: 'StitchSense could not get a usable chat answer from the workflow. Please try again.',
      });
    }
    const saved = await query(
      `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode)
       VALUES ($1, 'assistant', $2, $3, $4)
       RETURNING *`,
      [id, answer, body.kind, body.toolMode],
    );
    await query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, request.authUser.id]);
    return reply.code(201).send({ message: saved.rows[0], workflow: ai });
  });

  app.put('/chats/:id/messages', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = importMessagesBody.parse(request.body);

    const session = await query<{ id: string }>('SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2', [id, request.authUser.id]);
    if (!session.rowCount) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const savedIds: number[] = [];
    for (const message of body.messages) {
      const saved = await query<{ id: number }>(
        `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode, created_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
         RETURNING id`,
        [
          id,
          message.role,
          message.content,
          message.kind,
          message.toolMode ?? null,
          message.createdAt ?? null,
        ],
      );
      savedIds.push(saved.rows[0].id);
    }

    await query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, request.authUser.id]);
    return reply.code(201).send({ ids: savedIds, imported: savedIds.length });
  });
}
