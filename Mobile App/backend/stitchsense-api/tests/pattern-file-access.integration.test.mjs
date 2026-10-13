import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;

test('pattern file URL access is scoped to active owned patterns only', {
  skip: databaseUrl && objectStorageEndpoint ? false : 'TEST_DATABASE_URL and OBJECT_STORAGE_ENDPOINT are not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
  process.env.PUBLIC_API_BASE_URL = 'https://api.example.test';
  process.env.OBJECT_STORAGE_PROVIDER = process.env.OBJECT_STORAGE_PROVIDER ?? 'minio';
  process.env.OBJECT_STORAGE_BUCKET = process.env.OBJECT_STORAGE_BUCKET ?? 'stitchsense-test-patterns';
  process.env.OBJECT_STORAGE_REGION = process.env.OBJECT_STORAGE_REGION ?? 'us-east-1';
  process.env.OBJECT_STORAGE_ACCESS_KEY = process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'stitchsense-test';
  process.env.OBJECT_STORAGE_SECRET_KEY = process.env.OBJECT_STORAGE_SECRET_KEY ?? 'stitchsense-test-password';

  let app;
  let pool;
  const client = new pg.Client({ connectionString: databaseUrl });
  const storage = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION,
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
    },
  });

  // Close every handle even when an assertion fails, or the open handles keep the test process alive.
  t.after(async () => {
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    await client.end();
    storage.destroy();
  });

  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  try {
    await storage.send(new CreateBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET }));
  } catch (error) {
    if (!String(error?.name ?? error).includes('BucketAlready')) {
      throw error;
    }
  }

  const users = await client.query(
    `INSERT INTO users (email, display_name) VALUES
       ('file-owner@example.test', 'File Owner'),
       ('file-other@example.test', 'File Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'file-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'file-other@example.test').id;

  const activePatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, file_url, source)
       VALUES ($1, 'Active file pattern', 'https://example.test/active.pdf', 'upload')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const deletedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, file_url, source, deleted_at)
       VALUES ($1, 'Deleted file pattern', 'https://example.test/deleted.pdf', 'upload', NOW())
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const storedFileKey = `${ownerId}/${randomUUID()}/stored-pattern.txt`;
  const storedFileBody = 'Row 1: Knit across.\nRow 2: Purl across.\n';
  await storage.send(
    new PutObjectCommand({
      Bucket: process.env.OBJECT_STORAGE_BUCKET,
      Key: storedFileKey,
      Body: storedFileBody,
      ContentType: 'text/plain; charset=utf-8',
      Metadata: {
        userId: ownerId,
      },
    }),
  );
  const storedPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, file_key, original_filename, file_mime_type, source)
       VALUES ($1, 'Stored file pattern', $2, 'stored-pattern.txt', 'text/plain; charset=utf-8', 'upload')
       RETURNING id`,
      [ownerId, storedFileKey],
    )
  ).rows[0].id;
  const deletedStoredPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, file_key, original_filename, file_mime_type, source, deleted_at)
       VALUES ($1, 'Deleted stored file pattern', $2, 'deleted-stored-pattern.txt', 'text/plain; charset=utf-8', 'upload', NOW())
       RETURNING id`,
      [ownerId, storedFileKey],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;

  const ownerActive = await app.inject({
    method: 'GET',
    url: `/patterns/${activePatternId}/file-url`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerActive.statusCode, 200, ownerActive.body);
  assert.deepEqual(ownerActive.json(), {
    fileUrl: 'https://example.test/active.pdf',
    fileKey: null,
    expiresIn: null,
  });

  const otherActive = await app.inject({
    method: 'GET',
    url: `/patterns/${activePatternId}/file-url`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(otherActive.statusCode, 404, otherActive.body);

  const ownerDeleted = await app.inject({
    method: 'GET',
    url: `/patterns/${deletedPatternId}/file-url`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerDeleted.statusCode, 404, ownerDeleted.body);

  const ownerStoredUrl = await app.inject({
    method: 'GET',
    url: `/patterns/${storedPatternId}/file-url`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerStoredUrl.statusCode, 200, ownerStoredUrl.body);
  assert.equal(ownerStoredUrl.json().fileKey, storedFileKey);
  assert.equal(ownerStoredUrl.json().expiresIn, 900);
  const storedLink = new URL(ownerStoredUrl.json().fileUrl);
  assert.equal(storedLink.origin, 'https://api.example.test');
  assert.equal(storedLink.pathname, '/files/signed');
  assert.doesNotMatch(storedLink.toString(), /X-Amz-Signature=/);

  // The signed link works without a session, as the phone's browser opens it.
  const storedLinkDownload = await app.inject({ method: 'GET', url: `${storedLink.pathname}${storedLink.search}` });
  assert.equal(storedLinkDownload.statusCode, 200, storedLinkDownload.body);
  assert.equal(storedLinkDownload.headers['content-disposition'], 'inline');
  assert.equal(storedLinkDownload.body, storedFileBody);

  const tamperedLink = new URL(storedLink);
  tamperedLink.searchParams.set('s', '0'.repeat(64));
  const tamperedDownload = await app.inject({ method: 'GET', url: `${tamperedLink.pathname}${tamperedLink.search}` });
  assert.equal(tamperedDownload.statusCode, 403, tamperedDownload.body);
  assert.doesNotMatch(tamperedDownload.body, new RegExp(storedFileBody.slice(0, 12)));

  // Types outside the inline allowlist are never rendered by the browser, whatever parameters storage returns.
  const htmlFileKey = `${ownerId}/${randomUUID()}/page.html`;
  await storage.send(
    new PutObjectCommand({
      Bucket: process.env.OBJECT_STORAGE_BUCKET,
      Key: htmlFileKey,
      Body: '<script>alert(1)</script>',
      ContentType: 'text/html; charset=utf-8',
    }),
  );
  const { signedStorageUrl } = await import('../dist/services/storage.js');
  const htmlLink = new URL(await signedStorageUrl(htmlFileKey, 900));
  const htmlDownload = await app.inject({ method: 'GET', url: `${htmlLink.pathname}${htmlLink.search}` });
  assert.equal(htmlDownload.statusCode, 200, htmlDownload.body);
  assert.equal(htmlDownload.headers['content-type'], 'application/octet-stream');
  assert.equal(htmlDownload.headers['content-disposition'], 'attachment');

  const otherUserKeyLink = new URL(storedLink);
  otherUserKeyLink.searchParams.set('k', Buffer.from(`${otherId}/someone-else.pdf`).toString('base64url'));
  const otherUserKeyDownload = await app.inject({ method: 'GET', url: `${otherUserKeyLink.pathname}${otherUserKeyLink.search}` });
  assert.equal(otherUserKeyDownload.statusCode, 403, otherUserKeyDownload.body);

  const ownerStoredDownload = await app.inject({
    method: 'GET',
    url: `/patterns/${storedPatternId}/file`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(ownerStoredDownload.statusCode, 200, ownerStoredDownload.body);
  assert.equal(ownerStoredDownload.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(ownerStoredDownload.headers['content-disposition'], 'attachment; filename="stored-pattern.txt"');
  assert.equal(ownerStoredDownload.body, storedFileBody);

  const otherStoredDownload = await app.inject({
    method: 'GET',
    url: `/patterns/${storedPatternId}/file`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(otherStoredDownload.statusCode, 404, otherStoredDownload.body);

  const deletedStoredDownload = await app.inject({
    method: 'GET',
    url: `/patterns/${deletedStoredPatternId}/file`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(deletedStoredDownload.statusCode, 404, deletedStoredDownload.body);

  const tokenPayload = Buffer.from(
    JSON.stringify({
      sub: ownerId,
      pid: storedPatternId,
      key: storedFileKey,
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
    'utf8',
  ).toString('base64url');
  const tokenSignature = createHmac('sha256', process.env.JWT_SECRET).update(tokenPayload).digest('base64url');
  const transferToken = `${tokenPayload}.${tokenSignature}`;

  const transferDownload = await app.inject({
    method: 'GET',
    url: `/patterns/file-transfer?token=${encodeURIComponent(transferToken)}`,
  });
  assert.equal(transferDownload.statusCode, 200, transferDownload.body);
  assert.equal(transferDownload.headers['content-disposition'], 'attachment; filename="stored-pattern.txt"');
  assert.equal(transferDownload.body, storedFileBody);

  const tamperedTransfer = await app.inject({
    method: 'GET',
    url: `/patterns/file-transfer?token=${encodeURIComponent(`${tokenPayload}.tampered`)}`,
  });
  assert.equal(tamperedTransfer.statusCode, 401, tamperedTransfer.body);
});
