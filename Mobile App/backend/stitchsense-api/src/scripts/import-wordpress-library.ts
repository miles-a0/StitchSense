import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pool, query } from '../db/pool.js';

interface FallbackPattern {
  id?: string;
  title?: string;
  craft_type?: string;
  original_filename?: string;
  file_url?: string;
  pattern_summary_html?: string;
  pattern_summary_text?: string;
  pattern_summary_structured?: unknown;
  source?: string;
  metadata?: unknown;
  created_at?: string;
  updated_at?: string;
}

interface FallbackChat {
  id?: string;
  pattern_id?: string;
  title?: string;
  skill_level?: string;
  created_at?: string;
  updated_at?: string;
}

interface FallbackMessage {
  session_id?: string;
  role?: string;
  content?: string;
  kind?: string;
  tool_mode?: string;
  created_at?: string;
}

interface FallbackRewrite {
  id?: string;
  pattern_id?: string;
  prompt?: string;
  rewrite_result?: string;
  rewrite_changes?: unknown;
  rewrite_warnings?: unknown;
  confidence_score?: number;
  created_at?: string;
}

interface ExportFile {
  user?: {
    email?: string;
    display_name?: string;
    legacy_wp_user_id?: number;
  };
  patterns?: FallbackPattern[] | Record<string, FallbackPattern>;
  chat_sessions?: FallbackChat[] | Record<string, FallbackChat>;
  chat_messages?: FallbackMessage[] | Record<string, FallbackMessage>;
  rewrite_sessions?: FallbackRewrite[] | Record<string, FallbackRewrite>;
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function values<T>(input: T[] | Record<string, T> | undefined): T[] {
  if (!input) return [];
  return Array.isArray(input) ? input : Object.values(input);
}

function asDate(value: string | undefined) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function ensureUser(email: string, displayName: string | null) {
  const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) return existing.rows[0].id;

  const created = await query<{ id: string }>(
    `INSERT INTO users (email, display_name, standard_trial_ends_at)
     VALUES ($1,$2,NOW() + INTERVAL '30 days')
     RETURNING id`,
    [email, displayName],
  );
  return created.rows[0].id;
}

async function main() {
  const inputPath = arg('--input');
  const fallbackEmail = arg('--email');
  const dryRun = process.argv.includes('--dry-run');

  if (!inputPath) {
    throw new Error('Usage: npm run migration:wordpress -- --input export.json [--email user@example.com] [--dry-run]');
  }

  const raw = await readFile(inputPath, 'utf8');
  const data = JSON.parse(raw) as ExportFile;
  const email = data.user?.email ?? fallbackEmail;
  if (!email) throw new Error('Export must include user.email or pass --email.');

  const patterns = values(data.patterns);
  const chats = values(data.chat_sessions);
  const messages = values(data.chat_messages);
  const rewrites = values(data.rewrite_sessions);

  console.log(`Import target: ${email}`);
  console.log(`Patterns: ${patterns.length}, chats: ${chats.length}, messages: ${messages.length}, rewrites: ${rewrites.length}`);
  if (dryRun) return;

  const userId = await ensureUser(email, data.user?.display_name ?? null);
  const patternIds = new Map<string, string>();
  const chatIds = new Map<string, string>();

  for (const pattern of patterns) {
    const legacyId = pattern.id ?? randomUUID();
    const inserted = await query<{ id: string }>(
      `INSERT INTO user_patterns
       (user_id, legacy_wp_user_id, title, craft_type, original_filename, file_url, pattern_summary_html, pattern_summary_text, pattern_summary_structured, source, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        userId,
        data.user?.legacy_wp_user_id ?? null,
        pattern.title ?? 'Untitled',
        pattern.craft_type ?? null,
        pattern.original_filename ?? null,
        pattern.file_url ?? null,
        pattern.pattern_summary_html ?? null,
        pattern.pattern_summary_text ?? null,
        pattern.pattern_summary_structured ?? {},
        pattern.source ?? 'wordpress_import',
        pattern.metadata ?? {},
        asDate(pattern.created_at),
        asDate(pattern.updated_at),
      ],
    );
    patternIds.set(legacyId, inserted.rows[0].id);
  }

  for (const chat of chats) {
    const legacyId = chat.id ?? randomUUID();
    const patternId = chat.pattern_id ? patternIds.get(chat.pattern_id) ?? null : null;
    const inserted = await query<{ id: string }>(
      `INSERT INTO chat_sessions (user_id, pattern_id, title, skill_level, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [userId, patternId, chat.title ?? 'Imported chat', chat.skill_level ?? 'beginner', asDate(chat.created_at), asDate(chat.updated_at)],
    );
    chatIds.set(legacyId, inserted.rows[0].id);
  }

  for (const message of messages) {
    if (!message.session_id) continue;
    const sessionId = chatIds.get(message.session_id);
    if (!sessionId || !message.content) continue;
    await query(
      `INSERT INTO chat_messages (session_id, role, content, kind, tool_mode, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [sessionId, message.role ?? 'user', message.content, message.kind ?? 'message', message.tool_mode ?? null, asDate(message.created_at)],
    );
  }

  for (const rewrite of rewrites) {
    if (!rewrite.pattern_id || !rewrite.rewrite_result) continue;
    const patternId = patternIds.get(rewrite.pattern_id);
    if (!patternId) continue;
    await query(
      `INSERT INTO rewrite_sessions
       (user_id, pattern_id, prompt, rewrite_result, rewrite_changes, rewrite_warnings, confidence_score, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        userId,
        patternId,
        rewrite.prompt ?? null,
        rewrite.rewrite_result,
        rewrite.rewrite_changes ?? [],
        rewrite.rewrite_warnings ?? [],
        rewrite.confidence_score ?? 0,
        asDate(rewrite.created_at),
      ],
    );
  }

  await query(
    `INSERT INTO audit_events (target_user_id, event_type, metadata)
     VALUES ($1,'migration.wordpress_import.completed',$2)`,
    [userId, { patterns: patterns.length, chats: chats.length, messages: messages.length, rewrites: rewrites.length }],
  );

  console.log('Import completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
