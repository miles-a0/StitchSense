import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, createHmac } from 'node:crypto';
import { config } from '../config.js';
import { secureStringEquals } from './secureCompare.js';

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

// The Expo app's fetch percent-encodes multipart filenames ("Hat One.pdf" arrives as "Hat%20One.pdf").
export function uploadedFilename(raw: string | undefined, fallback: string) {
  if (!raw) return fallback;
  if (!/%[0-9A-Fa-f]{2}/.test(raw)) return raw;
  try {
    const decoded = decodeURIComponent(raw).replace(/[\\/\u0000-\u001f]/g, '_').trim();
    return decoded || fallback;
  } catch {
    return raw;
  }
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

export const storageLinkPath = '/files/signed';

// Derived from JWT_SECRET so storage links need no extra setting and cannot be confused with access tokens.
function storageLinkKey() {
  return createHmac('sha256', config.jwtSecret).update('stitchsense-storage-link-key').digest();
}

export function signStorageLink(key: string, expires: number) {
  return createHmac('sha256', storageLinkKey()).update(`stitchsense-storage-link\n${key}\n${expires}`).digest('hex');
}

// Returns the object key for a valid, unexpired link, or null.
export function verifyStorageLink(encodedKey: unknown, expires: unknown, signature: unknown, now = Date.now()) {
  if (typeof encodedKey !== 'string' || typeof expires !== 'string' || !/^\d{1,12}$/.test(expires)) return null;
  const expiresAt = Number(expires);
  if (expiresAt * 1000 < now) return null;
  let key: string;
  try {
    key = Buffer.from(encodedKey, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!key || Buffer.from(key, 'utf8').toString('base64url') !== encodedKey) return null;
  return secureStringEquals(signStorageLink(key, expiresAt), signature) ? key : null;
}

// Callers check ownership before asking for a link. Object storage is private to the server,
// so clients get a short-lived signed link to the API, which streams the object.
export async function signedPatternUrl(key: string, expiresIn = 900, now = Date.now()) {
  if (config.publicApiBaseUrl) {
    const expires = Math.floor(now / 1000) + expiresIn;
    const url = new URL(`${config.publicApiBaseUrl.replace(/\/+$/, '')}${storageLinkPath}`);
    url.searchParams.set('k', Buffer.from(key, 'utf8').toString('base64url'));
    url.searchParams.set('e', String(expires));
    url.searchParams.set('s', signStorageLink(key, expires));
    return url.toString();
  }

  // Local development without a public API address: hand out a direct presigned storage URL.
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

export function destroyStorageClient() {
  client.destroy();
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
