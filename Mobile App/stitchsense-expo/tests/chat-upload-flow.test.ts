import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatPatternLoadedSummary,
  stripChatUploadFileExtension,
  uploadChatDocumentContext,
  type ChatUploadApi,
} from '../src/lib/chat-upload-flow';
import type { Pattern } from '../src/lib/models';

function pattern(id: string, overrides: Partial<Pattern> = {}): Pattern {
  return {
    id,
    title: 'Chat cardigan',
    source: 'chat_upload',
    ...overrides,
  };
}

test('chat document upload creates, indexes, refreshes, and returns scoped context', async () => {
  const calls: string[] = [];
  const phases: string[] = [];
  const messages: string[] = [];
  const statuses: string[] = [];
  const refreshedPattern = pattern('pattern-1', {
    title: 'Indexed cardigan',
    patternSummaryText: 'Difficulty: intermediate. Yarn: DK wool. Needles: 4 mm. Sizes: S, M, L.',
  });
  const api: ChatUploadApi = {
    async createPattern(token, body) {
      calls.push(`create:${token}`);
      assert.equal(body.title, 'chat-cardigan');
      assert.equal(body.craftType, null);
      assert.equal(body.originalFilename, 'chat-cardigan.pdf');
      assert.equal(body.source, 'chat_upload');
      assert.deepEqual(body.metadata, {
        uploadedFrom: 'expo-mobile-chat',
        localFilename: 'chat-cardigan.pdf',
      });
      return pattern('pattern-1');
    },
    async uploadPatternFile(id, token, file) {
      calls.push(`upload:${id}:${token}`);
      assert.deepEqual(file, {
        uri: 'file:///cache/chat-cardigan.pdf',
        name: 'chat-cardigan.pdf',
        mimeType: 'application/pdf',
      });
      return { indexed: true };
    },
    async refreshPatternSummary(id, token, skillLevel) {
      calls.push(`refreshSummary:${id}:${token}:${skillLevel}`);
      return { pattern: refreshedPattern };
    },
    async pattern(id, token) {
      calls.push(`pattern:${id}:${token}`);
      return pattern(id);
    },
    async deletePattern() {
      calls.push('delete');
    },
  };

  const result = await uploadChatDocumentContext(
    {
      accessToken: 'token-1',
      asset: {
        uri: 'file:///cache/chat-cardigan.pdf',
        name: 'chat-cardigan.pdf',
        mimeType: 'application/pdf',
      },
      skillLevel: 'beginner',
    },
    {
      api,
      onOverlayPhase: (phase) => phases.push(phase),
      onOverlayMessage: (message) => messages.push(message),
      onStatus: (message) => statuses.push(message),
    },
  );

  assert.equal(result.name, 'Indexed cardigan');
  assert.equal(result.kind, 'document');
  assert.equal(result.patternId, 'pattern-1');
  assert.match(result.introMessage, /Pattern loaded: Indexed cardigan/);
  assert.match(result.introMessage, /Which size would you like to make/);
  assert.equal(result.analysis, refreshedPattern.patternSummaryText);
  assert.deepEqual(calls, [
    'create:token-1',
    'upload:pattern-1:token-1',
    'refreshSummary:pattern-1:token-1:beginner',
  ]);
  assert.deepEqual(phases, ['uploading', 'uploading', 'processing']);
  assert.deepEqual(messages, [
    'Creating a private chat context for this pattern...',
    'Uploading the full pattern file...',
    'Processing and indexing the pattern. Larger PDFs can take a little while...',
  ]);
  assert.deepEqual(statuses, [
    'Reading pattern into chat context...',
    'Uploading pattern for chat...',
    'Analysing pattern for chat...',
  ]);
});

test('chat document upload rolls back the private pattern when upload fails', async () => {
  const calls: string[] = [];
  const api: ChatUploadApi = {
    async createPattern(token) {
      calls.push(`create:${token}`);
      return pattern('pattern-to-delete');
    },
    async uploadPatternFile(id, token) {
      calls.push(`upload:${id}:${token}`);
      throw new Error('Server returned 413.');
    },
    async refreshPatternSummary() {
      calls.push('refreshSummary');
      return { pattern: pattern('should-not-refresh') };
    },
    async pattern() {
      calls.push('pattern');
      return pattern('should-not-fetch');
    },
    async deletePattern(id, token) {
      calls.push(`delete:${id}:${token}`);
    },
  };

  await assert.rejects(
    uploadChatDocumentContext(
      {
        accessToken: 'token-1',
        asset: {
          uri: 'file:///cache/too-large.pdf',
          name: 'too-large.pdf',
        },
        skillLevel: 'beginner',
      },
      { api },
    ),
    /Server returned 413/,
  );

  assert.deepEqual(calls, [
    'create:token-1',
    'upload:pattern-to-delete:token-1',
    'delete:pattern-to-delete:token-1',
  ]);
});

