import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Project } from '@/src/lib/models';
import { authenticatedImageSource } from '@/src/lib/api';
import { useSession } from '@/src/providers/session-provider';
import { shadows, tokens } from '@/src/theme/tokens';

type ProjectCardProps = {
  project: Project;
  onPress: () => void;
  nextAction?: string | null;
};

function statusLabel(status: Project['status']) {
  switch (status) {
    case 'planned':
      return 'Planned';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    default:
      return 'Active';
  }
}

function statusTheme(status: Project['status']) {
  switch (status) {
    case 'planned':
      return { background: '#f4e9dc', text: tokens.color.primary };
    case 'paused':
      return { background: '#efe8dd', text: tokens.color.muted };
    case 'completed':
      return { background: '#e2f1e7', text: tokens.color.success };
    case 'archived':
      return { background: '#efe7e1', text: tokens.color.muted };
    default:
      return { background: '#ead7c5', text: tokens.color.primary };
  }
}

function deadlineState(deadline?: string | null) {
  if (!deadline) return null;
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Overdue';
  if (days <= 3) return 'Due soon';
  return null;
}

function progressTone(progress: number) {
  if (progress >= 100) return tokens.color.success;
  if (progress >= 65) return tokens.color.accent;
  return tokens.color.primary;
}

function projectContextHint(project: Project) {
  if (project.topCounter) {
    const target = project.topCounter.targetValue ? `/${project.topCounter.targetValue}` : '';
    return `${project.topCounter.label}: ${project.topCounter.currentValue}${target}`;
  }
  if (project.latestWorkLog?.title) {
    return `Last note: ${project.latestWorkLog.title}`;
  }
  if (project.recipient) {
    return `For ${project.recipient}`;
  }
  return project.stageLabel;
}

export function ProjectCard({ project, onPress, nextAction }: ProjectCardProps) {
  const { accessToken } = useSession();
  const thumbnailUrl = project.coverImageUrl || project.linkedPattern?.thumbnailUrl || null;
  const urgency = deadlineState(project.deadlineAt);
  const status = useMemo(() => statusTheme(project.status), [project.status]);
  const progressColor = progressTone(project.progressPercent);
  const contextHint = projectContextHint(project);

  return (
    <Pressable
      accessibilityHint="Open this project"
      accessibilityLabel={`Open project ${project.title}`}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        void Haptics.selectionAsync();
      }}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
      <View style={styles.thumbWrap}>
        {thumbnailUrl ? (
          <Image
            source={authenticatedImageSource(thumbnailUrl, accessToken)}
            style={styles.thumbImage}
            contentFit="cover"
            transition={250}
          />
        ) : (
          <View style={styles.thumbFallback}>
            <Text numberOfLines={3} style={styles.thumbFallbackText}>
              {project.linkedPattern?.title ?? 'Project'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {project.title}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: status.background }]}>
            <Text style={[styles.statusLabel, { color: status.text }]}>{statusLabel(project.status)}</Text>
          </View>
        </View>

        {nextAction ? (
          <View style={styles.nextActionPill}>
            <Text numberOfLines={1} style={styles.nextActionText}>{nextAction}</Text>
          </View>
        ) : null}

        {contextHint ? (
          <Text numberOfLines={1} style={styles.contextHint}>{contextHint}</Text>
        ) : null}

        <View style={styles.bottomRow}>
          <View style={styles.progressInline}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(8, project.progressPercent)}%`, backgroundColor: progressColor },
                ]}
              />
            </View>
            <Text style={styles.progressValue}>{project.progressPercent}%</Text>
          </View>

          {urgency ? (
            <View
              style={[
                styles.urgencyBadgeCompact,
                urgency === 'Overdue' ? styles.urgencyBadgeDanger : styles.urgencyBadgeWarning,
              ]}>
              <Text style={styles.urgencyLabel}>{urgency}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ translateY: 1 }],
  },
  thumbWrap: {
    width: 92,
    height: 92,
    borderRadius: tokens.radius.large,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#f4e9dc',
    flexShrink: 0,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: tokens.spacing.sm,
  },
  thumbFallbackText: {
    color: tokens.color.primary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 17,
    lineHeight: 21,
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  nextActionPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#f7eee5',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  nextActionText: {
    color: tokens.color.primary,
    fontSize: 11,
    fontWeight: '800',
    maxWidth: 180,
  },
  contextHint: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  progressInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(104, 64, 42, 0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressValue: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  urgencyBadgeCompact: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  urgencyBadgeDanger: {
    backgroundColor: tokens.color.danger,
  },
  urgencyBadgeWarning: {
    backgroundColor: tokens.color.warning,
  },
  urgencyLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
