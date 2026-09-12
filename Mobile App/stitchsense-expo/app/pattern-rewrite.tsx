import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { RichMarkdownText } from '@/src/components/ui/rich-markdown-text';
import { APIError, stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import { choosePatternRewrite } from '@/src/lib/pattern-binding';
import type { RewriteSession } from '@/src/lib/models';
import { useLibrary } from '@/src/providers/library-provider';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

const goals = [
  'Resize for my measurements',
  'Change yarn weight',
  'Convert construction',
  'Change terminology',
  'Freeform rewrite',
] as const;
const OWNED_SOURCE_REQUIRED_MESSAGE =
  'Please purchase the pattern and re-import it before I can answer questions or rewrite it.';

const quickPromptMap: Record<(typeof goals)[number], readonly string[]> = {
  'Resize for my measurements': [
    'Resize this for a larger chest while preserving the style and shaping.',
    'Adjust this for a smaller fit and keep the stitch counts easy to follow.',
    'Rewrite this for custom body measurements and explain any shaping changes.',
  ],
  'Change yarn weight': [
    'Rewrite this from DK to Aran while keeping the finished size close.',
    'Convert this from Aran to 4-ply and note any gauge implications.',
    'Adapt this for a lighter yarn and explain what changes in tension are needed.',
  ],
  'Convert construction': [
    'Convert this from flat pieces to in-the-round construction.',
    'Rewrite this from seamed construction to top-down.',
    'Adapt this so the shaping still works with a different construction method.',
  ],
  'Change terminology': [
    'Rewrite this in clearer beginner-friendly language using UK terminology.',
    'Expand the abbreviations and explain each section in plain English.',
    'Keep the design the same but make the wording much easier to follow.',
  ],
  'Freeform rewrite': [
    'Make the sleeves roomier and keep the rest of the garment balanced.',
    'Adapt this for a different fibre and call out any tension risks.',
    'Rework the pattern so it is easier for a confident beginner to knit.',
  ],
};

function userFacingRewriteError(error: unknown) {
  if (error instanceof APIError) {
    if (error.message.includes('Workflow chat failed with 401')) {
      return 'The StitchSense rewrite workflow rejected this request. The N8N shared secret likely needs checking.';
    }
    if (error.message.includes('Workflow chat failed with 404')) {
      return 'The StitchSense rewrite workflow is not reachable yet.';
    }
    return error.message;
  }
  if (error instanceof Error) {
    return getUserFacingErrorMessage(error, {
      fallback: 'Could not generate a rewrite right now.',
    });
  }
  return 'Could not generate a rewrite right now.';
}

export default function PatternRewriteScreen() {
  const { patternId, rewriteId } = useLocalSearchParams<{ patternId: string; rewriteId?: string }>();
  const { patterns } = useLibrary();
  const { settings } = usePreferences();
  const { accessToken } = useSession();
  const pattern = useMemo(
    () => patterns.find((item) => item.id === patternId),
    [patternId, patterns],
  );

  const [goal, setGoal] =
    useState<(typeof goals)[number]>('Resize for my measurements');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [rewrites, setRewrites] = useState<RewriteSession[]>([]);
  const [selectedRewrite, setSelectedRewrite] = useState<RewriteSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Load a previous rewrite or generate a fresh one.',
  );
  const loadRequestRef = useRef(0);
  const ravelryUrl = String(
    pattern?.metadata?.ravelry_url ??
      pattern?.metadata?.source_url ??
      pattern?.sourceUrl ??
      '',
  ).trim();

  useEffect(() => {
    setRewrites([]);
    setSelectedRewrite(null);
    setResult('');
    setPrompt('');
    setStatusMessage('Load a previous rewrite or generate a fresh one.');

    async function load() {
      const requestId = ++loadRequestRef.current;
      if (!accessToken || !patternId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const response = await stitchSenseAPI.patternRewrites(patternId, accessToken);
        if (loadRequestRef.current !== requestId) {
          return;
        }
        setRewrites(response.rewrites);

        const chosenRewrite = choosePatternRewrite(response.rewrites, patternId, rewriteId);

        if (chosenRewrite) {
          setSelectedRewrite(chosenRewrite);
          setResult(chosenRewrite.rewriteResult);
          setPrompt(chosenRewrite.prompt ?? '');
          setStatusMessage('Loaded your latest rewrite.');
        } else {
          setStatusMessage('No previous rewrites for this pattern yet.');
        }
      } catch (error) {
        if (loadRequestRef.current !== requestId) {
          return;
        }
        setStatusMessage(userFacingRewriteError(error));
      } finally {
        if (loadRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }

    void load();
  }, [accessToken, patternId, rewriteId]);

  async function handleGenerate() {
    if (!accessToken || !pattern || !prompt.trim()) {
      return;
    }

    setIsGenerating(true);

    try {
      const response = await stitchSenseAPI.createRewrite(
        pattern.id,
        [
          `${goal}: ${prompt.trim()}`,
          `Use ${settings.language === 'us' ? 'US' : 'UK'} terminology.`,
          `Use ${settings.measurementUnit === 'imperial' ? 'imperial' : 'metric'} measurements by default.`,
          `Write for a ${settings.defaultSkill} maker unless the prompt asks otherwise.`,
        ].join('\n'),
        accessToken,
      );
      setSelectedRewrite(response.rewrite);
      setResult(response.rewrite.rewriteResult);
      setRewrites((current) => [
        response.rewrite,
        ...current.filter((item) => item.id !== response.rewrite.id),
      ]);
      setStatusMessage('Rewrite ready.');
    } catch (error) {
      setStatusMessage(userFacingRewriteError(error));
    } finally {
      setIsGenerating(false);
    }
  }

  const promptSuggestions = quickPromptMap[goal].map((suggestion) =>
    settings.language === 'us'
      ? suggestion.replace(/UK terminology/gi, 'US terminology')
      : suggestion,
  );
  const summarySnippet = pattern?.patternSummaryText?.trim().slice(0, 260) ?? '';
  const dynamicPlaceholder =
    goal === 'Freeform rewrite'
      ? 'Describe exactly what you want changed and any constraints to preserve.'
      : `Tell StitchSense how to ${goal.toLowerCase()} while keeping the design intent intact.`;
  const sourceRequired = statusMessage.includes(OWNED_SOURCE_REQUIRED_MESSAGE);

  async function handleOpenRavelry() {
    if (!ravelryUrl) {
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(ravelryUrl);
    } catch {
      await Linking.openURL(ravelryUrl);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Pattern rewrite</Text>
        <Text style={styles.title}>{pattern?.title ?? 'Pattern'}</Text>
        <Text style={styles.copy}>
          Rework sizing, yarn, construction, or terminology while keeping the pattern intent intact.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Rewrite goal</Text>
        <View style={styles.goalGrid}>
          {goals.map((item) => {
            const active = goal === item;
            return (
              <Pressable
                key={item}
                onPress={() => setGoal(item)}
                style={[styles.goalPill, active ? styles.goalPillActive : null]}>
                <Text
                  style={[styles.goalPillLabel, active ? styles.goalPillLabelActive : null]}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.promptSuggestionList}>
          {promptSuggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => setPrompt(suggestion)}
              style={styles.promptSuggestionChip}>
              <Text style={styles.promptSuggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          multiline
          onChangeText={setPrompt}
          placeholder={dynamicPlaceholder}
          placeholderTextColor="#9b867d"
          style={styles.promptInput}
          value={prompt}
        />
        <Text style={styles.inputHelper}>
          Include fit goals, yarn changes, and anything that must stay the same. StitchSense will use your saved terminology and units.
        </Text>
        <BrandButton
          disabled={!prompt.trim()}
          label="Generate rewrite"
          loading={isGenerating}
          onPress={() => void handleGenerate()}
          style={styles.fullWidth}
        />
        {sourceRequired ? (
          <View style={styles.purchaseWarningCard}>
            <Text style={styles.purchaseWarningTitle}>Pattern purchase required</Text>
            <Text style={styles.purchaseWarningCopy}>{statusMessage}</Text>
            {ravelryUrl ? (
              <BrandButton
                label="View pattern on Ravelry"
                onPress={() => void handleOpenRavelry()}
                style={styles.fullWidth}
              />
            ) : null}
          </View>
        ) : (
          <Text style={styles.status}>{statusMessage}</Text>
        )}
      </View>

      {isLoading && rewrites.length === 0 ? (
        <View style={styles.card}>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={styles.loadingText}>Loading previous rewrites…</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Original context</Text>
        <Text style={styles.contextLabel}>Pattern</Text>
        <Text style={styles.contextValue}>{pattern?.title ?? 'Pattern'}</Text>
        {summarySnippet ? (
          <>
            <Text style={styles.contextLabel}>Current summary</Text>
            <Text style={styles.contextCopy}>
              {summarySnippet}
              {pattern?.patternSummaryText && pattern.patternSummaryText.length > 260 ? '…' : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.contextCopy}>
            This pattern has not been summarised yet, so StitchSense will work mostly from the file
            metadata and uploaded document context.
          </Text>
        )}
      </View>

      {rewrites.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent rewrites</Text>
          <View style={styles.rewriteList}>
            {rewrites.slice(0, 4).map((rewrite) => (
              <Pressable
                key={rewrite.id}
                onPress={() => {
                  setSelectedRewrite(rewrite);
                  setResult(rewrite.rewriteResult);
                  setPrompt(rewrite.prompt ?? '');
                  setStatusMessage('Loaded a previous rewrite.');
                }}
                style={styles.rewriteItem}>
                <Text
                  style={styles.rewritePrompt}>
                  {rewrite.prompt ?? 'Previous rewrite'}
                </Text>
                <Text style={styles.rewriteMeta}>
                  {rewrite.createdAt
                    ? new Date(rewrite.createdAt).toLocaleString()
                    : 'Saved rewrite'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {result ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Result</Text>
          {selectedRewrite?.confidenceScore ? (
            <View style={styles.resultMetaRow}>
              <View style={styles.resultMetaPill}>
                <Text style={styles.resultMetaPillText}>
                  Confidence {selectedRewrite.confidenceScore}%
                </Text>
              </View>
              {selectedRewrite.createdAt ? (
                <View style={styles.resultMetaPill}>
                  <Text style={styles.resultMetaPillText}>
                    {new Date(selectedRewrite.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.resultBlocks}>
            <View style={styles.resultBlock}>
              <Text style={styles.resultBlockLabel}>Rewrite output</Text>
              <RichMarkdownText text={result} />
            </View>
          </View>
          {selectedRewrite?.rewriteChanges && selectedRewrite.rewriteChanges.length > 0 ? (
            <View style={styles.metaListCard}>
              <Text style={styles.metaListTitle}>Key changes</Text>
              {selectedRewrite.rewriteChanges.map((item, index) => (
                <Text key={`change-${index}`} style={styles.metaListItem}>
                  • {String(item)}
                </Text>
              ))}
            </View>
          ) : null}
          {selectedRewrite?.rewriteWarnings && selectedRewrite.rewriteWarnings.length > 0 ? (
            <View style={styles.metaListCard}>
              <Text style={styles.metaListTitle}>Warnings</Text>
              {selectedRewrite.rewriteWarnings.map((item, index) => (
                <Text key={`warning-${index}`} style={styles.metaListItem}>
                  • {String(item)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
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
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: 21,
    fontWeight: '700',
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  promptSuggestionList: {
    gap: tokens.spacing.sm,
  },
  promptSuggestionChip: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
  },
  promptSuggestionText: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 21,
  },
  goalPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  goalPillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  goalPillLabel: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  goalPillLabelActive: {
    color: '#fff',
  },
  promptInput: {
    minHeight: 132,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  inputHelper: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: -4,
  },
  fullWidth: {
    width: '100%',
  },
  status: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  purchaseWarningCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: '#d35d5d',
    backgroundColor: '#fff2f2',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  purchaseWarningTitle: {
    color: '#a12727',
    fontSize: 18,
    fontWeight: '800',
  },
  purchaseWarningCopy: {
    color: '#a12727',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  loadingText: {
    color: tokens.color.muted,
    fontSize: 15,
  },
  contextLabel: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  contextValue: {
    color: tokens.color.text,
    fontSize: 17,
    fontWeight: '700',
  },
  contextCopy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  rewriteList: {
    gap: tokens.spacing.sm,
  },
  rewriteItem: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  rewritePrompt: {
    color: tokens.color.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  rewriteMeta: {
    color: tokens.color.muted,
    fontSize: 12,
  },
  resultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  resultMetaPill: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfaceWarm,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  resultMetaPillText: {
    color: tokens.color.text,
    fontSize: 13,
    fontWeight: '700',
  },
  resultBlocks: {
    gap: tokens.spacing.md,
  },
  resultBlock: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  resultBlockLabel: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultText: {
    color: tokens.color.text,
    fontSize: 16,
    lineHeight: 24,
  },
  metaListCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf6',
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  metaListTitle: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '700',
  },
  metaListItem: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
});
