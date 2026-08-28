import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePatternGuideContinuation } from '../dist/services/patternGuideContinuation.js';

const conversation = [
  { role: 'user', content: 'Medium', tool_mode: 'pattern_chat' },
  { role: 'assistant', content: 'What size would you like to make?' },
  {
    role: 'user',
    content: 'Give me a full row-by-row guide for this pattern.',
    tool_mode: 'pattern_step_guide',
  },
];

for (const [reply, expected] of [
  ['Medium', 'Medium (M)'],
  ['M', 'Medium (M)'],
  ['size M', 'Medium (M)'],
  ['I want medium', 'Medium (M)'],
  ['XL', 'XL'],
]) {
  test(`continues a pending pattern guide for "${reply}"`, () => {
    const result = resolvePatternGuideContinuation(reply, [
      { ...conversation[0], content: reply },
      ...conversation.slice(1),
    ]);
    assert.equal(result?.size, expected);
    assert.match(result?.question ?? '', /full step-by-step, row-by-row guide/i);
  });
}

test('does not reinterpret a standalone size without a preceding size question', () => {
  assert.equal(
    resolvePatternGuideContinuation('M', [
      { role: 'user', content: 'M' },
      { role: 'user', content: 'Give me a row-by-row guide.' },
    ]),
    null,
  );
});

test('does not reinterpret a size question outside a guide conversation', () => {
  assert.equal(
    resolvePatternGuideContinuation('Medium', [
      { role: 'user', content: 'Medium' },
      { role: 'assistant', content: 'Which size are you?' },
      { role: 'user', content: 'What jumper size am I?' },
    ]),
    null,
  );
});
