import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasStructuredSummary,
  patternHasScopedContent,
  patternNeedsOwnedSource,
} from '../src/lib/pattern-content-readiness';

test('pattern scoped content accepts every backend-supported content signal', () => {
  const contentSignals = [
    { name: 'fileKey', pattern: { fileKey: 'patterns/user/pattern.pdf' } },
    { name: 'fileUrl', pattern: { fileUrl: 'https://files.example.test/pattern.pdf' } },
    { name: 'fileId', pattern: { fileId: 'file-123' } },
    { name: 'jobId', pattern: { jobId: 'job-123' } },
    { name: 'summary text', pattern: { patternSummaryText: 'Cast on 40 stitches.' } },
    { name: 'summary HTML', pattern: { patternSummaryHtml: '<p>Cast on 40 stitches.</p>' } },
    { name: 'structured summary', pattern: { patternSummaryStructured: { sections: ['body'] } } },
    { name: 'extracted text', pattern: { metadata: { extracted_text: 'Row 1: knit.' } } },
    { name: 'summary excerpt', pattern: { metadata: { summary_excerpt: 'A small shawl.' } } },
    { name: 'stored PDF URL', pattern: { metadata: { stored_pdf_url: 's3://bucket/key.pdf' } } },
  ];

  for (const signal of contentSignals) {
    assert.equal(patternHasScopedContent(signal.pattern), true, signal.name);
  }
});

test('pattern scoped content rejects empty or malformed content signals', () => {
  assert.equal(patternHasScopedContent(null), false);
  assert.equal(patternHasScopedContent({}), false);
  assert.equal(patternHasScopedContent({ fileKey: '   ' }), false);
  assert.equal(patternHasScopedContent({ patternSummaryText: '\n\t' }), false);
  assert.equal(patternHasScopedContent({ patternSummaryHtml: '' }), false);
  assert.equal(patternHasScopedContent({ patternSummaryStructured: {} }), false);
  assert.equal(patternHasScopedContent({ metadata: { extracted_text: '   ' } }), false);
  assert.equal(patternHasScopedContent({ metadata: { summary_excerpt: null } }), false);
  assert.equal(patternHasScopedContent({ metadata: { stored_pdf_url: 123 } }), false);
});

test('structured summaries require a non-empty object', () => {
  assert.equal(hasStructuredSummary({ overview: 'ready' }), true);
  assert.equal(hasStructuredSummary({}), false);
  assert.equal(hasStructuredSummary(null), false);
  assert.equal(hasStructuredSummary(['not', 'the', 'expected', 'shape']), false);
  assert.equal(hasStructuredSummary('summary'), false);
});

test('paid or unavailable Ravelry patterns require owned source until a stored source exists', () => {
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: { ravelry_availability: 'paid', ravelry_is_free: false },
    }),
    true,
  );
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: { ravelry_availability: 'purchase_required', ravelry_is_free: false },
    }),
    true,
  );
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: { ravelry_availability: 'unknown', ravelry_is_free: false },
    }),
    true,
  );
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: { ravelry_is_free: false, pdf_url: 'https://ravelry.example.test/download' },
    }),
    true,
  );
});

test('Ravelry owned-source guard allows free patterns and patterns with stored source', () => {
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: { ravelry_availability: 'free', ravelry_is_free: true },
    }),
    false,
  );
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      fileKey: 'patterns/user/pattern.pdf',
      metadata: { ravelry_availability: 'paid', ravelry_is_free: false },
    }),
    false,
  );
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      fileId: 'file-123',
      metadata: { ravelry_availability: 'paid', ravelry_is_free: false },
    }),
    false,
  );
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: {
        ravelry_availability: 'paid',
        ravelry_is_free: false,
        stored_pdf_url: 's3://bucket/key.pdf',
      },
    }),
    false,
  );
});

test('non-Ravelry patterns never require Ravelry owned source', () => {
  assert.equal(
    patternNeedsOwnedSource({
      source: 'upload',
      metadata: { ravelry_availability: 'paid', ravelry_is_free: false },
    }),
    false,
  );
  assert.equal(patternNeedsOwnedSource({ source: null }), false);
});
