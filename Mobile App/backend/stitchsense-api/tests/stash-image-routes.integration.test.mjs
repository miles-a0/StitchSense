import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;

function multipartBody({ boundary, fieldName = 'file', filename, contentType, body }) {
  const chunks = [];
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

test('stash image routes cover upload validation, owner scoping, signed URLs, and download', {
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
       ('stash-image-owner@example.test', 'Stash Image Owner'),
       ('stash-image-other@example.test', 'Stash Image Other')
     RETURNING id, email`,
  );
  const ownerId = users.rows.find((row) => row.email === 'stash-image-owner@example.test').id;
  const otherId = users.rows.find((row) => row.email === 'stash-image-other@example.test').id;

  const ownerStashId = (
    await client.query(
      `INSERT INTO stash_items (user_id, category, name, brand)
       VALUES ($1, 'yarn', 'Owner yarn', 'Visible Brand')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const ownerNoImageStashId = (
    await client.query(
      `INSERT INTO stash_items (user_id, category, name)
       VALUES ($1, 'tool', 'Owner tool')
       RETURNING id`,
      [ownerId],
    )
  ).rows[0].id;
  const otherStashId = (
    await client.query(
      `INSERT INTO stash_items (user_id, category, name)
       VALUES ($1, 'yarn', 'Other yarn')
       RETURNING id`,
      [otherId],
    )
  ).rows[0].id;

  const { buildApp } = await import('../dist/app.js');
  ({ pool } = await import('../dist/db/pool.js'));
  app = await buildApp();
  const ownerAuthorization = `Bearer ${app.jwt.sign({ sub: ownerId })}`;
  const otherAuthorization = `Bearer ${app.jwt.sign({ sub: otherId })}`;
  const boundary = 'stitchsense-stash-image-boundary';

  const unauthenticatedUpload = await app.inject({
    method: 'POST',
    url: `/stash/${ownerStashId}/image`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      filename: 'stash.png',
      contentType: 'image/png',
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }),
  });
  assert.equal(unauthenticatedUpload.statusCode, 401, unauthenticatedUpload.body);

  const crossUserUpload = await app.inject({
    method: 'POST',
    url: `/stash/${ownerStashId}/image`,
    headers: {
      authorization: otherAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      filename: 'stash.png',
      contentType: 'image/png',
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }),
  });
  assert.equal(crossUserUpload.statusCode, 404, crossUserUpload.body);
  assert.deepEqual(crossUserUpload.json(), { error: 'Stash item not found' });

  const missingFileUpload = await app.inject({
    method: 'POST',
    url: `/stash/${ownerStashId}/image`,
    headers: {
      authorization: ownerAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({ boundary, body: null }),
  });
  assert.equal(missingFileUpload.statusCode, 400, missingFileUpload.body);
  assert.deepEqual(missingFileUpload.json(), { error: 'No image uploaded' });

  const invalidUpload = await app.inject({
    method: 'POST',
    url: `/stash/${ownerStashId}/image`,
    headers: {
      authorization: ownerAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      filename: 'not-an-image.txt',
      contentType: 'text/plain',
      body: 'not an image',
    }),
  });
  assert.equal(invalidUpload.statusCode, 415, invalidUpload.body);
  assert.deepEqual(invalidUpload.json(), { error: 'Please upload a JPEG, PNG, or WebP image.' });

  const imageBody = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const uploaded = await app.inject({
    method: 'POST',
    url: `/stash/${ownerStashId}/image`,
    headers: {
      authorization: ownerAuthorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      filename: 'sea glass yarn.png',
      contentType: 'image/png',
      body: imageBody,
    }),
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const item = uploaded.json().item;
  assert.equal(item.id, ownerStashId);
  assert.equal(item.user_id, ownerId);
  assert.equal(item.image_mime_type, 'image/png');
  assert.equal(Number(item.image_file_size), imageBody.length);
  assert.match(item.image_file_key, new RegExp(`^${ownerId}/stash/${ownerStashId}/`));
  assert.match(item.image_file_key, /sea-glass-yarn\.png$/);
  assert.match(item.image_url, /X-Amz-Signature=/);

  const storedObject = await storage.send(
    new GetObjectCommand({
      Bucket: process.env.OBJECT_STORAGE_BUCKET,
      Key: item.image_file_key,
    }),
  );
  assert.equal(storedObject.ContentType, 'image/png');
  assert.deepEqual(Buffer.from(await storedObject.Body.transformToByteArray()), imageBody);

  const listed = await app.inject({
    method: 'GET',
    url: '/stash?search=Owner',
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(listed.statusCode, 200, listed.body);
  const listedItem = listed.json().items.find((candidate) => candidate.id === ownerStashId);
  assert.equal(listedItem.image_file_key, item.image_file_key);
  assert.match(listedItem.image_url, /X-Amz-Signature=/);

  const downloaded = await app.inject({
    method: 'GET',
    url: `/stash/${ownerStashId}/image`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(downloaded.statusCode, 200, downloaded.body);
  assert.equal(downloaded.headers['content-type'], 'image/png');
  assert.equal(downloaded.headers['cache-control'], 'private, max-age=300');
  assert.deepEqual(downloaded.rawPayload, imageBody);

  const crossUserDownload = await app.inject({
    method: 'GET',
    url: `/stash/${ownerStashId}/image`,
    headers: { authorization: otherAuthorization },
  });
  assert.equal(crossUserDownload.statusCode, 404, crossUserDownload.body);
  assert.deepEqual(crossUserDownload.json(), { error: 'Stash image not found' });

  const noImageDownload = await app.inject({
    method: 'GET',
    url: `/stash/${ownerNoImageStashId}/image`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(noImageDownload.statusCode, 404, noImageDownload.body);
  assert.deepEqual(noImageDownload.json(), { error: 'Stash image not found' });

  const otherItemStillPrivate = await app.inject({
    method: 'GET',
    url: `/stash/${otherStashId}/image`,
    headers: { authorization: ownerAuthorization },
  });
  assert.equal(otherItemStillPrivate.statusCode, 404, otherItemStillPrivate.body);
});
