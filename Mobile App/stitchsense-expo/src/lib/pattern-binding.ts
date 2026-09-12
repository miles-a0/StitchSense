import type { ChatSession, RewriteSession } from '@/src/lib/models';

type PatternBoundRecord = {
  id: string;
  patternId?: string | null;
};

function matchesPattern<T extends PatternBoundRecord>(
  item: T,
  patternId: string,
  requestedId?: string | null,
) {
  return item.patternId === patternId && (!requestedId || item.id === requestedId);
}

export function choosePatternChatSession(
  sessions: ChatSession[],
  patternId: string,
  requestedSessionId?: string | null,
) {
  return (
    sessions.find((item) => matchesPattern(item, patternId, requestedSessionId)) ??
    sessions.find((item) => item.patternId === patternId) ??
    null
  );
}

export function choosePatternRewrite(
  rewrites: RewriteSession[],
  patternId: string,
  requestedRewriteId?: string | null,
) {
  return (
    rewrites.find((item) => matchesPattern(item, patternId, requestedRewriteId)) ??
    rewrites.find((item) => item.patternId === patternId) ??
    null
  );
}
