import { readFile } from 'node:fs/promises';

interface ExportUser {
  email?: string;
  display_name?: string;
  legacy_wp_user_id?: number;
}

interface ExportPattern {
  id?: string;
  title?: string;
  craft_type?: string;
  original_filename?: string;
  file_url?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface ExportChat {
  id?: string;
  pattern_id?: string;
  title?: string;
  skill_level?: string;
}

interface ExportMessage {
  session_id?: string;
  role?: string;
  content?: string;
}

interface ExportRewrite {
  id?: string;
  pattern_id?: string;
  rewrite_result?: string;
}

interface ExportFile {
  user?: ExportUser;
  patterns?: ExportPattern[] | Record<string, ExportPattern>;
  chat_sessions?: ExportChat[] | Record<string, ExportChat>;
  chat_messages?: ExportMessage[] | Record<string, ExportMessage>;
  rewrite_sessions?: ExportRewrite[] | Record<string, ExportRewrite>;
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function values<T>(input: T[] | Record<string, T> | undefined): T[] {
  if (!input) return [];
  return Array.isArray(input) ? input : Object.values(input);
}

function countBy<T>(items: T[], mapper: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = mapper(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function printSection(title: string) {
  console.log(`\n## ${title}`);
}

async function main() {
  const inputPath = arg('--input');
  if (!inputPath) {
    throw new Error('Usage: npm run audit:wordpress-export -- --input export.json');
  }

  const raw = await readFile(inputPath, 'utf8');
  const data = JSON.parse(raw) as ExportFile;

  const patterns = values(data.patterns);
  const chats = values(data.chat_sessions);
  const messages = values(data.chat_messages);
  const rewrites = values(data.rewrite_sessions);

  const patternIds = new Set(patterns.map((pattern) => pattern.id).filter(nonEmptyString));
  const chatIds = new Set(chats.map((chat) => chat.id).filter(nonEmptyString));

  const missingPatternLinksInChats = chats.filter((chat) => chat.pattern_id && !patternIds.has(chat.pattern_id));
  const missingPatternLinksInRewrites = rewrites.filter((rewrite) => rewrite.pattern_id && !patternIds.has(rewrite.pattern_id));
  const missingSessionLinksInMessages = messages.filter((message) => message.session_id && !chatIds.has(message.session_id));

  const patternsWithFiles = patterns.filter((pattern) => nonEmptyString(pattern.file_url));
  const patternsWithoutFiles = patterns.filter((pattern) => !nonEmptyString(pattern.file_url));
  const sourceBreakdown = countBy(patterns, (pattern) => (pattern.source ?? 'unknown').trim() || 'unknown');
  const craftBreakdown = countBy(patterns, (pattern) => (pattern.craft_type ?? 'unknown').trim() || 'unknown');

  const duplicateProjectIds = new Map<string, number>();
  for (const pattern of patterns) {
    const metadata = pattern.metadata && typeof pattern.metadata === 'object' ? pattern.metadata : {};
    const projectId = String(metadata.project_id ?? '').trim();
    if (!projectId) continue;
    duplicateProjectIds.set(projectId, (duplicateProjectIds.get(projectId) ?? 0) + 1);
  }
  const duplicateProjects = [...duplicateProjectIds.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  console.log('# StitchSense WordPress Export Audit');
  console.log(`Input: ${inputPath}`);

  printSection('User');
  console.log(`Email: ${data.user?.email ?? 'missing'}`);
  console.log(`Display name: ${data.user?.display_name ?? 'missing'}`);
  console.log(`Legacy WP user ID: ${data.user?.legacy_wp_user_id ?? 'missing'}`);

  printSection('Counts');
  console.log(`Patterns: ${patterns.length}`);
  console.log(`Chat sessions: ${chats.length}`);
  console.log(`Chat messages: ${messages.length}`);
  console.log(`Rewrite sessions: ${rewrites.length}`);

  printSection('Pattern Coverage');
  console.log(`Patterns with file_url: ${patternsWithFiles.length}`);
  console.log(`Patterns without file_url: ${patternsWithoutFiles.length}`);
  console.log(`Duplicate project IDs: ${duplicateProjects.length}`);

  printSection('Pattern Sources');
  for (const entry of sourceBreakdown) {
    console.log(`- ${entry.key}: ${entry.count}`);
  }

  printSection('Craft Types');
  for (const entry of craftBreakdown) {
    console.log(`- ${entry.key}: ${entry.count}`);
  }

  printSection('Relational Gaps');
  console.log(`Chats referencing missing patterns: ${missingPatternLinksInChats.length}`);
  console.log(`Rewrites referencing missing patterns: ${missingPatternLinksInRewrites.length}`);
  console.log(`Messages referencing missing sessions: ${missingSessionLinksInMessages.length}`);

  if (patternsWithoutFiles.length) {
    printSection('Patterns Missing file_url');
    for (const pattern of patternsWithoutFiles.slice(0, 20)) {
      console.log(`- ${pattern.title ?? 'Untitled'}${pattern.id ? ` [${pattern.id}]` : ''}`);
    }
    if (patternsWithoutFiles.length > 20) {
      console.log(`...and ${patternsWithoutFiles.length - 20} more`);
    }
  }

  if (duplicateProjects.length) {
    printSection('Duplicate project_id Values');
    for (const [projectId, count] of duplicateProjects.slice(0, 20)) {
      console.log(`- ${projectId}: ${count}`);
    }
    if (duplicateProjects.length > 20) {
      console.log(`...and ${duplicateProjects.length - 20} more`);
    }
  }

  if (missingPatternLinksInChats.length) {
    printSection('Chats With Missing Pattern References');
    for (const chat of missingPatternLinksInChats.slice(0, 20)) {
      console.log(`- chat ${chat.id ?? 'unknown'} -> pattern ${chat.pattern_id ?? 'missing'} (${chat.title ?? 'Untitled chat'})`);
    }
  }

  if (missingPatternLinksInRewrites.length) {
    printSection('Rewrites With Missing Pattern References');
    for (const rewrite of missingPatternLinksInRewrites.slice(0, 20)) {
      console.log(`- rewrite ${rewrite.id ?? 'unknown'} -> pattern ${rewrite.pattern_id ?? 'missing'}`);
    }
  }

  if (missingSessionLinksInMessages.length) {
    printSection('Messages With Missing Session References');
    for (const message of missingSessionLinksInMessages.slice(0, 20)) {
      console.log(`- session ${message.session_id ?? 'missing'} (${message.role ?? 'unknown'})`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
