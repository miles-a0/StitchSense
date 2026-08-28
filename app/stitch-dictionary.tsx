import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  stitchDictionaryItems,
  type StitchDictionaryItem,
} from '@/src/lib/stitch-dictionary-data';
import { tokens } from '@/src/theme/tokens';
import { BrandButton } from '@/src/components/ui/brand-button';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';

type DictionaryType = 'all' | 'knitting' | 'crochet';
type SortMode = 'az' | 'za' | 'difficulty' | 'category';

const quickSearches = ['dc', 'treble', 'yarn over', 'increase', 'decrease', 'gauge'] as const;

function Pill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : null]}>
      <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

function normaliseCategory(name?: string) {
  const trimmed = String(name ?? 'Other').trim();
  return trimmed || 'Other';
}

function dictionarySortValue(item: StitchDictionaryItem, sortMode: SortMode) {
  if (sortMode === 'difficulty') return `${item.difficulty ?? ''}-${item.name}`;
  if (sortMode === 'category') return `${normaliseCategory(item.category)}-${item.name}`;
  return item.name;
}

export default function StitchDictionaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; type?: DictionaryType }>();
  const [query, setQuery] = useState(params.query ?? '');
  const [activeType, setActiveType] = useState<DictionaryType>('all');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('az');

  useEffect(() => {
    if (params.query) {
      setQuery(params.query);
    }
    if (params.type === 'all' || params.type === 'knitting' || params.type === 'crochet') {
      setActiveType(params.type);
    }
  }, [params.query, params.type]);

  const baseItems = useMemo(() => {
    return stitchDictionaryItems.filter((item) => {
      return activeType === 'all' || item.type === activeType;
    });
  }, [activeType]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of baseItems) {
      const name = normaliseCategory(item.category);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([name, count]) => ({ name, count }));
  }, [baseItems]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return baseItems
      .filter((item) => {
        const categoryMatch =
          activeCategory === 'all' || normaliseCategory(item.category) === activeCategory;
        if (!categoryMatch) return false;

        const haystack = [
          item.type,
          item.category,
          item.symbol,
          item.name,
          item.abbr,
          item.uk,
          item.us,
          item.alt,
          item.difficulty,
          item.desc,
          item.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return !normalizedQuery || haystack.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftValue = dictionarySortValue(left, sortMode);
        const rightValue = dictionarySortValue(right, sortMode);
        return sortMode === 'za'
          ? rightValue.localeCompare(leftValue)
          : leftValue.localeCompare(rightValue);
      });
  }, [activeCategory, baseItems, query, sortMode]);

  const heading =
    activeType === 'knitting'
      ? 'Knitting stitches'
      : activeType === 'crochet'
        ? 'Crochet stitches'
        : 'All stitches';

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <InlineBackButton label="Close tool" onPress={() => router.replace('/(tabs)/tools')} />

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Reference library</Text>
        <Text style={styles.title}>Stitch Dictionary</Text>
        <Text style={styles.copy}>
          Your complete guide to knitting and crochet stitches, abbreviations, and UK/US terms.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Dictionary type</Text>
        <View style={styles.rowWrap}>
          <Pill active={activeType === 'all'} label="All" onPress={() => setActiveType('all')} />
          <Pill
            active={activeType === 'crochet'}
            label="Crochet"
            onPress={() => setActiveType('crochet')}
          />
          <Pill
            active={activeType === 'knitting'}
            label="Knitting"
            onPress={() => setActiveType('knitting')}
          />
        </View>

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search name, abbreviation, UK/US term…"
          placeholderTextColor="#9b867d"
          style={styles.search}
          value={query}
        />

        <View style={styles.quickSearchRow}>
          {quickSearches.map((term) => (
            <Pressable key={term} onPress={() => setQuery(term)} style={styles.quickSearchChip}>
              <Text style={styles.quickSearchText}>{term}</Text>
            </Pressable>
          ))}
          {(query || activeCategory !== 'all' || activeType !== 'all') ? (
            <Pressable
              onPress={() => {
                setQuery('');
                setActiveCategory('all');
                setActiveType('all');
              }}
              style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.fieldLabel}>Sort by</Text>
        <View style={styles.rowWrap}>
          <Pill active={sortMode === 'az'} label="A - Z" onPress={() => setSortMode('az')} />
          <Pill active={sortMode === 'za'} label="Z - A" onPress={() => setSortMode('za')} />
          <Pill
            active={sortMode === 'difficulty'}
            label="Difficulty"
            onPress={() => setSortMode('difficulty')}
          />
          <Pill
            active={sortMode === 'category'}
            label="Category"
            onPress={() => setSortMode('category')}
          />
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Tip</Text>
          <Text style={styles.tipCopy}>
            Search any name or abbreviation you know. Try “dc”, “treble”, “yarn over”, or “increase”.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Filter by category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalPills}>
          <Pill
            active={activeCategory === 'all'}
            label={`All Categories (${baseItems.length})`}
            onPress={() => setActiveCategory('all')}
          />
          {categories.map((category) => (
            <Pill
              key={category.name}
              active={activeCategory === category.name}
              label={`${category.name} (${category.count})`}
              onPress={() => setActiveCategory(category.name)}
            />
          ))}
        </ScrollView>

        <View style={styles.activeSummary}>
          <Text style={styles.activeSummaryText}>
            Showing {filteredItems.length} of {baseItems.length} {activeType === 'all' ? 'stitches' : activeType}
            {activeCategory !== 'all' ? ` · ${activeCategory}` : ''}
            {query.trim() ? ` · "${query.trim()}"` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.resultsHead}>
        <View>
          <Text style={styles.resultsTitle}>{heading}</Text>
          <Text style={styles.resultsCopy}>
            {activeType === 'all'
              ? 'Browse the full knitting and crochet stitch library.'
              : `Browse or search the ${activeType} stitch library.`}
          </Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeLabel}>{filteredItems.length}</Text>
        </View>
      </View>

      <View style={styles.list}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No match found</Text>
            <Text style={styles.emptyCopy}>
              Try searching for an abbreviation, stitch name, UK/US term, or technique.
            </Text>
          </View>
        ) : (
          filteredItems.map((item) => {
            const mark = item.symbol || item.abbr || item.visual || '•';
            return (
              <View
                key={`${item.type}-${item.name}-${item.abbr ?? mark}`}
                style={styles.dictionaryCard}>
                <View style={styles.dictionaryTop}>
                  <View style={styles.lozenge}>
                    <Text style={styles.lozengeLabel}>{mark}</Text>
                  </View>
                  <View
                    style={[
                      styles.typeBadge,
                      item.type === 'crochet' ? styles.crochetBadge : styles.knittingBadge,
                    ]}>
                    <Text
                      style={[
                        styles.typeBadgeLabel,
                        item.type === 'crochet'
                          ? styles.crochetBadgeLabel
                          : styles.knittingBadgeLabel,
                      ]}>
                      {item.type.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.dictionaryTitle}>{item.name}</Text>
                <Text style={styles.dictionaryDesc}>
                  {item.desc || 'No description available yet.'}
                </Text>

                <View style={styles.factList}>
                  {item.uk ? (
                    <View style={styles.factRow}>
                      <Text style={styles.factLabel}>UK/EU</Text>
                      <Text style={styles.factValue}>{item.uk}</Text>
                    </View>
                  ) : null}
                  {item.us ? (
                    <View style={styles.factRow}>
                      <Text style={styles.factLabel}>US</Text>
                      <Text style={styles.factValue}>{item.us}</Text>
                    </View>
                  ) : null}
                  <View style={styles.factRow}>
                    <Text style={styles.factLabel}>Difficulty</Text>
                    <Text style={styles.factValue}>{item.difficulty || 'Standard'}</Text>
                  </View>
                  <View style={styles.factRow}>
                    <Text style={styles.factLabel}>Category</Text>
                    <Text style={styles.factValue}>{normaliseCategory(item.category)}</Text>
                  </View>
                </View>

                {item.note ? <Text style={styles.note}>{item.note}</Text> : null}

                <View style={styles.actionStack}>
                  {item.source ? (
                    <Pressable
                      onPress={() => void WebBrowser.openBrowserAsync(item.source!)}
                      style={styles.sourceButton}>
                      <Text style={styles.sourceButtonLabel}>Open source</Text>
                    </Pressable>
                  ) : null}
                  <BrandButton
                    label="Ask StitchSense about this stitch"
                    onPress={() =>
	                      router.push({
	                        pathname: '/(tabs)/chat',
	                        params: {
	                          title: `${item.name} help`,
	                          prompt: `Please explain ${item.name}${item.abbr ? ` (${item.abbr})` : ''} in plain English and tell me when I would use it.`,
	                          context: [
	                            item.desc,
                            item.uk ? `UK/EU term: ${item.uk}` : '',
                            item.us ? `US term: ${item.us}` : '',
                            item.note ?? '',
                          ]
                            .filter(Boolean)
                            .join(' '),
                          toolMode: 'terminology_helper',
                        },
                      })
                    }
                    style={styles.fullWidth}
                    variant="ghost"
                  />
                  {(item.uk || item.us) ? (
                    <BrandButton
                      label="Translate UK / US terms"
                      onPress={() =>
	                        router.push({
	                          pathname: '/(tabs)/chat',
	                          params: {
	                            title: 'UK / US stitch terms',
	                            prompt: `Please explain the UK and US terminology for ${item.name}. UK/EU: ${item.uk ?? 'unknown'}. US: ${item.us ?? 'unknown'}.`,
	                            context: [
	                              item.desc,
                              item.uk ? `UK/EU term: ${item.uk}` : '',
                              item.us ? `US term: ${item.us}` : '',
                              item.note ?? '',
                            ]
                              .filter(Boolean)
                              .join(' '),
                            toolMode: 'terminology_helper',
                          },
                        })
                      }
                      style={styles.fullWidth}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  hero: {
    backgroundColor: tokens.color.surfaceWarm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: 20,
    fontWeight: '700',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  horizontalPills: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.lg,
  },
  activeSummary: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(104, 64, 42, 0.1)',
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
  },
  activeSummaryText: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  pill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  pillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  pillLabel: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  pillLabelActive: {
    color: '#fff',
  },
  search: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  quickSearchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  quickSearchChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  quickSearchText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  clearButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: tokens.color.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  fieldLabel: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '700',
  },
  tipBox: {
    backgroundColor: '#fff8f0',
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  tipTitle: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tipCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  resultsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: tokens.spacing.md,
  },
  resultsTitle: {
    color: tokens.color.text,
    fontSize: 24,
    fontWeight: '700',
  },
  resultsCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: tokens.spacing.xs,
  },
  totalBadge: {
    minWidth: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#efe1d3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  totalBadgeLabel: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: tokens.spacing.md,
  },
  dictionaryCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  dictionaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  lozenge: {
    minWidth: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#f4e8dd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  lozengeLabel: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  typeBadge: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  knittingBadge: {
    backgroundColor: '#efe1d3',
  },
  crochetBadge: {
    backgroundColor: '#edf7f6',
  },
  typeBadgeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  knittingBadgeLabel: {
    color: tokens.color.primary,
  },
  crochetBadgeLabel: {
    color: '#2d7478',
  },
  dictionaryTitle: {
    color: tokens.color.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  dictionaryDesc: {
    color: tokens.color.text,
    fontSize: 15,
    lineHeight: 22,
  },
  factList: {
    gap: tokens.spacing.xs,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  factLabel: {
    color: tokens.color.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  factValue: {
    flex: 1,
    color: tokens.color.text,
    fontSize: 14,
    textAlign: 'right',
  },
  note: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sourceButton: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.medium,
    backgroundColor: tokens.color.primary,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    marginTop: tokens.spacing.xs,
  },
  sourceButtonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  actionStack: {
    gap: tokens.spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  emptyCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyCopy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
});