test('chat document upload rolls back when indexing fails', async () => {
  const calls: string[] = [];
  const api: ChatUploadApi = {
    async createPattern() {
      calls.push('create');
      return pattern('unindexed-pattern');
    },
    async uploadPatternFile() {
      calls.push('upload');
      return { indexed: false, indexingError: 'Could not index this PDF.' };
    },
    async refreshPatternSummary() {
      calls.push('refreshSummary');
      return { pattern: pattern('should-not-refresh') };
    },
    async pattern() {
      calls.push('pattern');
      return pattern('should-not-fetch');
    },
    async deletePattern(id, token) {
      calls.push(`delete:${id}:${token}`);
    },
  };

  await assert.rejects(
    uploadChatDocumentContext(
      {
        accessToken: 'token-1',
        asset: {
          uri: 'file:///cache/unindexed.pdf',
          name: 'unindexed.pdf',
        },
        skillLevel: 'confident',
      },
      { api },
    ),
    /Could not index this PDF/,
  );

  assert.deepEqual(calls, ['create', 'upload', 'delete:unindexed-pattern:token-1']);
});

test('chat document upload stops before creating a private pattern without a token', async () => {
  const calls: string[] = [];
  const api: ChatUploadApi = {
    async createPattern() {
      calls.push('create');
      return pattern('should-not-create');
    },
    async uploadPatternFile() {
      calls.push('upload');
      return { indexed: true };
    },
    async refreshPatternSummary() {
      calls.push('refreshSummary');
      return { pattern: pattern('should-not-refresh') };
    },
    async pattern() {
      calls.push('pattern');
      return pattern('should-not-fetch');
    },
    async deletePattern() {
      calls.push('delete');
    },
  };

  await assert.rejects(
    uploadChatDocumentContext(
      {
        accessToken: null,
        asset: {
          uri: 'file:///cache/no-session.pdf',
          name: 'no-session.pdf',
        },
        skillLevel: 'beginner',
      },
      { api },
    ),
    /session has expired/i,
  );

  assert.deepEqual(calls, []);
});

test('chat document upload falls back to fetching the pattern when summary refresh fails', async () => {
  const calls: string[] = [];
  const fetchedPattern = pattern('pattern-1', {
    title: 'Fetched cardigan',
    patternSummaryText: 'The uploaded pattern is ready.',
  });
  const api: ChatUploadApi = {
    async createPattern() {
      calls.push('create');
      return pattern('pattern-1');
    },
    async uploadPatternFile() {
      calls.push('upload');
      return { indexed: true };
    },
    async refreshPatternSummary() {
      calls.push('refreshSummary');
      throw new Error('Refresh failed.');
    },
    async pattern(id, token) {
      calls.push(`pattern:${id}:${token}`);
      return fetchedPattern;
    },
    async deletePattern() {
      calls.push('delete');
    },
  };

  const result = await uploadChatDocumentContext(
    {
      accessToken: 'token-1',
      asset: {
        uri: 'file:///cache/fallback.pdf',
        name: 'fallback.pdf',
      },
      skillLevel: 'expert',
    },
    { api },
  );

  assert.equal(result.name, 'Fetched cardigan');
  assert.equal(result.analysis, 'The uploaded pattern is ready.');
  assert.deepEqual(calls, ['create', 'upload', 'refreshSummary', 'pattern:pattern-1:token-1']);
});

test('chat upload helpers format filenames and loaded summaries', () => {
  assert.equal(stripChatUploadFileExtension('my.pattern.v2.pdf'), 'my.pattern.v2');
  assert.equal(stripChatUploadFileExtension('pattern-without-extension'), 'pattern-without-extension');

  const intro = buildChatPatternLoadedSummary(
    pattern('one-size-pattern', {
      title: 'Hat',
      patternSummaryText:
        'A cosy hat. Difficulty: easy. Yarn: aran wool. Amount: 100 g. Needles: 5 mm. Size options: one size.',
    }),
    'hat.pdf',
  );
  assert.match(intro, /Pattern loaded: Hat/);
  assert.match(intro, /Size options: One size/);
});
