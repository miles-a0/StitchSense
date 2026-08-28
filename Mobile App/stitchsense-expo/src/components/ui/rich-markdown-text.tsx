import React, { Fragment, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/src/theme/tokens';

type RichMarkdownTextProps = {
  text: string;
  variant?: 'default' | 'inverse';
};

type InlineSegment = {
  text: string;
  style: 'plain' | 'bold' | 'italic' | 'code';
};

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] };

function parseInlineSegments(content: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /(\*\*.+?\*\*|__.+?__|(?<!\*)\*[^*\n]+?\*(?!\*)|(?<!_)_[^_\n]+?_(?!_)|`[^`\n]+?`)/g;
  let cursor = 0;

  for (const match of content.matchAll(pattern)) {
    const matchedText = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      segments.push({ text: content.slice(cursor, index), style: 'plain' });
    }

    const markerLength = matchedText.startsWith('**') || matchedText.startsWith('__') ? 2 : 1;
    segments.push({
      text: matchedText.slice(markerLength, -markerLength),
      style:
        markerLength === 2 ? 'bold' : matchedText.startsWith('`') ? 'code' : 'italic',
    });
    cursor = index + matchedText.length;
  }

  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor), style: 'plain' });
  }

  return segments.length > 0 ? segments : [{ text: content, style: 'plain' }];
}

function normaliseRichText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:p|div)\b[^>]*>/gi, '\n')
    .replace(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gis, (_match, level: string, content: string) =>
      `${'#'.repeat(Math.min(Number(level), 3))} ${content}\n`,
    )
    .replace(/<li\b[^>]*>(.*?)<\/li>/gis, '- $1\n')
    .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<(?:strong|b)\b[^>]*>(.*?)<\/(?:strong|b)>/gis, '**$1**')
    .replace(/<(?:em|i)\b[^>]*>(.*?)<\/(?:em|i)>/gis, '*$1*')
    .replace(/<code\b[^>]*>(.*?)<\/code>/gis, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pushParagraph(buffer: string[], blocks: Block[]) {
  const content = buffer.join(' ').replace(/\s+/g, ' ').trim();
  if (content) {
    blocks.push({ type: 'paragraph', content });
  }
  buffer.length = 0;
}

function parseBlocks(text: string): Block[] {
  const lines = normaliseRichText(text).split('\n');
  const blocks: Block[] = [];
  const paragraphBuffer: string[] = [];

  let activeList: { type: 'unordered-list' | 'ordered-list'; items: string[] } | null = null;

  function flushList() {
    if (activeList && activeList.items.length > 0) {
      blocks.push(activeList);
    }
    activeList = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      pushParagraph(paragraphBuffer, blocks);
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s*(.*?)\s*#*$/);
    if (headingMatch) {
      pushParagraph(paragraphBuffer, blocks);
      flushList();
      blocks.push({
        type: 'heading',
        level: Math.min(headingMatch[1].length, 3) as 1 | 2 | 3,
        content: headingMatch[2].trim(),
      });
      continue;
    }

    const unorderedMatch = line.match(/^[-*•]\s+(.*)$/);
    if (unorderedMatch) {
      pushParagraph(paragraphBuffer, blocks);
      if (!activeList || activeList.type !== 'unordered-list') {
        flushList();
        activeList = { type: 'unordered-list', items: [] };
      }
      activeList.items.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      pushParagraph(paragraphBuffer, blocks);
      if (!activeList || activeList.type !== 'ordered-list') {
        flushList();
        activeList = { type: 'ordered-list', items: [] };
      }
      activeList.items.push(orderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  pushParagraph(paragraphBuffer, blocks);
  flushList();

  return blocks;
}

export function RichMarkdownText({
  text,
  variant = 'default',
}: RichMarkdownTextProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const palette = variant === 'inverse' ? inversePalette : defaultPalette;

  return (
    <View style={styles.stack}>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'heading') {
          return (
            <Text
              key={`heading-${blockIndex}`}
              style={[
                styles.heading,
                block.level === 1 ? styles.headingLarge : null,
                block.level === 2 ? styles.headingMedium : null,
                block.level === 3 ? styles.headingSmall : null,
                { color: palette.heading },
              ]}>
              {block.content}
            </Text>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <Text
              key={`paragraph-${blockIndex}`}
              style={[styles.paragraph, { color: palette.body }]}>
              {parseInlineSegments(block.content).map((segment, segmentIndex) => (
                <Text
                  key={`segment-${blockIndex}-${segmentIndex}`}
                  style={
                    segment.style === 'bold'
                      ? styles.bold
                      : segment.style === 'italic'
                        ? styles.italic
                        : segment.style === 'code'
                          ? styles.code
                          : null
                  }>
                  {segment.text}
                </Text>
              ))}
            </Text>
          );
        }

        return (
          <View key={`list-${blockIndex}`} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              <View key={`item-${blockIndex}-${itemIndex}`} style={styles.listRow}>
                <Text style={[styles.listMarker, { color: palette.heading }]}>
                  {block.type === 'ordered-list' ? `${itemIndex + 1}.` : '•'}
                </Text>
                <Text style={[styles.listText, { color: palette.body }]}>
                  {parseInlineSegments(item).map((segment, segmentIndex) => (
                    <Fragment key={`item-segment-${blockIndex}-${itemIndex}-${segmentIndex}`}>
                      <Text
                        style={
                          segment.style === 'bold'
                            ? styles.bold
                            : segment.style === 'italic'
                              ? styles.italic
                              : segment.style === 'code'
                                ? styles.code
                                : null
                        }>
                        {segment.text}
                      </Text>
                    </Fragment>
                  ))}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const defaultPalette = {
  body: tokens.color.text,
  heading: tokens.color.primary,
};

const inversePalette = {
  body: '#fff',
  heading: '#fff',
};

const styles = StyleSheet.create({
  stack: {
    gap: tokens.spacing.sm,
  },
  heading: {
    fontWeight: '800',
    lineHeight: 28,
  },
  headingLarge: {
    fontSize: 22,
  },
  headingMedium: {
    fontSize: 19,
  },
  headingSmall: {
    fontSize: 17,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    backgroundColor: tokens.color.surfaceWarm,
    fontFamily: 'monospace',
  },
  list: {
    gap: tokens.spacing.xs,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  listMarker: {
    width: 18,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '700',
  },
  listText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
  },
});
