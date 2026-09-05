import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config, validateProductionConfig } from '../config.js';

type AppliedMigration = {
  filename: string;
  checksum: string;
};

const MIGRATION_LOCK_KEY = 774337101;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function migrationsDirectory() {
  const candidates = [
    path.join(process.cwd(), 'migrations'),
    path.join(packageRoot(), 'migrations'),
  ];

  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate);
      if (entries.some((entry) => entry.endsWith('.sql'))) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Could not find migrations directory from ${process.cwd()}`);
}

async function listMigrationFiles(directory: string) {
  const entries = await readdir(directory);
  return entries
    .filter((entry) => /^\d+_.+\.sql$/.test(entry))
    .sort((left, right) => left.localeCompare(right));
}

async function appliedMigrations(client: pg.Client) {
  const result = await client.query<AppliedMigration>(
    'SELECT filename, checksum FROM schema_migrations ORDER BY filename ASC',
  );
  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
}

async function applyMigrations() {
  validateProductionConfig();

  const directory = await migrationsDirectory();
  const files = await listMigrationFiles(directory);
  if (files.length === 0) {
    throw new Error(`No migration files found in ${directory}`);
  }

  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await appliedMigrations(client);

    for (const file of files) {
      const sql = await readFile(path.join(directory, file), 'utf8');
      const checksum = sha256(sql);
      const previousChecksum = applied.get(file);

      if (previousChecksum) {
        if (previousChecksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${file}`);
        }
        console.log(`Migration already applied: ${file}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`Migration applied: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

applyMigrations().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration failed: ${message}`);
  process.exit(1);
});
