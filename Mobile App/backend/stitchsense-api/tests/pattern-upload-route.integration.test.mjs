import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT;

function multipartBody({ boundary, fieldName, filename, contentType, body }) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
      'utf8',
    ),
    Buffer.from(body, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
}

test('pattern upload route stores text files and sends indexing workflow payload', {
  skip: databaseUrl && objectStorageEndpoint ? false : 'TEST_DATABASE_URL and OBJECT_STORAGE_ENDPOINT are not configured',
}, async () => {
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
  process.env.N8N_UPLOAD_URL = 'http://workflow.test/upload';
  process.env.N8N_UPLOAD_SHARED_SECRET = 'test-upload-secret';
  process.env.WORDPRESS_BRIDGE_SHARED_SECRET = '';

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  for (const filename of (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(await fs.readFile(path.join('migrations', filename), 'utf8'));
  }

  const storage = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION,
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
    },
  });

  try {
    await storage.send(new CreateBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET }));
  } catch (error) {
    if (!String(error?.name ?? error).includes('BucketAlready')) {
      throw error;
    }
  }

  const uploadRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    uploadRequests.push({ input, init });
    assert.equal(String(input), 'http://workflow.test/upload');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['accept'], 'application/json');
    assert.equal(init.headers['x-stitchsense-secret'], 'test-upload-secret');
    assert.equal(init.headers['x-pattern-helper-secret'], 'test-upload-secret');
    assert.equal(typeof init.headers['content-type'], 'undefined');
    assert.equal(typeof init.body?.get, 'function');

    const formData = init.body;
    assert.equal(formData.get('secret'), 'test-upload-secret');
    const payload = JSON.parse(String(formData.get('payload')));
    assert.equal(payload.secret, 'test-upload-secret');
    assert.equal(payload.upload_transport, 'stitchsense_platform_file');
    assert.equal(payload.platform_pattern_id, patternId);
    assert.equal(payload.project_name, 'Seeded upload pattern');
    assert.equal(payload.file_name, 'notes.txt');
    assert.equal(payload.mime_type, 'text/plain; charset=utf-8');
    assert.equal(payload.file_extension, 'txt');
    assert.equal(payload.source_url, 'https://example.test/source');

    const workflowFile = formData.get('file');
    assert.equal(workflowFile.name, 'notes.txt');
    assert.equal(workflowFile.type, 'text/plain; charset=utf-8');
    assert.equal(await workflowFile.text(), uploadBody);
    assert.equal(await formData.get('data').text(), uploadBody);
    assert.equal(await formData.get('pattern_file').text(), uploadBody);

    return new Response(
      JSON.stringify({
        success: true,
        answer: 'Summary text',
        project_id: 'workflow-project-1',
        file_id: 'workflow-file-1',
        job_id: 'workflow-job-1',
        structured_data: {
          title: 'Workflow detected title',
          rows: [{ row: 1, instruction: 'Knit across.' }],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  let app;
  let pool;
  let patternId;
  const uploadBody = 'Row 1: Knit across.\nRow 2: Purl across.\n';
  try {
    const userId = (
      await client.query(
        `INSERT INTO users (email, display_name)
         VALUES ('upload-owner@example.test', 'Upload Owner')
         RETURNING id`,
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO manual_entitlements (user_id, type, reason)
       VALUES ($1, 'lifetime_pro', 'pattern upload route integration test')`,
      [userId],
    );
    patternId = (
      await client.query(
        `INSERT INTO user_patterns (user_id, title, craft_type, source_url, metadata, source)
         VALUES ($1, 'Seeded upload pattern', 'knitting', 'https://example.test/source', '{"existing":true}'::jsonb, 'upload')
         RETURNING id`,
        [userId],
      )
    ).rows[0].id;
    const unpaidUserId = (
      await client.query(
        `INSERT INTO users (email, display_name)
         VALUES ('upload-unpaid@example.test', 'Upload Unpaid')
         RETURNING id`,
      )
    ).rows[0].id;
    const unpaidPatternId = (
      await client.query(
        `INSERT INTO user_patterns (user_id, title, source)
         VALUES ($1, 'Unpaid upload pattern', 'upload')
         RETURNING id`,
        [unpaidUserId],
      )
    ).rows[0].id;

    const appModule = await import('../dist/app.js');
    const poolModule = await import('../dist/db/pool.js');
    app = await appModule.buildApp();
    pool = poolModule.pool;
    const authorization = `Bearer ${app.jwt.sign({ sub: userId })}`;
    const unpaidAuthorization = `Bearer ${app.jwt.sign({ sub: unpaidUserId })}`;
    const boundary = 'stitchsense-upload-test-boundary';

    const unpaidResponse = await app.inject({
      method: 'POST',
      url: `/patterns/${unpaidPatternId}/file`,
      headers: {
        authorization: unpaidAuthorization,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody({
        boundary,
        fieldName: 'file',
        filename: 'notes.txt',
        contentType: 'text/plain',
        body: uploadBody,
      }),
    });
    assert.equal(unpaidResponse.statusCode, 402, unpaidResponse.body);
    assert.equal(unpaidResponse.json().error, 'Subscription required');
    assert.equal(uploadRequests.length, 0);

    const invalidUpload = await app.inject({
      method: 'POST',
      url: `/patterns/${patternId}/file`,
      headers: {
        authorization,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody({
        boundary,
        fieldName: 'file',
        filename: 'not-a-pattern.png',
        contentType: 'image/png',
        body: 'definitely not a PDF or text upload',
      }),
    });
    assert.equal(invalidUpload.statusCode, 415, invalidUpload.body);
    assert.deepEqual(invalidUpload.json(), { error: 'Please upload a PDF or text-based pattern file.' });
    assert.equal(uploadRequests.length, 0);
    const rejectedPattern = (
      await client.query(
        `SELECT file_key, original_filename, file_mime_type, file_size
         FROM user_patterns
         WHERE id = $1`,
        [patternId],
      )
    ).rows[0];
    assert.deepEqual(rejectedPattern, {
      file_key: null,
      original_filename: null,
      file_mime_type: null,
      file_size: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/patterns/${patternId}/file`,
      headers: {
        authorization,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody({
        boundary,
        fieldName: 'file',
        filename: 'notes.txt',
        contentType: 'text/plain',
        body: uploadBody,
      }),
    });

    assert.equal(response.statusCode, 201, response.body);
    const responseBody = response.json();
    assert.equal(responseBody.fileSize, Buffer.byteLength(uploadBody));
    assert.equal(responseBody.storageProvider, process.env.OBJECT_STORAGE_PROVIDER);
    assert.equal(responseBody.projectId, 'workflow-project-1');
    assert.equal(responseBody.fileId, 'workflow-file-1');
    assert.equal(responseBody.jobId, 'workflow-job-1');
    assert.equal(responseBody.indexed, true);
    assert.equal(responseBody.indexingError, null);
    assert.match(responseBody.fileKey, new RegExp(`^${userId}/${patternId}/`));
    assert.equal(uploadRequests.length, 1);

    const storedPattern = (
      await client.query(
        `SELECT file_key, original_filename, file_mime_type, file_size, file_extension,
                storage_provider, project_id, file_id, job_id, pattern_summary_text,
                pattern_summary_html, pattern_summary_structured, metadata
         FROM user_patterns
         WHERE id = $1`,
        [patternId],
      )
    ).rows[0];
    assert.equal(storedPattern.file_key, responseBody.fileKey);
    assert.equal(storedPattern.original_filename, 'notes.txt');
    assert.equal(storedPattern.file_mime_type, 'text/plain; charset=utf-8');
    assert.equal(Number(storedPattern.file_size), Buffer.byteLength(uploadBody));
    assert.equal(storedPattern.file_extension, 'txt');
    assert.equal(storedPattern.storage_provider, process.env.OBJECT_STORAGE_PROVIDER);
    assert.equal(storedPattern.project_id, 'workflow-project-1');
    assert.equal(storedPattern.file_id, 'workflow-file-1');
    assert.equal(storedPattern.job_id, 'workflow-job-1');
    assert.equal(storedPattern.pattern_summary_text, 'Summary text');
    assert.match(storedPattern.pattern_summary_html, /Summary text/);
    assert.deepEqual(storedPattern.pattern_summary_structured, {
      title: 'Workflow detected title',
      rows: [{ row: 1, instruction: 'Knit across.' }],
    });
    assert.equal(storedPattern.metadata.existing, true);
    assert.match(storedPattern.metadata.upload_workflow_indexed_at, /^\d{4}-\d{2}-\d{2}T/);

    const storedObject = await storage.send(
      new GetObjectCommand({
        Bucket: process.env.OBJECT_STORAGE_BUCKET,
        Key: responseBody.fileKey,
      }),
    );
    assert.equal(storedObject.ContentType, 'text/plain; charset=utf-8');
    assert.equal(await storedObject.Body.transformToString(), uploadBody);
  } finally {
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    if (pool) await pool.end();
    await client.end();
    storage.destroy();
  }
});
