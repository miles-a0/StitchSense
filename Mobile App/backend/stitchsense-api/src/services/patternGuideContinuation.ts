export type ChatHistoryEntry = {
  role: string;
  content: string;
  tool_mode?: string | null;
};

const GUIDE_REQUEST =
  /row\s*by\s*row|round\s*by\s*round|step\s*by\s*step|detailed\s+guide|complete\s+guide|full\s+guide|how\s+do\s+i\s+make|guide\s+to\s+making/i;

const SIZE_QUESTION =
  /\b(?:what|which)\s+size\b|\bsize\s+(?:would|do|are)\s+you\b|\bchoose\s+(?:a|your)\s+size\b|\bwhich\s+(?:one|version)\b/i;

const NAMED_SIZE = /\b(?:extra[\s-]?small|small|medium|large|extra[\s-]?large|xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\b/i;
const SIZE_PREFIX = /\bsize\s*[:=-]?\s*([a-z0-9./-]+(?:\s+[a-z]+)?)\b/i;
const SHORT_SIZE = /^(?:xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl|\d{1,3}(?:\.\d+)?)$/i;

function normaliseSize(value: string) {
  const compact = value.trim().replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    xxs: 'XXS',
    xs: 'XS',
    s: 'Small (S)',
    small: 'Small (S)',
    m: 'Medium (M)',
    medium: 'Medium (M)',
    l: 'Large (L)',
    large: 'Large (L)',
    xl: 'XL',
    xxl: 'XXL',
    '2xl': '2XL',
    '3xl': '3XL',
    '4xl': '4XL',
    '5xl': '5XL',
    'extra small': 'Extra Small (XS)',
    'extra-small': 'Extra Small (XS)',
    'extra large': 'Extra Large (XL)',
    'extra-large': 'Extra Large (XL)',
  };
  return aliases[compact.toLowerCase()] ?? compact;
}

function extractSizeReply(content: string) {
  const trimmed = content.trim().replace(/[.!]+$/, '').trim();
  if (SHORT_SIZE.test(trimmed)) return normaliseSize(trimmed);

  const prefixed = trimmed.match(SIZE_PREFIX)?.[1];
  if (prefixed && (SHORT_SIZE.test(prefixed) || NAMED_SIZE.test(prefixed))) {
    return normaliseSize(prefixed);
  }

  // Accept natural replies such as "I want medium" without treating a longer,
  // unrelated message that happens to mention a size as a continuation.
  if (trimmed.split(/\s+/).length <= 10) {
    const named = trimmed.match(NAMED_SIZE)?.[0];
    if (named) return normaliseSize(named);
  }
  return null;
}

export function resolvePatternGuideContinuation(
  content: string,
  historyNewestFirst: ChatHistoryEntry[],
) {
  const size = extractSizeReply(content);
  if (!size) return null;

  const previous = historyNewestFirst.filter(
    (message) => !(message.role === 'user' && message.content.trim() === content.trim()),
  );
  const assistantAskedForSize = previous.some(
    (message) => message.role === 'assistant' && SIZE_QUESTION.test(message.content),
  );
  const guideWasRequested = previous.some(
    (message) =>
      (message.role === 'user' && GUIDE_REQUEST.test(message.content)) ||
      message.tool_mode === 'pattern_step_guide',
  );

  if (!assistantAskedForSize || !guideWasRequested) return null;

  return {
    size,
    question:
      `The requested pattern size is ${size}. ` +
      'Continue the earlier request now and produce the full step-by-step, row-by-row guide for that size using the uploaded pattern.',
  };
}
