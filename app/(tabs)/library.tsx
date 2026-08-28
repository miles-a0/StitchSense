import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PatternCard } from '@/src/components/library/pattern-card';
import { AppCard } from '@/src/components/ui/app-card';
import { BrandButton } from '@/src/components/ui/brand-button';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { SwipeToDelete } from '@/src/components/ui/swipe-to-delete';
import { buildPatternThumbnailUrl, stitchSenseAPI } from '@/src/lib/api';
import type { Pattern } from '@/src/lib/models';
import { findStashInsights } from '@/src/lib/stash-insights';
import { useLibrary } from '@/src/providers/library-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { shadows, tokens } from '@/src/theme/tokens';

const libraryFilters = [
  { id: 'all', label: 'All' },
  { id: 'stash-ready', label: 'Stash ready' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'needs-details', label: 'Needs details' },
  { id: 'ravelry', label: 'Ravelry' },
  { id: 'archived', label: 'Archived' },
] as const;

type LibraryFilter = (typeof libraryFilters)[number]['id'];
type LibraryStatIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function patternNeedsDetails(pattern: Pattern) {
  return !pattern.patternSummaryText?.trim() || !pattern.craftType?.trim();
}

type LibraryStatProps = {
  icon: LibraryStatIcon;
  label: string;
  onPress: () => void;
  value: number;
};

