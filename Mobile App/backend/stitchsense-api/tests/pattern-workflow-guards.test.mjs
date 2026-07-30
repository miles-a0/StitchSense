import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ownedSourceRequiredMessage,
  patternHasScopedContent,
  patternNeedsOwnedSource,
  selectedPatternUnavailableMessage,
} from '../dist/services/patternWorkflowGuards.js';

test('paid Ravelry metadata-only patterns require owned source content', () => {
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      metadata: {
        ravelry_availability: 'paid',
        ravelry_is_free: false,
        pdf_url: 'https://example.test/pattern.pdf',
      },
    }),
    true,
  );
  assert.match(ownedSourceRequiredMessage(), /purchase the pattern and re-import/i);
});

test('stored file or extracted source content satisfies scoped pattern context', () => {
  assert.equal(
    patternNeedsOwnedSource({
      source: 'ravelry',
      fileKey: 'patterns/user/pattern.pdf',
      metadata: {
        ravelry_availability: 'paid',
        ravelry_is_free: false,
        pdf_url: 'https://example.test/pattern.pdf',
      },
    }),
    false,
  );
  assert.equal(
    patternHasScopedContent({
      fileKey: 'patterns/user/pattern.pdf',
      metadata: {},
    }),
    true,
  );
  assert.equal(
    patternHasScopedContent({
      metadata: { extracted_text: 'Row 1: Knit across.' },
    }),
    true,
  );
});

test('pattern-aware tools reject empty scoped context consistently', () => {
  assert.equal(
    patternHasScopedContent({
      fileUrl: '',
      fileKey: '',
      fileId: '',
      jobId: '',
      patternSummaryText: '',
      patternSummaryHtml: '',
      patternSummaryStructured: {},
      metadata: {},
    }),
    false,
  );
  assert.match(selectedPatternUnavailableMessage(), /re-upload or re-import/i);
});
