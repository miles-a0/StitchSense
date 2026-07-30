import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db/pool.js';

export function createRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(userId: string, token: string) {
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1,$2,$3)`,
    [userId, hashRefreshToken(token), expiresAt],
  );
  return expiresAt;
}

export async function rotateRefreshToken(token: string) {
  const tokenHash = hashRefreshToken(token);
  const existing = await query<{ user_id: string }>(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [tokenHash],
  );
  if (!existing.rowCount) return null;

  const nextToken = createRefreshToken();
  const expiresAt = await storeRefreshToken(existing.rows[0].user_id, nextToken);
  return {
    userId: existing.rows[0].user_id,
    refreshToken: nextToken,
    refreshTokenExpiresAt: expiresAt,
  };
}
