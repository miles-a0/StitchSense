import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCachedPattern } from '../src/lib/library-cache-patterns';
import {
  patternHasScopedContent,
  patternNeedsOwnedSource,
} from '../src/lib/pattern-content-readiness';
import type { Pattern } from '../src/lib/models';

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pattern-1',
    title: 'Cached cardigan',
    source: 'ravelry',
    ...overrides,
  };
}

test('cached patterns preserve readiness signals without full summary or extracted text payloads', () => {
  const largeExtractedText = 'Row 1: knit. '.repeat(200);
  const largeSummary = 'A richly detailed cardigan summary. '.repeat(100);
  const cached = normalizeCachedPattern(
    pattern({
      fileId: 'file-123',
      jobId: 'job-456',
      patternSummaryText: largeSummary,
      patternSummaryHtml: '<p>Summary</p>',
      patternSummaryStructured: { overview: 'ready' },
      metadata: {
        extracted_text: largeExtractedText,
        summary_excerpt: largeSummary,
        stored_pdf_url: 's3://private/pattern.pdf',
        pdf_url: 'https://ravelry.example.test/download',
        ravelry_availability: 'paid',
        ravelry_is_free: false,
      },
    }),
  );

  assert.equal(cached.fileId, 'file-123');
  assert.equal(cached.jobId, 'job-456');
  assert.equal(cached.patternSummaryText, null);
  assert.equal(cached.patternSummaryHtml, null);
  assert.deepEqual(cached.patternSummaryStructured, { cached_readiness_signal: true });
  assert.deepEqual(cached.metadata, {
    ravelry_id: null,
    thumbnail_url: null,
    stored_pdf_url: '1',
    extracted_text: '1',
    summary_excerpt: '1',
    pdf_url: '1',
    ravelry_availability: 'paid',
    ravelry_is_free: false,
  });
  assert.equal(JSON.stringify(cached).includes(largeExtractedText), false);
  assert.equal(JSON.stringify(cached).includes(largeSummary), false);
  assert.equal(patternHasScopedContent(cached), true);
  assert.equal(patternNeedsOwnedSource(cached), false);
});

test('cached paid Ravelry metadata-only patterns preserve source-required detection', () => {
  const cached = normalizeCachedPattern(
    pattern({
      metadata: {
        pdf_url: 'https://ravelry.example.test/download',
        ravelry_is_free: false,
      },
    }),
  );

  assert.equal(patternHasScopedContent(cached), false);
  assert.equal(patternNeedsOwnedSource(cached), true);
});

test('cached empty structured summaries do not become readiness signals', () => {
  const cached = normalizeCachedPattern(
    pattern({
      source: 'upload',
      patternSummaryStructured: {},
    }),
  );

  assert.equal(cached.patternSummaryStructured, null);
  assert.equal(patternHasScopedContent(cached), false);
});
