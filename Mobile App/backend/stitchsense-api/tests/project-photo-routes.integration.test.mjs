import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;

function multipartBody({ boundary, fields = [], fieldName = 'file', filename, contentType, body }) {
  const chunks = [];
  for (const field of fields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${field.name}"\r\n\r\n` +
          `${field.value}\r\n`,
        'utf8',
      ),
    );
  }
  if (body !== null && body !== undefined) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
          `Content-Type: ${contentType}\r\n\r\n`,
        'utf8',
      ),
      Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'),
      Buffer.from('\r\n', 'utf8'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

test('project photo routes cover multipart storage, ownership, download, and soft delete', {
  skip: databaseUrl && objectStorageEndpoint ? false : 'TEST_DATABASE_URL and OBJECT_STORAGE_ENDPOINT are not configured',
}, async (t) => {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'Integration tests require a database with "test" in its name');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
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
       ('project-photo-owner@example.test', 'Project Photo Owner'),
       ('project-photo-other@example.test', 'Project Photo Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'project-photo-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'project-photo-other@example.test').id;

  const ownerPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, craft_type, source)
       VALUES ($1, 'Owner Shawl', 'knitting', 'upload')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherPatternId = (
    await client.query(
      `INSERT INTO user_patterns (user_id, title, source)
       VALUES ($1, 'Other Shawl', 'upload')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;
  const ownerProjectId = (
    await client.query(
      `INSERT INTO projects (user_id, pattern_id, title)
       VALUES ($1, $2, 'Owner photo project')
       RETURNING id`,
      [ownerId, ownerPatternId],
    )
  ).rows[0].id;
  const otherProjectId = (
    await client.query(
      `INSERT INTO projects (user_id, pattern_id, title)
       VALUES ($1, $2, 'Other photo project')
       RETURNING id`,
      [otherId, otherPatternId],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;
  const boundary = 'stitchsense-project-photo-boundary';

  const unauthenticatedList = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos`,
  });
  assert.equal(unauthenticatedList.statusCode, 401, unauthenticatedList.body);

  const crossUserList = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(crossUserList.statusCode, 404, crossUserList.body);
  assert.deepEqual(crossUserList.json(), { error: 'Project not found' });

  const missingFileUpload = await app.inject({
    method: 'POST',
    url: `/projects/${ownerProjectId}/photos`,
    headers: {
      authorization: ownerAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      fields: [{ name: 'caption', value: 'No file here' }],
      body: null,
    }),
  });
  assert.equal(missingFileUpload.statusCode, 400, missingFileUpload.body);
  assert.deepEqual(missingFileUpload.json(), { error: 'No image uploaded' });

  const invalidUpload = await app.inject({
    method: 'POST',
    url: `/projects/${ownerProjectId}/photos`,
    headers: {
      authorization: ownerAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      filename: 'not-an-image.txt',
      contentType: 'text/plain',
      body: 'this is not an image',
    }),
  });
  assert.equal(invalidUpload.statusCode, 415, invalidUpload.body);
  assert.deepEqual(invalidUpload.json(), { error: 'Please upload a JPEG, PNG, or WebP image.' });

  const pngBody = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const uploaded = await app.inject({
    method: 'POST',
    url: `/projects/${ownerProjectId}/photos`,
    headers: {
      authorization: ownerAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      fields: [
        { name: 'caption', value: '  Blocking complete  ' },
        { name: 'takenAt', value: '2026-09-20T10:15:00.000Z' },
      ],
      filename: 'blocking progress.png',
      contentType: 'image/png',
      body: pngBody,
    }),
  });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const photo = uploaded.json().photo;
  assert.equal(photo.project_id, ownerProjectId);
  assert.equal(photo.user_id, ownerId);
  assert.equal(photo.file_mime_type, 'image/png');
  assert.equal(Number(photo.file_size), pngBody.length);
  assert.equal(photo.caption, 'Blocking complete');
  assert.equal(new Date(photo.taken_at).toISOString(), '2026-09-20T10:15:00.000Z');
  assert.match(photo.file_key, new RegExp(`^${ownerId}/projects/${ownerProjectId}/`));
  assert.match(photo.file_key, /blocking-progress\.png$/);
  assert.match(photo.photo_url, /X-Amz-Signature=/);

  const storedObject = await storage.send(
    new GetObjectCommand({
      Bucket: process.env.OBJECT_STORAGE_BUCKET,
      Key: photo.file_key,
    }),
  );
  assert.equal(storedObject.ContentType, 'image/png');
  assert.deepEqual(Buffer.from(await storedObject.Body.transformToByteArray()), pngBody);

  const listed = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().photos.length, 1);
  assert.equal(listed.json().photos[0].id, photo.id);
  assert.match(listed.json().photos[0].photo_url, /X-Amz-Signature=/);

  const projectDetail = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(projectDetail.statusCode, 200, projectDetail.body);
  assert.equal(projectDetail.json().project.latest_photo_id, photo.id);
  assert.match(projectDetail.json().project.latest_photo_url, /X-Amz-Signature=/);

  const downloaded = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos/${photo.id}/file`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(downloaded.statusCode, 200, downloaded.body);
  assert.equal(downloaded.headers['content-type'], 'image/png');
  assert.equal(downloaded.headers['cache-control'], 'private, max-age=300');
  assert.deepEqual(downloaded.rawPayload, pngBody);

  const crossUserDownload = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos/${photo.id}/file`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(crossUserDownload.statusCode, 404, crossUserDownload.body);

  const crossUserDelete = await app.inject({
    method: 'DELETE',
    url: `/projects/${ownerProjectId}/photos/${photo.id}`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(crossUserDelete.statusCode, 404, crossUserDelete.body);

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/projects/${ownerProjectId}/photos/${photo.id}`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(deleted.statusCode, 204, deleted.body);

  const emptyAfterDelete = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(emptyAfterDelete.statusCode, 200, emptyAfterDelete.body);
  assert.deepEqual(emptyAfterDelete.json(), { photos: [] });

  const deletedDownload = await app.inject({
    method: 'GET',
    url: `/projects/${ownerProjectId}/photos/${photo.id}/file`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(deletedDownload.statusCode, 404, deletedDownload.body);
  assert.deepEqual(deletedDownload.json(), { error: 'Project photo not found' });

  const otherProjectStillPrivate = await app.inject({
    method: 'GET',
    url: `/projects/${otherProjectId}/photos`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(otherProjectStillPrivate.statusCode, 404, otherProjectStillPrivate.body);
});
