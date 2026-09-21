import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Pattern } from '@/src/lib/models';
import { authenticatedImageSource } from '@/src/lib/api';
import { hasStructuredSummary } from '@/src/lib/pattern-content-readiness';
import { useSession } from '@/src/providers/session-provider';
import { shadows, tokens } from '@/src/theme/tokens';

type PatternCardProps = {
  pattern: Pattern;
  onPress: () => void;
  stashHint?: string | null;
};

export function PatternCard({ pattern, onPress, stashHint }: PatternCardProps) {
  const { accessToken } = useSession();
  const sourceLabel =
    pattern.source === 'ravelry'
      ? 'Ravelry'
      : pattern.source === 'rewrite'
        ? 'Rewritten'
        : pattern.source === 'import'
          ? 'Imported'
          : 'Uploaded';
  const previewLabel = pattern.craftType?.trim() || 'Pattern';
  const isPdfPattern =
    (pattern.fileMimeType ?? '').toLowerCase().includes('pdf') ||
    /\.pdf$/i.test(pattern.originalFilename ?? '');
  const hasRemoteThumbnail =
    typeof pattern.thumbnailUrl === 'string' &&
    (/^https?:\/\//i.test(pattern.thumbnailUrl) || /^data:image\//i.test(pattern.thumbnailUrl));
  const remoteThumbnailUrl =
    hasRemoteThumbnail && typeof pattern.thumbnailUrl === 'string' ? pattern.thumbnailUrl : undefined;
  const hasSummaryDetails =
    Boolean(pattern.patternSummaryText?.trim()) || hasStructuredSummary(pattern.patternSummaryStructured);
  const needsDetails = !hasSummaryDetails || !pattern.craftType?.trim();
  const signals = [
    isPdfPattern ? 'PDF' : null,
    stashHint ? 'Stash ready' : null,
    needsDetails ? 'Needs details' : null,
  ].filter((signal): signal is string => Boolean(signal));
  const tags = [previewLabel, sourceLabel].filter(Boolean).slice(0, 2);
  const updatedLabel = pattern.updatedAt ? new Date(pattern.updatedAt).toLocaleDateString() : 'Recently synced';
  const detailLine = pattern.originalFilename ?? `${sourceLabel} pattern`;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
      <View style={styles.topRow}>
        <View style={styles.thumbShell}>
          {hasRemoteThumbnail ? (
            <Image
              contentFit="cover"
              source={authenticatedImageSource(remoteThumbnailUrl!, accessToken)}
              style={styles.thumbImage}
              transition={250}
            />
          ) : (
            <View style={[styles.thumbFallback, isPdfPattern ? styles.thumbFallbackPdf : null]}>
              <Text style={styles.thumbBadge}>{isPdfPattern ? 'PDF' : sourceLabel.toUpperCase()}</Text>
              <Text numberOfLines={2} style={styles.thumbTitle}>
                {previewLabel}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.headingBlock}>
          <Text numberOfLines={2} style={styles.title}>
            {pattern.title}
          </Text>
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={`${pattern.id}-${tag}`} style={styles.tag}>
                <Text numberOfLines={1} style={styles.tagText}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.detailBlock}>
        <View style={styles.activityRow}>
          <Text style={styles.activityText}>{pattern.activityCounts?.chats ?? 0} chats</Text>
          <Text style={styles.activityDivider}>•</Text>
          <Text style={styles.activityText}>{pattern.activityCounts?.rewrites ?? 0} rewrites</Text>
          <Text style={styles.activityDivider}>•</Text>
          <Text numberOfLines={1} style={styles.activityText}>{updatedLabel}</Text>
          {pattern.isArchived ? (
            <>
              <Text style={styles.activityDivider}>•</Text>
              <Text style={styles.archived}>Archived</Text>
            </>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          {detailLine}
        </Text>
        {stashHint ? (
          <View style={styles.stashHint}>
            <Text numberOfLines={1} style={styles.stashHintText}>{stashHint}</Text>
          </View>
        ) : null}

        {signals.length ? (
          <View style={styles.signalRow}>
            {signals.slice(0, 3).map((signal) => (
              <View key={`${pattern.id}-${signal}`} style={styles.signalPill}>
                <Text numberOfLines={1} style={styles.signalText}>{signal}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: tokens.component.cardBorderWidth,
    borderColor: tokens.color.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
    ...shadows.soft,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ translateY: 1 }],
  },
  thumbShell: {
    width: 92,
    height: 92,
    borderRadius: tokens.radius.medium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    flexShrink: 0,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    justifyContent: 'space-between',
    padding: tokens.spacing.sm,
    backgroundColor: tokens.color.surfaceWarm,
  },
  thumbFallbackPdf: {
    backgroundColor: '#efe9df',
  },
  thumbBadge: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  thumbTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 14,
    lineHeight: 17,
    marginTop: tokens.spacing.xs,
    textTransform: 'capitalize',
  },
  headingBlock: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
    minWidth: 0,
  },
  title: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 20,
    lineHeight: 24,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  tag: {
    backgroundColor: '#efe7dc',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  tagText: {
    color: tokens.color.primary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailBlock: {
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.md,
  },
  meta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    lineHeight: 16,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  activityText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    fontWeight: '800',
  },
  activityDivider: {
    color: 'rgba(20, 63, 54, 0.32)',
    fontSize: 12,
  },
  archived: {
    color: tokens.color.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  stashHint: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  stashHintText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  signalPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  signalText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
