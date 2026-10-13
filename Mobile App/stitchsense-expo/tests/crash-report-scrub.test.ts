import assert from 'node:assert/strict';
import test from 'node:test';

import { scrubBreadcrumb, scrubEvent, stripUrlQuery } from '../src/lib/crash-report-scrub';

const signedLink =
  'https://stitchsense.zu-auto.co.uk/files/signed?k=dXNlci0xL3BhdHRlcm4tMQ&e=1791800000&s=abc123#page=2';

test('URL query strings and fragments are removed', () => {
  assert.equal(stripUrlQuery(signedLink), 'https://stitchsense.zu-auto.co.uk/files/signed');
  assert.equal(stripUrlQuery('/pattern-viewer?title=Callisto%20Hat'), '/pattern-viewer');
  assert.equal(stripUrlQuery('https://example.test/plain'), 'https://example.test/plain');
  assert.equal(stripUrlQuery(undefined), undefined);
});

test('console breadcrumbs are dropped because they can contain pattern text', () => {
  assert.equal(scrubBreadcrumb({ category: 'console', message: 'Row 12: k2tog to end' }), null);
});

test('network and navigation breadcrumbs keep the path but lose signatures, params and bodies', () => {
  const http = scrubBreadcrumb({
    category: 'fetch',
    data: { url: signedLink, method: 'GET', status_code: 200, body: '{"question":"How do I k2tog?"}' },
  });
  assert.deepEqual(http?.data, { url: 'https://stitchsense.zu-auto.co.uk/files/signed', method: 'GET', status_code: 200 });

  const navigation = scrubBreadcrumb({
    category: 'navigation',
    data: { from: '/library?title=Callisto%20Hat', to: '/pattern-viewer?id=1&title=Callisto%20Hat', params: { title: 'Callisto Hat' } },
  });
  assert.deepEqual(navigation?.data, { from: '/library', to: '/pattern-viewer' });
});

test('touch breadcrumbs lose their label text', () => {
  const touch = scrubBreadcrumb({ category: 'touch', message: 'Touch event within element: Open Callisto Hat', data: { path: [] } });
  assert.equal(touch?.message, undefined);
  assert.deepEqual(touch?.data, { path: [] });
});

test('events keep only the internal user ID and no request payload', () => {
  const event = scrubEvent({
    user: { id: 'user-uuid', email: 'knitter@example.test', ip_address: '203.0.113.9', username: 'knitter' },
    request: {
      url: signedLink,
      query_string: 'k=1&s=2',
      data: { pattern_instruction_text: 'Cast on 96 stitches' },
      headers: { Authorization: 'Bearer token' },
      cookies: { session: 'x' },
    },
    breadcrumbs: [
      { category: 'console', message: 'secret pattern text' },
      { category: 'fetch', data: { url: signedLink } },
    ],
  });

  assert.deepEqual(event.user, { id: 'user-uuid' });
  assert.deepEqual(event.request, { url: 'https://stitchsense.zu-auto.co.uk/files/signed' });
  assert.deepEqual(event.breadcrumbs, [{ category: 'fetch', data: { url: 'https://stitchsense.zu-auto.co.uk/files/signed' } }]);
  assert.doesNotMatch(JSON.stringify(event), /knitter@example|203\.0\.113|Cast on 96|Bearer|secret pattern|s=abc123/);
});

test('signed-out events carry no user details at all', () => {
  assert.deepEqual(scrubEvent({ user: { email: 'knitter@example.test' } }).user, {});
});
