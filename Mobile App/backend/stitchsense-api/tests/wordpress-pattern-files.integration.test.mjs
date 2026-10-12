import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const site = 'https://knit.example.test';
const uploads = `${site}/wp-content/uploads`;

test('WordPress-hosted pattern files are only reachable through owner-checked signed links', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured',
}, async () => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.WORDPRESS_SITE_URL = site;
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret-with-more-than-32-characters';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('wp-owner@example.test', 'WP Owner'),
       ('wp-other@example.test', 'WP Other'),
       ('unlinked@example.test', 'Unlinked')
     RETURNING id, email`,
  );
  const idFor = (email) => users.rows.find((row) => row.email === email).id;
  const ownerId = idFor('wp-owner@example.test');
  const otherId = idFor('wp-other@example.test');
  const unlinkedId = idFor('unlinked@example.test');
  // Same shape as /auth/wordpress-session writes: "{siteUrl}|{wpUserId}". The other user has no metadata copy.
  await client.query(
    `INSERT INTO linked_accounts (user_id, provider, provider_user_id, metadata) VALUES
       ($1, 'wordpress', $3, $4),
       ($2, 'wordpress', $5, '{}')`,
    [ownerId, otherId, `${site}|4`, { wpUserId: '4', siteUrl: site }, `${site}|9`],
  );
  await client.query(
    `INSERT INTO manual_entitlements (user_id, type, reason)
     VALUES ($1, 'lifetime_pro', 'wordpress pattern file integration test')`,
    [ownerId],
  );

  const ownUpload = `${uploads}/stitchsense/patterns/user-4/upload-abc.pdf`;
  const legacyRavelry = `${uploads}/stitchsense/ravelry/2026/06/Callisto-Hat-7491348-1.pdf`;
  const insertPattern = async (userId, title, fileUrl, metadata = {}) =>
    (
      await client.query(
        `INSERT INTO user_patterns (user_id, title, file_url, original_filename, file_mime_type, source, metadata)
         VALUES ($1, $2, $3, 'pattern.pdf', 'application/pdf', 'upload', $4)
         RETURNING id`,
        [userId, title, fileUrl, metadata],
      )
    ).rows[0].id;

  const ownerUploadId = await insertPattern(ownerId, 'Own upload', ownUpload);
  const ownerRavelryId = await insertPattern(ownerId, 'Own Ravelry import', legacyRavelry);
  const ownerRewriteId = await insertPattern(ownerId, 'Own rewrite', null, { parent_file_url: ownUpload });
  const forgedUploadId = await insertPattern(otherId, 'Forged upload path', ownUpload);
  const forgedRavelryId = await insertPattern(otherId, 'Forged Ravelry path', legacyRavelry);
  const unlinkedId1 = await insertPattern(unlinkedId, 'Unlinked user', ownUpload);
  const externalId = await insertPattern(ownerId, 'External file', 'http://169.254.169.254/latest/meta-data.pdf');

  await client.query(
    'INSERT INTO wordpress_pattern_file_owners (relative_path, user_id) VALUES ($1, $2)',
    ['stitchsense/ravelry/2026/06/Callisto-Hat-7491348-1.pdf', ownerId],
  );

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    fetchCalls.push(String(input));
    return new Response('not a pdf', { status: 500 });
  };

  const { buildApp } = await import('../dist/app.js');
  const { pool } = await import('../dist/db/pool.js');
  const files = await import('../dist/services/wordpressPatternFiles.js');
  const app = await buildApp();
  const auth = (userId) => ({ authorization: `Bearer ${app.jwt.sign({ sub: userId })}` });
  const get = (userId, url) => app.inject({ method: 'GET', url, headers: auth(userId) });

  const assertSignedFor = (value, relative, ttl) => {
    const signed = new URL(value);
    assert.equal(`${signed.origin}${signed.pathname}`, `${site}/wp-json/stitchsense/v1/pattern-files`);
    assert.equal(signed.searchParams.get('path'), relative);
    const expires = Number(signed.searchParams.get('expires'));
    const remaining = expires - Math.floor(Date.now() / 1000);
    assert.ok(remaining > ttl - 30 && remaining <= ttl, `expiry ${remaining}s should be about ${ttl}s`);
    assert.equal(signed.searchParams.get('sig'), files.signWordPressPatternFile(relative, expires));
  };

  try {
    const ownUploadLink = await get(ownerId, `/patterns/${ownerUploadId}/file-url`);
    assert.equal(ownUploadLink.statusCode, 200, ownUploadLink.body);
    assert.equal(ownUploadLink.json().expiresIn, 900);
    assertSignedFor(ownUploadLink.json().fileUrl, 'stitchsense/patterns/user-4/upload-abc.pdf', 900);

    const ownRavelryLink = await get(ownerId, `/patterns/${ownerRavelryId}/file-url`);
    assert.equal(ownRavelryLink.statusCode, 200, ownRavelryLink.body);
    assertSignedFor(ownRavelryLink.json().fileUrl, 'stitchsense/ravelry/2026/06/Callisto-Hat-7491348-1.pdf', 900);

    for (const [userId, patternId] of [[otherId, forgedUploadId], [otherId, forgedRavelryId], [unlinkedId, unlinkedId1]]) {
      const denied = await get(userId, `/patterns/${patternId}/file-url`);
      assert.equal(denied.statusCode, 404, denied.body);
      assert.doesNotMatch(denied.body, /sig=/);
      const deniedDownload = await get(userId, `/patterns/${patternId}/file`);
      assert.equal(deniedDownload.statusCode, 404, deniedDownload.body);
    }

    const crossUser = await get(otherId, `/patterns/${ownerUploadId}/file-url`);
    assert.equal(crossUser.statusCode, 404, crossUser.body);

    const download = await get(ownerId, `/patterns/${ownerUploadId}/file`);
    assert.equal(download.statusCode, 302, download.body);
    assertSignedFor(download.headers.location, 'stitchsense/patterns/user-4/upload-abc.pdf', 900);

    const ownerList = await get(ownerId, '/patterns');
    assert.equal(ownerList.statusCode, 200, ownerList.body);
    const byId = Object.fromEntries(ownerList.json().patterns.map((pattern) => [pattern.id, pattern]));
    assertSignedFor(byId[ownerUploadId].file_access_url, 'stitchsense/patterns/user-4/upload-abc.pdf', 6 * 60 * 60);
    assertSignedFor(byId[ownerRavelryId].file_access_url, 'stitchsense/ravelry/2026/06/Callisto-Hat-7491348-1.pdf', 6 * 60 * 60);
    assertSignedFor(byId[ownerRewriteId].parent_file_access_url, 'stitchsense/patterns/user-4/upload-abc.pdf', 6 * 60 * 60);
    assert.equal(byId[ownerRewriteId].file_access_url, null);
    assert.equal(byId[externalId].file_access_url, null);
    assert.equal(byId[ownerUploadId].file_url, ownUpload);

    const otherList = await get(otherId, '/patterns');
    for (const pattern of otherList.json().patterns) {
      assert.equal(pattern.file_access_url, null, `${pattern.title} must not receive a signed link`);
    }

    const signedFromList = byId[ownerUploadId].file_access_url;
    const created = await app.inject({
      method: 'POST',
      url: '/patterns',
      headers: auth(ownerId),
      payload: {
        title: 'Saved from signed link',
        fileUrl: signedFromList,
        metadata: { parent_file_url: byId[ownerRewriteId].parent_file_access_url },
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().pattern.file_url, ownUpload);
    assert.equal(created.json().pattern.metadata.parent_file_url, ownUpload);
    assertSignedFor(created.json().pattern.file_access_url, 'stitchsense/patterns/user-4/upload-abc.pdf', 6 * 60 * 60);

    const updated = await app.inject({
      method: 'PUT',
      url: `/patterns/${ownerRavelryId}`,
      headers: auth(ownerId),
      payload: { fileUrl: byId[ownerRavelryId].file_access_url },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().pattern.file_url, legacyRavelry);

    const externalThumbnail = await get(ownerId, `/patterns/${externalId}/thumbnail`);
    assert.equal(externalThumbnail.statusCode, 404, externalThumbnail.body);
    const forgedThumbnail = await get(otherId, `/patterns/${forgedUploadId}/thumbnail`);
    assert.equal(forgedThumbnail.statusCode, 404, forgedThumbnail.body);
    assert.deepEqual(fetchCalls, [], 'thumbnails must not fetch unowned or external addresses');

    const ownThumbnail = await get(ownerId, `/patterns/${ownerUploadId}/thumbnail`);
    assert.equal(ownThumbnail.statusCode, 502, ownThumbnail.body);
    assert.equal(fetchCalls.length, 1);
    assertSignedFor(fetchCalls[0], 'stitchsense/patterns/user-4/upload-abc.pdf', 900);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    await pool.end();
    await client.end();
  }
});
