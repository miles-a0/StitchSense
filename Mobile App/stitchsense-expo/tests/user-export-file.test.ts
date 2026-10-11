import assert from 'node:assert/strict';
import test from 'node:test';

import type { UserExportResponse } from '../src/lib/models';
import { buildUserExportFile } from '../src/lib/user-export-file';

function exportResponse(overrides: Partial<UserExportResponse> = {}): UserExportResponse {
  return {
    exportedAt: '2026-10-11T15:30:00.000Z',
    userId: 'user-1',
    account: { email: 'knitter@example.test', display_name: 'Knitter' },
    subscriptions: [{ provider: 'revenuecat', status: 'active' }],
    patterns: [{ id: 'p1' }, { id: 'p2' }],
    projects: [{ id: 'proj1' }],
    projectCounters: [],
    projectWorkLog: [],
    projectPatternMarks: [],
    projectPhotos: [],
    stashItems: [{ id: 's1' }],
    chatSessions: [{ id: 'c1' }],
    chatMessages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    rewriteSessions: [],
    settings: null,
    connections: [],
    ...overrides,
  };
}

test('user export file contains the complete export, not just counts', () => {
  const response = exportResponse();
  const file = buildUserExportFile(response);

  assert.equal(file.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(file.contents), response);
});

test('user export file is named by export date', () => {
  assert.equal(buildUserExportFile(exportResponse()).filename, 'stitchsense-export-2026-10-11.json');
});

test('user export file falls back to today when the export date is invalid', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(
    buildUserExportFile(exportResponse({ exportedAt: 'not-a-date' })).filename,
    `stitchsense-export-${today}.json`,
  );
});

test('user export summary reports the record counts shown on the account screen', () => {
  assert.equal(
    buildUserExportFile(exportResponse()).summary,
    '2 patterns, 1 projects, 1 stash items, 1 chats, 3 messages, 0 rewrites',
  );
});