function LibraryStat({ icon, label, onPress, value }: LibraryStatProps) {
  return (
    <Pressable
      accessibilityLabel={`Show ${label} patterns`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.libraryStat, pressed ? styles.pressed : null]}>
      <Text style={styles.libraryStatValue}>{value}</Text>
      <View style={styles.libraryStatMeta}>
        <Text numberOfLines={2} style={styles.libraryStatLabel}>
          {label}
        </Text>
        <MaterialCommunityIcons color={tokens.color.accent} name={icon} size={18} />
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { items: stashItems } = useStash();
  const {
    patterns,
    errorMessage,
    isSyncingWordPress,
    syncMessage,
    refreshPatterns,
    syncFromWordPressIfNeeded,
    removePattern,
  } = useLibrary();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void syncFromWordPressIfNeeded();
    }, [syncFromWordPressIfNeeded]),
  );

  const filteredPatterns = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let nextPatterns =
      filter === 'archived'
        ? patterns.filter((pattern) => pattern.isArchived)
        : patterns.filter((pattern) => !pattern.isArchived);

    if (filter === 'stash-ready') {
      nextPatterns = nextPatterns.filter((pattern) => findStashInsights(pattern, stashItems, 1).length > 0);
    } else if (filter === 'pdf') {
      nextPatterns = nextPatterns.filter(
        (pattern) =>
          (pattern.fileMimeType ?? '').toLowerCase().includes('pdf') ||
          /\.pdf$/i.test(pattern.originalFilename ?? ''),
      );
    } else if (filter === 'needs-details') {
      nextPatterns = nextPatterns.filter(patternNeedsDetails);
    } else if (filter === 'ravelry') {
      nextPatterns = nextPatterns.filter((pattern) => pattern.source === 'ravelry');
    }

    if (trimmed) {
      nextPatterns = nextPatterns.filter((pattern) =>
        [pattern.title, pattern.originalFilename, pattern.patternSummaryText, pattern.craftType]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(trimmed)),
      );
    }

    return [...nextPatterns].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
  }, [filter, patterns, query, stashItems]);

  const hasPatterns = useMemo(
    () => patterns.some((pattern) => !pattern.isArchived),
    [patterns],
  );

  const renderedPatterns = useMemo<Pattern[]>(() => {
    if (!accessToken) {
      return filteredPatterns;
    }

    return filteredPatterns.map((pattern) => {
      const hasRemoteThumbnail =
        typeof pattern.thumbnailUrl === 'string' &&
        (/^https?:\/\//i.test(pattern.thumbnailUrl) || /^data:image\//i.test(pattern.thumbnailUrl));
      const isPdf =
        (pattern.fileMimeType ?? '').toLowerCase().includes('pdf') ||
        /\.pdf$/i.test(pattern.originalFilename ?? '');

      if (hasRemoteThumbnail || !isPdf) {
        return pattern;
      }

      return {
        ...pattern,
        thumbnailUrl: buildPatternThumbnailUrl(pattern.id, accessToken, pattern.updatedAt ?? null),
      };
    });
  }, [accessToken, filteredPatterns]);
  const stashReadyCount = useMemo(
    () => patterns.filter((pattern) => !pattern.isArchived && findStashInsights(pattern, stashItems, 1).length > 0).length,
    [patterns, stashItems],
  );
  const pdfCount = useMemo(
    () =>
      patterns.filter(
        (pattern) =>
          !pattern.isArchived &&
          ((pattern.fileMimeType ?? '').toLowerCase().includes('pdf') ||
            /\.pdf$/i.test(pattern.originalFilename ?? '')),
      ).length,
    [patterns],
  );
  const needsDetailsCount = useMemo(
    () => patterns.filter((pattern) => !pattern.isArchived && patternNeedsDetails(pattern)).length,
    [patterns],
  );
  const archivedCount = useMemo(
    () => patterns.filter((pattern) => pattern.isArchived).length,
    [patterns],
  );

  async function handlePullToRefresh() {
    setIsPullRefreshing(true);
    try {
      await refreshPatterns();
    } finally {
      setIsPullRefreshing(false);
    }
  }

  function confirmDeletePattern(pattern: Pattern) {
    if (!accessToken) return;
    Alert.alert(
      'Delete pattern?',
      `“${pattern.title}” and its saved pattern chats will be permanently removed. Projects made from it are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await stitchSenseAPI.deletePattern(pattern.id, accessToken);
              removePattern(pattern.id);
            } catch {
              Alert.alert('Could not delete pattern', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            tintColor={tokens.color.primary}
            onRefresh={() => void handlePullToRefresh()}
          />
        }
        style={styles.screen}>
        <ScreenHero
          copy="Your master pattern library. Open a pattern here to inspect the original, then create separate project clones when you make it."
          eyebrow="My library"
          icon="library"
          title="Your pattern collection">
          <View style={styles.heroButtonsColumn}>
            <BrandButton label="Upload" onPress={() => router.push('/pattern-upload')} style={styles.heroButtonFull} />
            <BrandButton label="Ravelry" onPress={() => router.push('/ravelry')} style={styles.heroButtonFull} variant="secondary" />
          </View>
        </ScreenHero>

        {hasPatterns ? (
          <View style={styles.searchBlock}>
            <View style={styles.libraryStatsGrid}>
              <LibraryStat
                icon="basket-outline"
                label="Stash ready"
                onPress={() => setFilter('stash-ready')}
                value={stashReadyCount}
              />
              <LibraryStat
                icon="file-pdf-box"
                label="PDF files"
                onPress={() => setFilter('pdf')}
                value={pdfCount}
              />
              <LibraryStat
                icon="playlist-edit"
                label="Need details"
                onPress={() => setFilter('needs-details')}
                value={needsDetailsCount}
              />
              <LibraryStat
                icon="archive-outline"
                label="Archived"
                onPress={() => setFilter('archived')}
                value={archivedCount}
              />
            </View>
            <Text style={styles.patternsHeading}>Your Patterns</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search patterns..."
              placeholderTextColor="#9b867d"
              style={styles.search}
              value={query}
            />
            <Text style={styles.resultSummary}>
              Showing {renderedPatterns.length} of {patterns.length} patterns
              {query.trim() ? ` · "${query.trim()}"` : ''}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{errorMessage}</Text>
            <BrandButton label="Retry" onPress={() => void refreshPatterns()} variant="ghost" />
          </View>
        ) : null}

        <View style={styles.list}>
          {renderedPatterns.length === 0 ? (
            <AppCard elevated style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No patterns yet</Text>
              <Text style={styles.emptyCopy}>
                Sync your web library, import from Ravelry, or upload a PDF directly from your phone.
              </Text>
            </AppCard>
          ) : (
            renderedPatterns.map((pattern, index) => {
              const stashHint = findStashInsights(pattern, stashItems, 1)[0];
              return (
                <SwipeToDelete
                  key={pattern.id}
                  entranceDelay={Math.min(index * 55, 275)}
                  label="Delete"
                  onDelete={() => confirmDeletePattern(pattern)}>
                  <PatternCard
                    onPress={() => router.push(`/pattern/${pattern.id}`)}
                    pattern={pattern}
                    stashHint={stashHint ? 'Stash ready' : null}
                  />
                </SwipeToDelete>
              );
            })
          )}
        </View>
      </ScrollView>
      {isSyncingWordPress ? (
        <View accessibilityRole="alert" style={styles.syncOverlay}>
          <View style={styles.syncCard}>
            <ActivityIndicator color={tokens.color.primary} size="large" />
            <Text style={styles.syncTitle}>Syncing from website</Text>
            <Text style={styles.syncCopy}>
              {syncMessage ?? 'Checking your StitchSense web library for new saved items.'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    paddingTop: 0,
    gap: tokens.spacing.xl,
  },
  heroButtonsColumn: {
    gap: tokens.spacing.sm,
  },
  heroButtonFull: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: tokens.spacing.md,
  },
  commandCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#f4fbfb',
    borderColor: '#c5e1df',
  },
  commandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  commandCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  commandEyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  commandTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  commandOpen: {
    minHeight: 40,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandOpenText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  commandTile: {
    width: '31%',
    minHeight: 88,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  commandValue: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '900',
  },
  commandLabel: {
    color: tokens.color.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  search: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  libraryStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  libraryStat: {
    width: '48.5%',
    minHeight: 82,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    ...shadows.card,
  },
  libraryStatValue: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '900',
  },
  libraryStatMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    justifyContent: 'space-between',
  },
  libraryStatLabel: {
    color: '#253d38',
    flex: 1,
    fontFamily: tokens.font.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  searchBlock: {
    gap: tokens.spacing.md,
  },
  patternsHeading: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: tokens.spacing.xl,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  filterPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  filterPillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  filterPillText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  resultSummary: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 19,
  },
  spotlightCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#fffaf4',
    borderColor: '#dbc3ac',
  },
  spotlightEyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  spotlightTitle: {
    color: tokens.color.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },
  spotlightCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  spotlightActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  spotlightButton: {
    flexGrow: 1,
    minWidth: 140,
  },
  notice: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#e7b1a8',
    backgroundColor: '#fff0ec',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  noticeText: {
    color: tokens.color.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  emptyState: {
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  emptyTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    lineHeight: 29,
  },
  emptyCopy: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.78,
  },
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(43, 29, 25, 0.28)',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  syncCard: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: tokens.spacing.sm,
    maxWidth: 360,
    padding: tokens.spacing.xl,
    width: '100%',
    ...shadows.card,
  },
  syncTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 23,
    lineHeight: 28,
    textAlign: 'center',
  },
  syncCopy: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 19,
    textAlign: 'center',
  },
});
