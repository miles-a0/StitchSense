import { pool, query } from '../db/pool.js';
import { signedPatternUrl } from '../services/storage.js';

interface PatternRow {
  id: string;
  title: string;
  file_url: string | null;
  file_key: string | null;
  storage_provider: string | null;
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function validateUrl(url: string) {
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: 'GET', redirect: 'follow' });
    }

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const email = arg('--email');
  const limit = Number(arg('--limit') ?? '50');

  const patterns = await query<PatternRow>(
    `SELECT up.id, up.title, up.file_url, up.file_key, up.storage_provider
     FROM user_patterns up
     ${email ? 'INNER JOIN users u ON u.id = up.user_id' : ''}
     WHERE up.deleted_at IS NULL
       AND (COALESCE(up.file_url, '') <> '' OR COALESCE(up.file_key, '') <> '')
       ${email ? 'AND u.email = $1' : ''}
     ORDER BY up.updated_at DESC
     LIMIT $${email ? 2 : 1}`,
    email ? [email.toLowerCase(), limit] : [limit],
  );

  let okCount = 0;
  let failedCount = 0;

  console.log('# StitchSense Pattern File Validation');
  if (email) {
    console.log(`Filter: ${email}`);
  }
  console.log(`Patterns checked: ${patterns.rows.length}`);

  for (const pattern of patterns.rows) {
    let targetUrl = pattern.file_url?.trim() ?? '';
    if (!targetUrl && pattern.file_key) {
      targetUrl = await signedPatternUrl(pattern.file_key, 900);
    }

    if (!targetUrl) {
      failedCount += 1;
      console.log(`FAIL ${pattern.id} | ${pattern.title} | no file_url or file_key`);
      continue;
    }

    const result = await validateUrl(targetUrl);
    if (result.ok) {
      okCount += 1;
      console.log(`OK   ${pattern.id} | ${pattern.title} | ${result.status} | ${pattern.storage_provider ?? 'url'}`);
    } else {
      failedCount += 1;
      console.log(`FAIL ${pattern.id} | ${pattern.title} | ${result.status || 'ERR'} | ${result.error ?? result.finalUrl}`);
    }
  }

  console.log(`\nSummary: ok=${okCount}, failed=${failedCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
