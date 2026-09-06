import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { config } from '../config.js';

const client = new S3Client({
  region: config.storage.region,
  endpoint: config.storage.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
  },
});

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.storage.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: config.storage.bucket }));
  }
  bucketReady = true;
}

export async function putPatternFile(input: {
  userId: string;
  patternId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}) {
  await ensureBucket();
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const checksum = createHash('sha256').update(input.buffer).digest('hex').slice(0, 16);
  const key = `${input.userId}/${input.patternId}/${Date.now()}-${checksum}-${safeFilename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.contentType,
      Metadata: {
        userId: input.userId,
        patternId: input.patternId,
      },
    }),
  );

  return {
    key,
    size: input.buffer.length,
    provider: config.storage.provider,
  };
}

export async function putProjectPhoto(input: {
  userId: string;
  projectId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}) {
  await ensureBucket();
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const checksum = createHash('sha256').update(input.buffer).digest('hex').slice(0, 16);
  const key = `${input.userId}/projects/${input.projectId}/${Date.now()}-${checksum}-${safeFilename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.contentType,
      Metadata: {
        userId: input.userId,
        projectId: input.projectId,
      },
    }),
  );

  return {
    key,
    size: input.buffer.length,
    provider: config.storage.provider,
  };
}

export async function putStashPhoto(input: {
  userId: string;
  stashItemId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}) {
  await ensureBucket();
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const checksum = createHash('sha256').update(input.buffer).digest('hex').slice(0, 16);
  const key = `${input.userId}/stash/${input.stashItemId}/${Date.now()}-${checksum}-${safeFilename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.contentType,
      Metadata: {
        userId: input.userId,
        stashItemId: input.stashItemId,
      },
    }),
  );

  return {
    key,
    size: input.buffer.length,
    provider: config.storage.provider,
  };
}

export async function signedPatternUrl(key: string, expiresIn = 900) {
  await ensureBucket();
  const command = new GetObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export const signedStorageUrl = signedPatternUrl;

export async function checkStorageReadiness() {
  await client.send(new HeadBucketCommand({ Bucket: config.storage.bucket }));
}

export async function getPatternFile(key: string) {
  await ensureBucket();
  const command = new GetObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
  });
  const response = await client.send(command);
  return {
    body: response.Body,
    contentType: response.ContentType ?? 'application/pdf',
    contentLength: response.ContentLength ?? null,
    metadata: response.Metadata ?? {},
    lastModified: response.LastModified ?? null,
  };
}
