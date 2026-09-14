import assert from 'node:assert/strict';
import test from 'node:test';

import {
  patternUploadErrorMessage,
  stripPatternFileExtension,
  uploadPatternWithRollback,
  type PatternUploadApi,
} from '../src/lib/pattern-upload-flow';
import type { Pattern } from '../src/lib/models';

function pattern(id: string): Pattern {
  return {
    id,
    title: 'Uploaded cardigan',
    source: 'upload',
  };
}

test('pattern upload flow creates, uploads, refreshes, and returns the created pattern', async () => {
  const statuses: string[] = [];
  const calls: string[] = [];
  const createdPattern = pattern('pattern-1');
  const api: PatternUploadApi = {
    async createPattern(token, body) {
      calls.push(`create:${token}`);
      assert.equal(body.title, 'Autumn Cardigan');
      assert.equal(body.craftType, 'knitting');
      assert.equal(body.originalFilename, 'autumn-cardigan.pdf');
      assert.equal(body.sourceUrl, 'https://patterns.example.test/autumn');
      assert.deepEqual(body.metadata, {
        uploadedFrom: 'expo-mobile',
        localFilename: 'autumn-cardigan.pdf',
      });
      return createdPattern;
    },
    async uploadPatternFile(id, token, file) {
      calls.push(`upload:${id}:${token}`);
      assert.deepEqual(file, {
        uri: 'file:///cache/autumn-cardigan.pdf',
        name: 'autumn-cardigan.pdf',
        mimeType: 'application/pdf',
      });
      return { fileKey: 'pattern-1/file.pdf' };
    },
    async deletePattern() {
      calls.push('delete');
    },
  };

  const result = await uploadPatternWithRollback(
    {
      accessToken: 'stale-token',
      selectedFile: {
        uri: 'file:///cache/autumn-cardigan.pdf',
        name: 'autumn-cardigan.pdf',
        mimeType: 'application/pdf',
      },
      title: '  Autumn Cardigan  ',
      suggestedTitle: 'autumn-cardigan',
      craftType: 'knitting',
      sourceUrl: ' https://patterns.example.test/autumn ',
    },
    {
      api,
      async loadTokens() {
        calls.push('loadTokens');
        return { accessToken: 'fresh-token' };
      },
      async refreshAccount() {
        calls.push('refreshAccount');
      },
      async refreshPatterns() {
        calls.push('refreshPatterns');
      },
      onStatus(message) {
        statuses.push(message);
      },
    },
  );

  assert.equal(result, createdPattern);
  assert.deepEqual(statuses, ['Creating your pattern record\u2026', 'Uploading your file\u2026']);
  assert.deepEqual(calls, [
    'refreshAccount',
    'loadTokens',
    'create:fresh-token',
    'upload:pattern-1:fresh-token',
    'refreshPatterns',
  ]);
});

test('pattern upload flow rolls back a created pattern when file upload fails', async () => {
  const calls: string[] = [];
  const api: PatternUploadApi = {
    async createPattern(token, body) {
      calls.push(`create:${token}:${body.title}`);
      return pattern('pattern-to-clean-up');
    },
    async uploadPatternFile(id, token) {
      calls.push(`upload:${id}:${token}`);
      throw new Error('Server returned 413.');
    },
    async deletePattern(id, token) {
      calls.push(`delete:${id}:${token}`);
    },
  };

  await assert.rejects(
    uploadPatternWithRollback(
      {
        accessToken: 'original-token',
        selectedFile: {
          uri: 'file:///cache/oversized.pdf',
          name: 'oversized.pdf',
        },
        title: '',
        suggestedTitle: 'oversized',
        craftType: 'crochet',
        sourceUrl: '',
      },
      {
        api,
        async loadTokens() {
          calls.push('loadTokens');
          return { accessToken: calls.length > 3 ? 'cleanup-token' : 'fresh-token' };
        },
        async refreshAccount() {
          calls.push('refreshAccount');
        },
        async refreshPatterns() {
          calls.push('refreshPatterns');
        },
      },
    ),
    /Server returned 413/,
  );

  assert.deepEqual(calls, [
    'refreshAccount',
    'loadTokens',
    'create:fresh-token:oversized',
    'upload:pattern-to-clean-up:fresh-token',
    'loadTokens',
    'delete:pattern-to-clean-up:cleanup-token',
  ]);
});

test('pattern upload flow stops before creating a record when no active token remains', async () => {
  const calls: string[] = [];
  const api: PatternUploadApi = {
    async createPattern() {
      calls.push('create');
      return pattern('should-not-exist');
    },
    async uploadPatternFile() {
      calls.push('upload');
      return {};
    },
    async deletePattern() {
      calls.push('delete');
    },
  };

  await assert.rejects(
    uploadPatternWithRollback(
      {
        accessToken: null,
        selectedFile: {
          uri: 'file:///cache/no-session.pdf',
          name: 'no-session.pdf',
        },
        title: '',
        suggestedTitle: '',
        craftType: 'knitting',
        sourceUrl: '',
      },
      {
        api,
        async loadTokens() {
          calls.push('loadTokens');
          return { accessToken: null };
        },
        async refreshAccount() {
          calls.push('refreshAccount');
        },
        async refreshPatterns() {
          calls.push('refreshPatterns');
        },
      },
    ),
    /session has expired/i,
  );

  assert.deepEqual(calls, ['refreshAccount', 'loadTokens']);
});

test('pattern upload helpers format filenames and launch-friendly errors', () => {
  assert.equal(stripPatternFileExtension('my.pattern.v2.pdf'), 'my.pattern.v2');
  assert.equal(stripPatternFileExtension('pattern-without-extension'), 'pattern-without-extension');
  assert.equal(
    patternUploadErrorMessage(new Error('Your session has expired. Please sign in again.')),
    'Your session needs refreshing. Please sign in again.',
  );
});
