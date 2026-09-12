import assert from 'node:assert/strict';
import test from 'node:test';

import { choosePatternChatSession, choosePatternRewrite } from '../src/lib/pattern-binding';
import type { ChatSession, RewriteSession } from '../src/lib/models';

const chatSessions: ChatSession[] = [
  {
    id: 'chat-other-requested',
    userId: 'user-1',
    patternId: 'pattern-other',
    title: 'Wrong pattern requested chat',
  },
  {
    id: 'chat-current-latest',
    userId: 'user-1',
    patternId: 'pattern-current',
    title: 'Current pattern latest chat',
  },
  {
    id: 'chat-current-requested',
    userId: 'user-1',
    patternId: 'pattern-current',
    title: 'Current pattern requested chat',
  },
];

const rewrites: RewriteSession[] = [
  {
    id: 'rewrite-other-requested',
    userId: 'user-1',
    patternId: 'pattern-other',
    prompt: 'Wrong pattern requested rewrite',
    rewriteResult: 'wrong pattern',
  },
  {
    id: 'rewrite-current-latest',
    userId: 'user-1',
    patternId: 'pattern-current',
    prompt: 'Current pattern latest rewrite',
    rewriteResult: 'latest',
  },
  {
    id: 'rewrite-current-requested',
    userId: 'user-1',
    patternId: 'pattern-current',
    prompt: 'Current pattern requested rewrite',
    rewriteResult: 'requested',
  },
];

test('pattern chat binding prefers a requested session only when it belongs to the active pattern', () => {
  assert.equal(
    choosePatternChatSession(chatSessions, 'pattern-current', 'chat-current-requested')?.id,
    'chat-current-requested',
  );

  assert.equal(
    choosePatternChatSession(chatSessions, 'pattern-current', 'chat-other-requested')?.id,
    'chat-current-latest',
  );
});

test('pattern chat binding returns null when no session belongs to the active pattern', () => {
  assert.equal(choosePatternChatSession(chatSessions, 'pattern-missing', 'chat-other-requested'), null);
});

test('pattern rewrite binding ignores stale requested rewrites from another pattern', () => {
  assert.equal(
    choosePatternRewrite(rewrites, 'pattern-current', 'rewrite-current-requested')?.id,
    'rewrite-current-requested',
  );

  assert.equal(
    choosePatternRewrite(rewrites, 'pattern-current', 'rewrite-other-requested')?.id,
    'rewrite-current-latest',
  );
});

test('pattern rewrite binding returns null when no rewrite belongs to the active pattern', () => {
  assert.equal(choosePatternRewrite(rewrites, 'pattern-missing', 'rewrite-other-requested'), null);
});
