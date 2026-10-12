import type { UserExportResponse } from '@/src/lib/models';

export type UserExportFile = {
  filename: string;
  mimeType: 'application/json';
  contents: string;
  summary: string;
};

function exportDateStamp(exportedAt: string) {
  const parsed = new Date(exportedAt);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10);
}

export function summariseUserExport(response: UserExportResponse) {
  return `${response.patterns.length} patterns, ${response.projects.length} projects, ${response.stashItems.length} stash items, ${response.chatSessions.length} chats, ${response.chatMessages.length} messages, ${response.rewriteSessions.length} rewrites`;
}

export function buildUserExportFile(response: UserExportResponse): UserExportFile {
  return {
    filename: `stitchsense-export-${exportDateStamp(response.exportedAt)}.json`,
    mimeType: 'application/json',
    contents: `${JSON.stringify(response, null, 2)}\n`,
    summary: summariseUserExport(response),
  };
}
