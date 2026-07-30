import pg, { type QueryResultRow } from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}
