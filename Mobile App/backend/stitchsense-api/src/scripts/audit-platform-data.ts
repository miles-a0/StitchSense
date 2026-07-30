import { pool, query } from '../db/pool.js';

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function printSection(title: string) {
  console.log(`\n## ${title}`);
}

async function main() {
  const email = arg('--email');
  const limit = Number(arg('--limit') ?? '10');

  const where = email ? 'WHERE u.email = $1' : '';
  const params = email ? [email.toLowerCase()] : [];

  const userSummary = await query<{
    user_id: string;
    email: string;
    patterns: string;
    chats: string;
    rewrites: string;
    linked_accounts: string;
    latest_pattern_at: Date | null;
  }>(
    `SELECT
       u.id AS user_id,
       u.email,
       COUNT(DISTINCT p.id)::text AS patterns,
       COUNT(DISTINCT cs.id)::text AS chats,
       COUNT(DISTINCT rs.id)::text AS rewrites,
       COUNT(DISTINCT la.id)::text AS linked_accounts,
       MAX(p.updated_at) AS latest_pattern_at
     FROM users u
     LEFT JOIN user_patterns p ON p.user_id = u.id AND p.deleted_at IS NULL
     LEFT JOIN chat_sessions cs ON cs.user_id = u.id
     LEFT JOIN rewrite_sessions rs ON rs.user_id = u.id
     LEFT JOIN linked_accounts la ON la.user_id = u.id
     ${where}
     GROUP BY u.id, u.email
     ORDER BY MAX(p.updated_at) DESC NULLS LAST, u.email ASC`,
    params,
  );

  const totals = await query<{
    users: string;
    patterns: string;
    chats: string;
    messages: string;
    rewrites: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM users)::text AS users,
       (SELECT COUNT(*) FROM user_patterns WHERE deleted_at IS NULL)::text AS patterns,
       (SELECT COUNT(*) FROM chat_sessions)::text AS chats,
       (SELECT COUNT(*) FROM chat_messages)::text AS messages,
       (SELECT COUNT(*) FROM rewrite_sessions)::text AS rewrites`,
  );

  const patternSources = await query<{ source: string | null; count: string }>(
    `SELECT source, COUNT(*)::text AS count
     FROM user_patterns
     WHERE deleted_at IS NULL
     GROUP BY source
     ORDER BY COUNT(*) DESC, source ASC`,
  );

  const fileCoverage = await query<{
    total_patterns: string;
    with_file_url: string;
    with_file_key: string;
    missing_both: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_patterns,
       COUNT(*) FILTER (WHERE COALESCE(file_url, '') <> '')::text AS with_file_url,
       COUNT(*) FILTER (WHERE COALESCE(file_key, '') <> '')::text AS with_file_key,
       COUNT(*) FILTER (WHERE COALESCE(file_url, '') = '' AND COALESCE(file_key, '') = '')::text AS missing_both
     FROM user_patterns
     WHERE deleted_at IS NULL`,
  );

  const duplicateProjects = await query<{ project_id: string; count: string }>(
    `SELECT project_id, COUNT(*)::text AS count
     FROM user_patterns
     WHERE deleted_at IS NULL
       AND COALESCE(project_id, '') <> ''
     GROUP BY project_id
     HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC, project_id ASC
     LIMIT $1`,
    [limit],
  );

  const orphanChats = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM chat_sessions cs
     LEFT JOIN user_patterns up ON up.id = cs.pattern_id
     WHERE cs.pattern_id IS NOT NULL
       AND up.id IS NULL`,
  );

  const orphanRewrites = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM rewrite_sessions rs
     LEFT JOIN user_patterns up ON up.id = rs.pattern_id
     WHERE up.id IS NULL`,
  );

  console.log('# StitchSense Platform Data Audit');
  if (email) {
    console.log(`Filter: ${email}`);
  }

  printSection('Totals');
  const totalRow = totals.rows[0];
  console.log(`Users: ${totalRow.users}`);
  console.log(`Patterns: ${totalRow.patterns}`);
  console.log(`Chats: ${totalRow.chats}`);
  console.log(`Messages: ${totalRow.messages}`);
  console.log(`Rewrites: ${totalRow.rewrites}`);

  printSection('File Coverage');
  const fileRow = fileCoverage.rows[0];
  console.log(`Total patterns: ${fileRow.total_patterns}`);
  console.log(`With file_url: ${fileRow.with_file_url}`);
  console.log(`With file_key: ${fileRow.with_file_key}`);
  console.log(`Missing both: ${fileRow.missing_both}`);

  printSection('Pattern Sources');
  for (const row of patternSources.rows) {
    console.log(`- ${row.source ?? 'unknown'}: ${row.count}`);
  }

  printSection('Relational Gaps');
  console.log(`Chats referencing missing patterns: ${orphanChats.rows[0].count}`);
  console.log(`Rewrites referencing missing patterns: ${orphanRewrites.rows[0].count}`);

  if (duplicateProjects.rowCount) {
    printSection('Duplicate project_id Values');
    for (const row of duplicateProjects.rows) {
      console.log(`- ${row.project_id}: ${row.count}`);
    }
  }

  printSection(email ? 'Matching User Summary' : 'User Summary');
  for (const row of userSummary.rows.slice(0, limit)) {
    const latest = row.latest_pattern_at ? row.latest_pattern_at.toISOString() : 'never';
    console.log(`- ${row.email}: patterns=${row.patterns}, chats=${row.chats}, rewrites=${row.rewrites}, links=${row.linked_accounts}, latestPattern=${latest}`);
  }
  if (!email && userSummary.rows.length > limit) {
    console.log(`...and ${userSummary.rows.length - limit} more users`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
