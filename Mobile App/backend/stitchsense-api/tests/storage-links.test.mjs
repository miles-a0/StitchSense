import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
process.env.PUBLIC_API_BASE_URL = 'https://api.example.test/';

const storage = await import('../dist/services/storage.js');

const key = 'user-1/pattern-1/1791800000000-abc-Hat.pdf';
const now = Date.UTC(2026, 9, 13, 12, 0, 0);

function parts(url) {
  const parsed = new URL(url);
  return { parsed, k: parsed.searchParams.get('k'), e: parsed.searchParams.get('e'), s: parsed.searchParams.get('s') };
}

test('stored files are linked through the public API, never the storage endpoint', async () => {
  const { parsed, k, e } = parts(await storage.signedStorageUrl(key, 900, now));
  assert.equal(parsed.origin, 'https://api.example.test');
  assert.equal(parsed.pathname, '/files/signed');
  assert.equal(Buffer.from(k, 'base64url').toString('utf8'), key);
  assert.equal(Number(e), Math.floor(now / 1000) + 900);
  assert.doesNotMatch(parsed.toString(), /X-Amz|:9000|minio|host\.docker\.internal/i);
});

test('a valid link verifies to its object key until it expires', async () => {
  const { k, e, s } = parts(await storage.signedStorageUrl(key, 900, now));
  assert.equal(storage.verifyStorageLink(k, e, s, now), key);
  assert.equal(storage.verifyStorageLink(k, e, s, now + 899_000), key);
  assert.equal(storage.verifyStorageLink(k, e, s, now + 901_000), null);
});

test('tampered, swapped, or malformed links are refused', async () => {
  const { k, e, s } = parts(await storage.signedStorageUrl(key, 900, now));
  const other = parts(await storage.signedStorageUrl('user-2/pattern-9/other.pdf', 900, now));

  assert.equal(storage.verifyStorageLink(k, e, `${s.slice(0, -1)}${s.endsWith('0') ? '1' : '0'}`, now), null);
  assert.equal(storage.verifyStorageLink(other.k, e, s, now), null, 'signature for one key must not unlock another');
  assert.equal(storage.verifyStorageLink(k, String(Number(e) + 3600), s, now), null, 'expiry cannot be extended');
  assert.equal(storage.verifyStorageLink(k, e, undefined, now), null);
  assert.equal(storage.verifyStorageLink(undefined, e, s, now), null);
  assert.equal(storage.verifyStorageLink(k, '12abc', s, now), null);
  assert.equal(storage.verifyStorageLink(`${k}==`, e, s, now), null, 'non-canonical key encoding is refused');
});

test('links are signed with a key derived from JWT_SECRET, not the secret itself', async () => {
  const { createHmac } = await import('node:crypto');
  const expires = 1791800000;
  const direct = createHmac('sha256', process.env.JWT_SECRET).update(`stitchsense-storage-link\n${key}\n${expires}`).digest('hex');
  assert.notEqual(storage.signStorageLink(key, expires), direct);
});
