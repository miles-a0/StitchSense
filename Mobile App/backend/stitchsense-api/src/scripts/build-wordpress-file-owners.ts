import { pool, query } from '../db/pool.js';
import { planLegacyWordPressFileOwners } from '../services/wordpressPatternFiles.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await query<{ user_id: string; file_url: string | null; metadata: unknown }>(
    `SELECT user_id, file_url, metadata
     FROM user_patterns
     WHERE deleted_at IS NULL`,
  );

  const { owners, conflicts } = planLegacyWordPressFileOwners(rows.rows);
  const existing = await query<{ relative_path: string }>('SELECT relative_path FROM wordpress_pattern_file_owners');
  const alreadyRecorded = new Set(existing.rows.map((row) => row.relative_path));
  const toInsert = [...owners].filter(([path]) => !alreadyRecorded.has(path));

  console.log(`Patterns scanned: ${rows.rowCount}`);
  console.log(`Legacy files with a single owner: ${owners.size}`);
  console.log(`Already recorded: ${owners.size - toInsert.length}`);
  console.log(`To record: ${toInsert.length}`);
  console.log(`Referenced by more than one user (left blocked): ${conflicts.size}`);
  for (const [path, users] of conflicts) {
    console.log(`  CONFLICT ${path} (${users.length} users)`);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to record owners.');
    return;
  }

  for (const [path, userId] of toInsert) {
    await query(
      `INSERT INTO wordpress_pattern_file_owners (relative_path, user_id)
       VALUES ($1, $2)
       ON CONFLICT (relative_path) DO NOTHING`,
      [path, userId],
    );
  }
  console.log(`Recorded ${toInsert.length} owners.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
