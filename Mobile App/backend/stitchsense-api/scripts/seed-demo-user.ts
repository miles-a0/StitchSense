import { pool, query } from '../src/db/pool.js';

const email = (process.env.DEMO_EMAIL ?? 'demo@stitchsense.test').toLowerCase();
const password = process.env.DEMO_PASSWORD ?? 'StitchSense123!';
const displayName = process.env.DEMO_DISPLAY_NAME ?? 'Demo Stitcher';

async function main() {
  const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const entitlementEnds = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const userResult = await query<{ id: string; email: string }>(
    `INSERT INTO users (email, display_name, password_hash, standard_trial_ends_at)
     VALUES ($1, $2, crypt($3, gen_salt('bf')), $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       password_hash = crypt($3, gen_salt('bf')),
       standard_trial_ends_at = GREATEST(users.standard_trial_ends_at, EXCLUDED.standard_trial_ends_at),
       updated_at = NOW()
     RETURNING id, email`,
    [email, displayName, password, trialEnds],
  );

  const user = userResult.rows[0];
  await query(
    `INSERT INTO manual_entitlements (user_id, type, starts_at, expires_at, reason)
     VALUES ($1, 'courtesy_access', NOW(), $2, 'Local demo account for simulator testing')
     ON CONFLICT DO NOTHING`,
    [user.id, entitlementEnds],
  );

  const patternResult = await query<{ id: string }>(
    `INSERT INTO user_patterns
     (user_id, title, craft_type, original_filename, pattern_summary_text, source, metadata)
     SELECT $1, 'Demo Cable Scarf', 'knitting', 'demo-cable-scarf.pdf',
            'A sample pattern record so the Library screen is not empty during simulator testing.',
            'demo',
            '{"demo": true}'::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM user_patterns WHERE user_id = $1 AND metadata->>'demo' = 'true'
     )
     RETURNING id`,
    [user.id],
  );

  console.log('Demo user ready');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`User ID: ${user.id}`);
  if (patternResult.rowCount) {
    console.log(`Demo pattern ID: ${patternResult.rows[0].id}`);
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
