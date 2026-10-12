import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.WORDPRESS_SITE_URL = 'https://knit.example.test';
process.env.WORDPRESS_BRIDGE_SHARED_SECRET = 'test-wordpress-secret-with-more-than-32-characters';

const files = await import('../dist/services/wordpressPatternFiles.js');

test('WordPress pattern file paths are recognised only for managed uploads on the configured site', () => {
  assert.equal(
    files.wordpressPatternFilePath('https://knit.example.test/wp-content/uploads/stitchsense/patterns/user-4/a.pdf'),
    'stitchsense/patterns/user-4/a.pdf',
  );
  assert.equal(
    files.wordpressPatternFilePath('https://www.knit.example.test/wp-content/uploads/stitchsense/ravelry/2026/06/Hat%20One-12.pdf'),
    'stitchsense/ravelry/2026/06/Hat One-12.pdf',
  );
  assert.equal(files.wordpressPatternFilePath('https://elsewhere.test/wp-content/uploads/stitchsense/patterns/user-4/a.pdf'), null);
  assert.equal(files.wordpressPatternFilePath('https://knit.example.test/wp-content/uploads/2026/06/a.pdf'), null);
  // Dot segments are resolved by URL parsing first, so ownership is checked against the real folder.
  assert.equal(
    files.wordpressPatternFilePath('https://knit.example.test/wp-content/uploads/stitchsense/patterns/user-4/../user-5/a.pdf'),
    'stitchsense/patterns/user-5/a.pdf',
  );
  assert.equal(
    files.wordpressPatternFilePath('https://knit.example.test/wp-content/uploads/stitchsense/patterns/%2E%2E/%2E%2E/2026/a.pdf'),
    null,
  );
  assert.equal(
    files.wordpressPatternFilePath('https://knit.example.test/wp-content/uploads/stitchsense/patterns/user-4/..%2F..%2F..%2Fwp-config.php'),
    null,
  );
  assert.equal(
    files.wordpressPatternFilePath(
      'https://knit.example.test/wp-json/stitchsense/v1/pattern-files?path=stitchsense/patterns/../../../wp-config.php',
    ),
    null,
  );
  assert.equal(files.wordpressPatternFilePath('not a url'), null);
  assert.equal(files.wordpressPatternFilePath(null), null);
});

test('signed links round-trip to the same relative path and canonical upload address', () => {
  const relative = 'stitchsense/ravelry/2026/06/Hat One-12.pdf';
  const signed = new URL(files.signedWordPressPatternFileUrl(relative, 900, Date.UTC(2026, 9, 12) ));
  assert.equal(signed.origin + signed.pathname, 'https://knit.example.test/wp-json/stitchsense/v1/pattern-files');
  assert.equal(signed.searchParams.get('path'), relative);
  const expires = Number(signed.searchParams.get('expires'));
  assert.equal(expires, Date.UTC(2026, 9, 12) / 1000 + 900);
  assert.equal(signed.searchParams.get('sig'), files.signWordPressPatternFile(relative, expires));
  assert.match(signed.searchParams.get('sig'), /^[a-f0-9]{64}$/);

  assert.equal(files.wordpressPatternFilePath(signed.toString()), relative);
  assert.equal(
    files.normaliseIncomingPatternFileUrl(signed.toString()),
    'https://knit.example.test/wp-content/uploads/stitchsense/ravelry/2026/06/Hat%20One-12.pdf',
  );
  assert.equal(files.normaliseIncomingPatternFileUrl('https://example.test/other.pdf'), 'https://example.test/other.pdf');
});

test('signatures match the WordPress plugin for a fixed input', () => {
  // Same vector is asserted in tools/php-tests/protected-files.test.php.
  assert.equal(
    files.signWordPressPatternFile(
      'stitchsense/ravelry/2026/06/Hat One-12.pdf',
      1791800000,
      'test-wordpress-secret-with-more-than-32-characters',
    ),
    '960350baffe5098f3dda7b47de8121731cb5ff85769f9336518dcec299222b14',
  );
});

test('signatures change with the path, the expiry, and the secret', () => {
  const base = files.signWordPressPatternFile('stitchsense/patterns/user-4/a.pdf', 100);
  assert.notEqual(files.signWordPressPatternFile('stitchsense/patterns/user-5/a.pdf', 100), base);
  assert.notEqual(files.signWordPressPatternFile('stitchsense/patterns/user-4/a.pdf', 101), base);
  assert.notEqual(files.signWordPressPatternFile('stitchsense/patterns/user-4/a.pdf', 100, 'another-secret'), base);
});

test('legacy file owners are assigned only when exactly one user references the file', () => {
  const legacy = 'https://knit.example.test/wp-content/uploads/stitchsense/ravelry/2026/06/Hat-12.pdf';
  const shared = 'https://knit.example.test/wp-content/uploads/stitchsense/ravelry/2026/07/Socks-34.pdf';
  const plan = files.planLegacyWordPressFileOwners([
    { user_id: 'user-a', file_url: legacy, metadata: {} },
    { user_id: 'user-a', file_url: null, metadata: { parent_file_url: legacy } },
    { user_id: 'user-a', file_url: shared, metadata: {} },
    { user_id: 'user-b', file_url: null, metadata: { stored_pdf_relative_path: 'stitchsense/ravelry/2026/07/Socks-34.pdf' } },
    { user_id: 'user-c', file_url: 'https://knit.example.test/wp-content/uploads/stitchsense/patterns/user-9/x.pdf', metadata: {} },
    { user_id: 'user-c', file_url: 'https://example.test/elsewhere.pdf', metadata: {} },
  ]);

  assert.deepEqual([...plan.owners], [['stitchsense/ravelry/2026/06/Hat-12.pdf', 'user-a']]);
  assert.deepEqual([...plan.conflicts], [['stitchsense/ravelry/2026/07/Socks-34.pdf', ['user-a', 'user-b']]]);
});
