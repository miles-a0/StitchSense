import { pool, query } from '../db/pool.js';

// Admin rights are granted only to named accounts. Usage:
//   node dist/scripts/admin-role.js --list
//   node dist/scripts/admin-role.js --grant someone@example.com
//   node dist/scripts/admin-role.js --revoke someone@example.com
const [action, rawEmail] = process.argv.slice(2);

async function audit(userId: string, eventType: string) {
  await query(
    `INSERT INTO audit_events (target_user_id, event_type, metadata)
     VALUES ($1, $2, $3)`,
    [userId, eventType, { source: 'admin-role-script' }],
  );
}

async function setRole(email: string, role: 'admin' | 'user') {
  const result = await query<{ id: string; email: string; role: string }>(
    `UPDATE users SET role = $2, updated_at = NOW()
     WHERE lower(email) = lower($1)
     RETURNING id, email, role`,
    [email, role],
  );
  if (!result.rowCount) {
    console.error(`No account found for ${email}. The person must sign in once first.`);
    process.exitCode = 1;
    return;
  }
  await audit(result.rows[0].id, role === 'admin' ? 'admin.role.granted' : 'admin.role.revoked');
  console.log(`${result.rows[0].email} is now ${role === 'admin' ? 'an admin' : 'a standard user'}.`);
}

async function main() {
  if (action === '--list') {
    const result = await query<{ email: string; created_at: Date }>(
      `SELECT email, created_at FROM users WHERE role = 'admin' ORDER BY email`,
    );
    console.log(result.rowCount ? `Admins (${result.rowCount}):` : 'There are no admins.');
    for (const row of result.rows) console.log(`  ${row.email}`);
    return;
  }

  if ((action === '--grant' || action === '--revoke') && rawEmail?.includes('@')) {
    await setRole(rawEmail.trim(), action === '--grant' ? 'admin' : 'user');
    return;
  }

  console.error('Usage: --list | --grant <email> | --revoke <email>');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
