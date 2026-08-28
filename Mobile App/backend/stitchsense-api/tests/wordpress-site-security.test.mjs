import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normaliseWordPressSiteUrl,
  resolveWordPressSiteUrl,
} from '../dist/services/wordpressSite.js';

test('WordPress bridge site URL security', async (t) => {
  await t.test('normalises an approved HTTPS site and optional subdirectory', () => {
    assert.equal(normaliseWordPressSiteUrl(' https://catlowyarns.co.uk/ '), 'https://catlowyarns.co.uk');
    assert.equal(normaliseWordPressSiteUrl('https://example.com/wordpress/'), 'https://example.com/wordpress');
  });

  await t.test('rejects non-HTTPS production targets', () => {
    assert.throws(() => normaliseWordPressSiteUrl('http://127.0.0.1:8080'), /must use HTTPS/);
    assert.throws(() => normaliseWordPressSiteUrl('file:///etc/passwd'), /must use HTTPS/);
  });

  await t.test('rejects credentials, query strings, and fragments', () => {
    assert.throws(() => normaliseWordPressSiteUrl('https://user:password@example.com'), /must not contain/);
    assert.throws(() => normaliseWordPressSiteUrl('https://example.com?redirect=evil'), /must not contain/);
    assert.throws(() => normaliseWordPressSiteUrl('https://example.com/#fragment'), /must not contain/);
  });

  await t.test('rejects a client-selected host and accepts only the configured site', () => {
    assert.equal(
      resolveWordPressSiteUrl('https://catlowyarns.co.uk/', 'https://catlowyarns.co.uk'),
      'https://catlowyarns.co.uk',
    );
    assert.throws(
      () => resolveWordPressSiteUrl('https://catlowyarns.co.uk', 'https://attacker.example'),
      /does not match/,
    );
  });
});
