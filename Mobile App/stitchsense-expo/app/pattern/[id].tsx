import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Linking from 'expo-linking';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { authenticatedImageSource, stitchSenseAPI } from '@/src/lib/api';
import { destructiveResourceActionPrompt } from '@/src/lib/destructive-actions';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import { describeStashItem, findStashInsights } from '@/src/lib/stash-insights';
import { loadTokens } from '@/src/lib/token-store';
import type { ChatSession, Pattern, RewriteSession } from '@/src/lib/models';
import { useLibrary } from '@/src/providers/library-provider';
import { useProjects } from '@/src/providers/projects-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { shadows, tokens } from '@/src/theme/tokens';
import { BrandButton } from '@/src/components/ui/brand-button';
import { patternNeedsOwnedSource, patternHasScopedContent } from '@/src/lib/pattern-content-readiness';

const SOURCE_REQUIRED_CHAT_MESSAGE =
  'This Ravelry pattern needs your owned pattern source before StitchSense can chat about it.';
const SOURCE_REQUIRED_REWRITE_MESSAGE =
  'This Ravelry pattern needs your owned pattern source before StitchSense can rewrite it.';
const SOURCE_REQUIRED_SUMMARY_MESSAGE =
  'This Ravelry pattern needs your owned pattern source before StitchSense can refresh the summary.';
const CONTENT_REQUIRED_CHAT_MESSAGE =
  'This pattern has no content available yet for chatting. Upload or re-import the pattern source first.';
const CONTENT_REQUIRED_REWRITE_MESSAGE =
  'This pattern has no content available yet for rewriting. Upload or re-import the pattern source first.';
const CONTENT_REQUIRED_SUMMARY_MESSAGE =
  'This pattern has no content available yet for summary refresh. Upload or re-import the pattern source first.';

function buildPatternQuestionStarter(pattern: Pattern | null, summary: string) {
  return 'Ask a question about this pattern.';
}

function formatPatternSummary(summary: string) {
  const trimmed = summary.replace(/\r/g, '').trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('\n')) {
    return trimmed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  const sentences = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    return trimmed;
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(' '));
  }

  return paragraphs.join('\n\n');
}

export default function PatternDetailScreen() {
  const router = useRouter();
  const { id, openFile, projectId } = useLocalSearchParams<{
    id: string;
    openFile?: string;
    projectId?: string;
  }>();
  const { patterns, refreshPatterns } = useLibrary();
  const { projects } = useProjects();
  const { accessToken, refreshAccount } = useSession();
  const { items: stashItems } = useStash();
  const { width } = useWindowDimensions();
  const compactActions = width < 390;

  const pattern = useMemo(() => patterns.find((item) => item.id === id), [id, patterns]);

  const [activePattern, setActivePattern] = useState<Pattern | null>(pattern ?? null);
  const [fileUrl, setFileUrl] = useState<string | null>(pattern?.fileUrl ?? null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [rewrites, setRewrites] = useState<RewriteSession[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshingRavelry, setIsRefreshingRavelry] = useState(false);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCraftType, setDraftCraftType] = useState('');
  const [draftSourceUrl, setDraftSourceUrl] = useState('');
  const hasAutoOpenedFile = useRef(false);

  const currentAccessToken = useCallback(async () => {
    await refreshAccount();
    const saved = await loadTokens();
    return saved.accessToken ?? accessToken;
  }, [accessToken, refreshAccount]);

  const loadDetail = useCallback(async () => {
    if (!id) {
      return;
    }

    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      const activeToken = await currentAccessToken();
      if (!activeToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      const [nextPattern, chatsResponse, rewritesResponse] = await Promise.all([
        stitchSenseAPI.pattern(id, activeToken),
        stitchSenseAPI.patternChats(id, activeToken),
        stitchSenseAPI.patternRewrites(id, activeToken),
      ]);

      setActivePattern(nextPattern);
      setDraftTitle(nextPattern.title ?? '');
      setDraftCraftType(nextPattern.craftType ?? '');
      setDraftSourceUrl(nextPattern.sourceUrl ?? '');
      setChatSessions(chatsResponse.sessions);
      setRewrites(rewritesResponse.rewrites);

      if (nextPattern.fileKey || nextPattern.fileUrl) {
        const fileResponse = await stitchSenseAPI.patternFileUrl(id, activeToken);
        setFileUrl(fileResponse.fileUrl ?? null);
      } else {
        setFileUrl(null);
      }
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not load pattern details.' }),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [currentAccessToken, id]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const sourceLabel =
    activePattern?.source === 'ravelry'
      ? 'Ravelry'
      : activePattern?.source === 'rewrite'
        ? 'Rewritten'
        : activePattern?.source === 'import'
          ? 'Imported'
        : 'Uploaded';

  const ravelryId = String(activePattern?.metadata?.ravelry_id ?? '').trim();
  const ravelryUrl = String(
    activePattern?.metadata?.ravelry_url ??
      activePattern?.metadata?.source_url ??
      activePattern?.sourceUrl ??
      '',
  ).trim();
  const ravelryDesigner = String(activePattern?.metadata?.designer ?? '').trim();
  const ravelryGauge = String(activePattern?.metadata?.gauge ?? '').trim();
  const ravelrySizes = String(activePattern?.metadata?.sizes ?? '').trim();
  const ravelryYardage = String(activePattern?.metadata?.yardage ?? '').trim();
  const ravelryAvailability = String(activePattern?.metadata?.ravelry_availability ?? '').trim();
  const patternNeedsOwnedSourceCheck = useMemo(() => patternNeedsOwnedSource(activePattern), [activePattern]);
  const patternHasScopedContentCheck = useMemo(() => patternHasScopedContent(activePattern), [activePattern]);
  const isChatReady = !patternNeedsOwnedSourceCheck && patternHasScopedContentCheck;
  const isRewriteReady = !patternNeedsOwnedSourceCheck && patternHasScopedContentCheck;
  const summaryText =
    activePattern?.patternSummaryText?.trim() ||
    (patternNeedsOwnedSourceCheck
      ? 'This Ravelry pattern needs your owned pattern source before StitchSense can summarize, chat, or rewrite it.'
      : 'This pattern has no content yet. Upload or re-import the pattern source first.');
  const formattedSummaryText = useMemo(() => formatPatternSummary(summaryText), [summaryText]);
  const linkedProjects = useMemo(
    () => projects.filter((project) => project.patternId === activePattern?.id),
    [activePattern?.id, projects],
  );
  const activeProjectClones = useMemo(
    () => linkedProjects.filter((project) => project.status === 'active'),
    [linkedProjects],
  );
  const stashInsights = useMemo(
    () => findStashInsights(activePattern, stashItems, 4),
    [activePattern, stashItems],
  );
  const firstStashInsight = stashInsights[0] ?? null;
  const hasPatternFile = Boolean(activePattern?.fileKey || activePattern?.fileUrl);
  const hasUsefulMetadata = Boolean(
    activePattern?.craftType ||
      ravelryGauge ||
      ravelrySizes ||
      ravelryYardage ||
      activePattern?.patternSummaryText ||
      activePattern?.patternSummaryStructured,
  );

  function showPatternNotReadyAlert(message: string) {
    Alert.alert('Pattern not ready', message, [{ text: 'OK' }]);
  }

  function handleChatNavigation(params?: Record<string, string | undefined>) {
    if (!isChatReady) {
      showPatternNotReadyAlert(
        patternNeedsOwnedSourceCheck ? SOURCE_REQUIRED_CHAT_MESSAGE : CONTENT_REQUIRED_CHAT_MESSAGE,
      );
      return;
    }
    router.push({ pathname: '/pattern-chat', params: { patternId: activePattern?.id, ...params } });
  }

  function handleRewriteNavigation() {
    if (!isRewriteReady) {
      showPatternNotReadyAlert(
        patternNeedsOwnedSourceCheck ? SOURCE_REQUIRED_REWRITE_MESSAGE : CONTENT_REQUIRED_REWRITE_MESSAGE,
      );
      return;
    }
    router.push({ pathname: '/pattern-rewrite', params: { patternId: activePattern?.id } });
  }

  function handleRefreshSummaryPress() {
    if (patternNeedsOwnedSourceCheck || !patternHasScopedContentCheck) {
      showPatternNotReadyAlert(
        patternNeedsOwnedSourceCheck ? SOURCE_REQUIRED_SUMMARY_MESSAGE : CONTENT_REQUIRED_SUMMARY_MESSAGE,
      );
      return;
    }
    void handleRefreshSummary();
  }

  const readinessTasks = [
    {
      key: 'file',
      title: 'Pattern file',
      copy: hasPatternFile
        ? 'Attached and ready to open in the viewer.'
        : 'No PDF or source file is attached yet.',
      complete: hasPatternFile,
    },
    {
      key: 'stash',
      title: 'Stash match',
      copy: firstStashInsight
        ? `${describeStashItem(firstStashInsight.item)} looks worth checking.`
        : 'No obvious stash match yet.',
      complete: Boolean(firstStashInsight),
    },
    {
      key: 'details',
      title: 'Making details',
      copy: hasUsefulMetadata
        ? 'Summary, craft type, gauge, sizing, or yardage details are available.'
        : 'Add or refresh details before relying on project suggestions.',
      complete: hasUsefulMetadata,
    },
    {
      key: 'sizing',
      title: 'Sizing decision',
      copy: ravelrySizes
        ? 'Size options are available and should be chosen in project setup.'
        : 'No size options detected. Project setup can mark this as one-size or capture manual sizing.',
      complete: Boolean(ravelrySizes),
    },
  ];
  const readinessCompleteCount = readinessTasks.filter((task) => task.complete).length;
  const nextBestAction = !hasPatternFile
    ? {
        title: 'Attach or import a pattern file',
        copy: 'This library item will be easier to use when the PDF or source file is available.',
        label: 'Edit details',
        action: () => setIsEditingMetadata(true),
      }
    : !hasUsefulMetadata
      ? {
          title: 'Improve the pattern details',
          copy: 'Refresh the summary or add craft/gauge details before relying on suggestions.',
          label: 'Refresh summary',
          action: handleRefreshSummaryPress,
        }
      : firstStashInsight
          ? {
              title: 'Start with your stash',
              copy: `${describeStashItem(firstStashInsight.item)} looks like a useful match.`,
              label: 'Start project',
              action: startProjectFromPattern,
            }
          : {
              title: 'Ask before starting',
              copy: 'Get a quick readiness check before making a project workspace.',
              label: 'Ask readiness check',
              action: () =>
                router.push({
                  pathname: '/(tabs)/chat',
                  params: { prompt: readinessPrompt },
                }),
            };
  const readinessPrompt = [
    `Help me decide if I am ready to start "${activePattern?.title ?? 'this pattern'}".`,
    firstStashInsight
      ? `Possible stash: ${describeStashItem(firstStashInsight.item)}. Reason: ${firstStashInsight.reason}.`
      : 'I do not have an obvious stash match yet.',
    ravelryGauge ? `Gauge: ${ravelryGauge}.` : null,
    ravelryYardage ? `Yardage: ${ravelryYardage}.` : null,
    ravelrySizes ? `Sizes: ${ravelrySizes}.` : null,
    summaryText ? `Pattern summary: ${summaryText.slice(0, 700)}` : null,
    'Please give me a short readiness checklist and any materials I should confirm before casting on or starting.',
  ]
    .filter(Boolean)
    .join('\n');

  function startProjectFromPattern() {
    if (!activePattern?.id) {
      setStatusMessage('Pattern details are still loading. Try again in a moment.');
      return;
    }

    router.push({
      pathname: '/project/new',
      params: {
        patternId: activePattern.id,
        ...(firstStashInsight
          ? {
              stashId: firstStashInsight.item.id,
              stashName: firstStashInsight.item.name,
              stashIdea: activePattern.title,
            }
          : {}),
      },
    });
  }


  const handleOpenFile = useCallback(async () => {
    if (!id) {
      return;
    }

    setIsOpeningFile(true);
    try {
      if (!activePattern?.fileKey && !activePattern?.fileUrl) {
        setStatusMessage('No pattern file is linked to this library item yet.');
        return;
      }
      router.push({
        pathname: '/pattern-viewer',
        params: {
          id,
          title: activePattern.title,
          ...(projectId ? { projectId } : {}),
        },
      } as unknown as Href);
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not open this pattern file.' }),
      );
    } finally {
      setIsOpeningFile(false);
    }
  }, [activePattern?.fileKey, activePattern?.fileUrl, activePattern?.title, id, projectId, router]);

  useFocusEffect(
    useCallback(() => {
      if (openFile !== '1' || !activePattern?.id || hasAutoOpenedFile.current) {
        return;
      }

      hasAutoOpenedFile.current = true;
      void handleOpenFile();
    }, [activePattern?.id, handleOpenFile, openFile]),
  );

  function handleArchive() {
    if (!accessToken || !activePattern) {
      return;
    }

    Alert.alert(
      activePattern.isArchived ? 'Unarchive pattern?' : 'Archive pattern?',
      activePattern.isArchived
        ? 'This pattern will go back into your main library view.'
        : 'This will hide the pattern from your main library view, but keep it in your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activePattern.isArchived ? 'Unarchive' : 'Archive',
          onPress: async () => {
            setIsArchiving(true);
            try {
              const updated = await stitchSenseAPI.updatePattern(activePattern.id, accessToken, {
                isArchived: !activePattern.isArchived,
              });
              setActivePattern(updated);
              await refreshPatterns();
              setStatusMessage(
                updated.isArchived ? 'Pattern archived.' : 'Pattern returned to your main library.',
              );
            } catch (error) {
              setStatusMessage(
                getUserFacingErrorMessage(error, { fallback: 'Could not update this pattern.' }),
              );
            } finally {
              setIsArchiving(false);
            }
          },
        },
      ],
    );
  }

  function handleDelete() {
    if (!activePattern) {
      return;
    }

    const prompt = destructiveResourceActionPrompt('delete_pattern', activePattern.title);
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: prompt.confirmLabel,
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            const activeToken = await currentAccessToken();
            if (!activeToken) {
              throw new Error('Your session has expired. Please sign in again.');
            }
            await stitchSenseAPI.deletePattern(activePattern.id, activeToken);
            await refreshPatterns();
            router.replace('/(tabs)/library');
          } catch (error) {
            setStatusMessage(
              getUserFacingErrorMessage(error, { fallback: 'Could not delete this pattern.' }),
            );
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  }

  async function handleRefreshFromRavelry() {
    if (!accessToken || !activePattern || !ravelryId) {
      return;
    }

    setIsRefreshingRavelry(true);
    try {
      await stitchSenseAPI.ravelryImport(accessToken, {
        id: ravelryId,
        libraryPatternId: activePattern.id,
        pattern: {
          id: ravelryId,
          title: activePattern.title,
          craft_type: activePattern.craftType ?? '',
          url: ravelryUrl,
          designer: ravelryDesigner,
        },
      });
      await refreshPatterns();
      await loadDetail();
      setStatusMessage('Pattern refreshed from Ravelry.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not refresh from Ravelry.' }),
      );
    } finally {
      setIsRefreshingRavelry(false);
    }
  }

  async function handleRefreshSummary() {
    if (!activePattern) {
      return;
    }

    setIsRefreshingSummary(true);
    setStatusMessage('Refreshing the AI summary…');
    try {
      const activeToken = await currentAccessToken();
      if (!activeToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      const response = await stitchSenseAPI.refreshPatternSummary(
        activePattern.id,
        activeToken,
      );
      setActivePattern(response.pattern);
      await refreshPatterns();
      setStatusMessage('AI summary refreshed.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not refresh the AI summary.' }),
      );
    } finally {
      setIsRefreshingSummary(false);
    }
  }

  async function handleSaveMetadata() {
    if (!accessToken || !activePattern) {
      return;
    }

    try {
      const updated = await stitchSenseAPI.updatePattern(activePattern.id, accessToken, {
        title: draftTitle.trim() || activePattern.title,
        craftType: draftCraftType.trim() || null,
        sourceUrl: draftSourceUrl.trim() || null,
      });
      setActivePattern(updated);
      setDraftTitle(updated.title ?? '');
      setDraftCraftType(updated.craftType ?? '');
      setDraftSourceUrl(updated.sourceUrl ?? '');
      setIsEditingMetadata(false);
      await refreshPatterns();
      setStatusMessage('Pattern details updated.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not save pattern details.' }),
      );
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          tintColor={tokens.color.primary}
          onRefresh={() => void loadDetail()}
        />
      }
      style={styles.screen}>
      <View style={styles.card}>
        {activePattern?.thumbnailUrl ? (
          <Image
            contentFit="cover"
            source={authenticatedImageSource(activePattern.thumbnailUrl, accessToken)}
            style={styles.heroImage}
          />
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroFallbackEyebrow}>{sourceLabel}</Text>
            <Text style={styles.heroFallbackTitle}>
              {(activePattern?.craftType?.trim() || 'Pattern').toUpperCase()}
            </Text>
            <Text style={styles.heroFallbackMeta}>PDF preview available inside the app</Text>
          </View>
        )}
        <Text numberOfLines={3} style={styles.title}>{activePattern?.title ?? 'Pattern'}</Text>
        <Text style={styles.meta}>
          {activePattern?.originalFilename ?? 'File metadata will appear here.'}
        </Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {(activePattern?.craftType ?? 'knitting').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.badge, styles.sourceBadge]}>
            <Text style={[styles.badgeText, styles.sourceBadgeText]}>{sourceLabel}</Text>
          </View>
          {activePattern?.isArchived ? (
            <View style={[styles.badge, styles.archiveBadge]}>
              <Text style={[styles.badgeText, styles.archiveBadgeText]}>ARCHIVED</Text>
            </View>
          ) : null}
        </View>
        {activePattern?.updatedAt ? (
          <Text style={styles.detailLine}>
            Updated {new Date(activePattern.updatedAt).toLocaleString()}
          </Text>
        ) : null}
        <View style={styles.activitySummaryRow}>
          <View style={styles.activitySummaryPill}>
            <Text style={styles.activitySummaryText}>
              {chatSessions.length} chat{chatSessions.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.activitySummaryPill}>
            <Text style={styles.activitySummaryText}>
              {rewrites.length} rewrite{rewrites.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, styles.startHereCard]}>
        <Text style={styles.eyebrow}>Start here</Text>
        <Text style={styles.sectionTitle}>What do you want to do with this pattern?</Text>
        <Text style={styles.body}>{nextBestAction.copy}</Text>
        <View style={styles.actionGrid}>
          <BrandButton
            label="View Pattern"
            loading={isOpeningFile}
            onPress={() => void handleOpenFile()}
            style={styles.fullWidth}
          />
          <BrandButton
            label={firstStashInsight ? 'Start with stash' : 'Start project'}
            onPress={startProjectFromPattern}
            style={styles.fullWidth}
            variant="secondary"
          />
          <BrandButton
            label="Ask about this"
            onPress={() => handleChatNavigation()}
            style={styles.fullWidth}
            variant="ghost"
          />
          <BrandButton
            label="Rewrite / adapt"
            onPress={handleRewriteNavigation}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryHeaderActions}>
            <Text
              onPress={isRefreshingSummary ? undefined : handleRefreshSummaryPress}
              style={[styles.inlineLink, isRefreshingSummary ? styles.inlineLinkDisabled : null]}>
              {isRefreshingSummary ? 'Refreshing…' : 'Refresh'}
            </Text>
          </View>
        </View>
        <ScrollView nestedScrollEnabled style={styles.summaryScroll}>
          <Text style={styles.summaryBody}>{formattedSummaryText}</Text>
        </ScrollView>
        <BrandButton
          label="Ask questions"
          onPress={() =>
            handleChatNavigation({
              placeholder: buildPatternQuestionStarter(activePattern, summaryText),
              summary: formattedSummaryText,
            })
          }
          style={styles.fullWidth}
          variant="secondary"
        />
      </View>

      <View style={[styles.card, styles.readinessCard]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Project setup checks</Text>
          <Text style={styles.sectionMeta}>
            {readinessCompleteCount} of {readinessTasks.length} checks are ready
          </Text>
        </View>
        <View style={styles.readinessList}>
          {readinessTasks.map((task) => (
            <View key={task.key} style={styles.readinessRow}>
              <MaterialCommunityIcons
                color={task.complete ? tokens.color.success : tokens.color.muted}
                name={task.complete ? 'check-circle' : 'circle-outline'}
                size={20}
              />
              <View style={styles.readinessTextBlock}>
                <Text style={styles.readinessTitle}>{task.title}</Text>
                <Text style={styles.readinessCopy}>{task.copy}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.actionGrid}>
          <BrandButton
            label="Ask readiness check"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: { prompt: readinessPrompt },
              })
            }
            style={styles.fullWidth}
            variant="secondary"
          />
          <BrandButton
            label="Ask size check"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: {
                  prompt: [
                    `Help me choose the right size for ${activePattern?.title ?? 'this pattern'}.`,
                    ravelrySizes ? `Available sizes: ${ravelrySizes}.` : 'The app did not detect a size list, but the PDF may include one.',
                    ravelryGauge ? `Gauge: ${ravelryGauge}.` : null,
                    ravelryYardage ? `Yardage: ${ravelryYardage}.` : null,
                    'Explain what measurements I should compare before starting.',
                  ]
                    .filter(Boolean)
                    .join('\n'),
                },
              })
            }
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      </View>

      {stashInsights.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Stash to check</Text>
            <Text style={styles.sectionMeta}>Possible matches from your saved supplies</Text>
          </View>
          <View style={styles.stashList}>
            {stashInsights.map((insight) => (
              <View key={insight.item.id} style={styles.stashItem}>
                <Text style={styles.stashTitle}>{describeStashItem(insight.item)}</Text>
                <Text style={styles.stashReason}>{insight.reason}</Text>
              </View>
            ))}
          </View>
          <BrandButton
            label="Ask about these materials"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: {
                  prompt: `Can I use any of this stash for ${activePattern?.title ?? 'this pattern'}? ${stashInsights
                    .map((insight) => describeStashItem(insight.item))
                    .join('; ')}`,
                },
              })
            }
            style={styles.fullWidth}
            variant="secondary"
          />
          {firstStashInsight ? (
            <BrandButton
              label="Search Ravelry from best match"
              onPress={() =>
                router.push({
                  pathname: '/ravelry',
                  params: {
                    q: [activePattern?.title, firstStashInsight.item.colour, firstStashInsight.item.fibre]
                      .filter(Boolean)
                      .join(' '),
                    pageSize: '10',
                    autoRun: '1',
                    source: 'pattern-stash',
                    stashId: firstStashInsight.item.id,
                    stashName: firstStashInsight.item.name,
                  },
                })
              }
              style={styles.fullWidth}
              variant="ghost"
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pattern file and source</Text>
          <Text style={styles.sectionMeta}>Open, reference, refresh</Text>
        </View>
        <View style={[styles.secondaryActionGrid, !compactActions ? styles.secondaryActionGridWide : null]}>
          <BrandButton
            label={isOpeningFile ? 'Opening file…' : 'View Pattern'}
            loading={isOpeningFile}
            onPress={() => void handleOpenFile()}
            style={!compactActions ? styles.halfWidth : styles.fullWidth}
            variant="ghost"
          />
          {ravelryUrl ? (
            <BrandButton
              label="Buy / View on Ravelry"
              onPress={() => void Linking.openURL(ravelryUrl)}
              style={!compactActions ? styles.halfWidth : styles.fullWidth}
              variant="ghost"
            />
          ) : null}
          {activePattern?.source === 'ravelry' && ravelryId ? (
            <BrandButton
              label={isRefreshingRavelry ? 'Refreshing…' : 'Refresh from Ravelry'}
              loading={isRefreshingRavelry}
              onPress={() => void handleRefreshFromRavelry()}
              style={!compactActions ? styles.halfWidth : styles.fullWidth}
              variant="ghost"
            />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Manage this pattern</Text>
          <Text style={styles.sectionMeta}>Tidy details without hunting around</Text>
        </View>
        <View style={[styles.secondaryActionGrid, !compactActions ? styles.secondaryActionGridWide : null]}>
          <BrandButton
            label={isEditingMetadata ? 'Close editor' : 'Edit details'}
            onPress={() => setIsEditingMetadata((value) => !value)}
            style={!compactActions ? styles.halfWidth : styles.fullWidth}
            variant="ghost"
          />
          <BrandButton
            label={isArchiving ? 'Saving…' : activePattern?.isArchived ? 'Unarchive' : 'Archive'}
            loading={isArchiving}
            onPress={handleArchive}
            style={!compactActions ? styles.halfWidth : styles.fullWidth}
            variant="ghost"
          />
          <BrandButton
            label={isDeleting ? 'Deleting…' : 'Delete pattern'}
            loading={isDeleting}
            onPress={handleDelete}
            style={styles.fullWidth}
            variant="secondary"
          />
        </View>
      </View>

      {isEditingMetadata ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Edit details</Text>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="Pattern title"
            placeholderTextColor="#9b867d"
            style={styles.input}
          />
          <TextInput
            value={draftCraftType}
            onChangeText={setDraftCraftType}
            placeholder="Craft type"
            placeholderTextColor="#9b867d"
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            value={draftSourceUrl}
            onChangeText={setDraftSourceUrl}
            placeholder="Source URL"
            placeholderTextColor="#9b867d"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <View style={styles.actionGrid}>
            <BrandButton label="Save changes" onPress={() => void handleSaveMetadata()} style={styles.fullWidth} />
            <BrandButton label="Cancel" onPress={() => setIsEditingMetadata(false)} style={styles.fullWidth} variant="ghost" />
          </View>
        </View>
      ) : null}

      {statusMessage ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{statusMessage}</Text>
        </View>
      ) : null}

      {activeProjectClones.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active project clones</Text>
            <Text style={styles.sectionMeta}>{activeProjectClones.length}</Text>
          </View>
          <View style={styles.list}>
            {activeProjectClones.slice(0, 4).map((project) => (
              <View key={project.id} style={styles.listItem}>
                <View style={styles.projectListHeader}>
                  <Text onPress={() => router.push(`/project/${project.id}`)} style={styles.listTitle}>
                    {project.title}
                  </Text>
                  <View style={styles.projectStatusPill}>
                    <Text style={styles.projectStatusPillText}>{project.status}</Text>
                  </View>
                </View>
                <Text style={styles.listMeta}>
                  {project.stageLabel} · {project.progressPercent}%
                </Text>
                <View style={styles.projectActionRow}>
                  <BrandButton
                    label="Open project"
                    onPress={() => router.push(`/project/${project.id}`)}
                    style={styles.projectActionButton}
                    variant="secondary"
                  />
                  <BrandButton
                    label="PDF markers"
                    onPress={() =>
                      router.push({
                        pathname: '/pattern/[id]',
                        params: { id: project.patternId, openFile: '1', projectId: project.id },
                      })
                    }
                    style={styles.projectActionButton}
                    variant="ghost"
                  />
                </View>
              </View>
            ))}
          </View>
          <BrandButton
            label="Create another project clone"
            onPress={startProjectFromPattern}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      ) : null}

      {(ravelryDesigner || ravelryGauge || ravelrySizes || ravelryYardage || ravelryAvailability) ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Imported metadata</Text>
          {ravelryDesigner ? <Text style={styles.metaLine}>Designer: {ravelryDesigner}</Text> : null}
          {ravelryAvailability ? (
            <Text style={styles.metaLine}>Availability: {ravelryAvailability}</Text>
          ) : null}
          {ravelryGauge ? <Text style={styles.metaLine}>Gauge: {ravelryGauge}</Text> : null}
          {ravelrySizes ? <Text style={styles.metaLine}>Sizes: {ravelrySizes}</Text> : null}
          {ravelryYardage ? <Text style={styles.metaLine}>Yardage: {ravelryYardage}</Text> : null}
          <View style={styles.actionGrid}>
            {ravelryGauge ? (
              <BrandButton
                label="Explain gauge"
                onPress={() =>
	                  router.push({
	                    pathname: '/(tabs)/chat',
	                    params: {
	                      title: 'Gauge explanation',
	                      prompt: `Please explain this gauge for ${activePattern?.title ?? 'this pattern'}: ${ravelryGauge}. What should I check before starting?`,
	                      context: `Pattern: ${activePattern?.title ?? 'Unknown'}. Gauge: ${ravelryGauge}. Sizes: ${ravelrySizes || 'n/a'}. Yardage: ${ravelryYardage || 'n/a'}.`,
	                      toolMode: 'pattern_metadata_helper',
	                    },
                  })
                }
                style={styles.fullWidth}
                variant="secondary"
              />
            ) : null}
            <BrandButton
              label="Ask about sizing and materials"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/chat',
                  params: {
                    prompt: [
                      `Help me understand the sizing and materials for ${activePattern?.title ?? 'this pattern'}.`,
                      ravelrySizes ? `Sizes: ${ravelrySizes}.` : null,
                      ravelryYardage ? `Yardage: ${ravelryYardage}.` : null,
                      ravelryGauge ? `Gauge: ${ravelryGauge}.` : null,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  },
                })
              }
              style={styles.fullWidth}
              variant="ghost"
            />
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent chats</Text>
          <Text style={styles.sectionMeta}>{chatSessions.length}</Text>
        </View>
        {isRefreshing && chatSessions.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={styles.loadingText}>Loading chats…</Text>
          </View>
        ) : chatSessions.length === 0 ? (
          <Text style={styles.emptyCopy}>No saved chats for this pattern yet.</Text>
        ) : (
          <View style={styles.list}>
            {chatSessions.slice(0, 4).map((session) => (
              <View key={session.id} style={styles.listItem}>
                <Text
                  onPress={() =>
                    router.push({
                      pathname: '/pattern-chat',
                      params: { patternId: activePattern?.id, sessionId: session.id },
                    })
                  }
                  style={styles.listTitle}>
                  {session.title}
                </Text>
                <Text style={styles.listMeta}>
                  {session.updatedAt
                    ? new Date(session.updatedAt).toLocaleString()
                    : 'Recent conversation'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent rewrites</Text>
          <Text style={styles.sectionMeta}>{rewrites.length}</Text>
        </View>
        {isRefreshing && rewrites.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={styles.loadingText}>Loading rewrites…</Text>
          </View>
        ) : rewrites.length === 0 ? (
          <Text style={styles.emptyCopy}>No saved rewrites for this pattern yet.</Text>
        ) : (
          <View style={styles.list}>
            {rewrites.slice(0, 4).map((rewrite) => (
              <View key={rewrite.id} style={styles.listItem}>
                <Text
                  onPress={() =>
                    router.push({
                      pathname: '/pattern-rewrite',
                      params: { patternId: activePattern?.id, rewriteId: rewrite.id },
                    })
                  }
                  style={styles.listTitle}>
                  {rewrite.prompt ?? 'Saved rewrite'}
                </Text>
                <Text style={styles.listMeta}>
                  {rewrite.createdAt ? new Date(rewrite.createdAt).toLocaleString() : 'Saved rewrite'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {fileUrl ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pattern file</Text>
          <Pressable
            accessibilityLabel="Open pattern PDF viewer"
            accessibilityRole="button"
            onPress={() => void handleOpenFile()}
            style={({ pressed }) => [styles.fileThumbnailButton, pressed ? styles.pressed : null]}>
            {activePattern?.thumbnailUrl ? (
              <Image
                contentFit="cover"
                source={authenticatedImageSource(activePattern.thumbnailUrl, accessToken)}
                style={styles.fileThumbnailImage}
              />
            ) : (
              <View style={styles.fileThumbnailFallback}>
                <Text style={styles.heroFallbackEyebrow}>{sourceLabel}</Text>
                <Text style={styles.heroFallbackTitle}>
                  {(activePattern?.craftType?.trim() || 'Pattern file').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.fileThumbnailOverlay}>
              <MaterialCommunityIcons color={tokens.color.surface} name="file-document-outline" size={20} />
              <Text style={styles.fileThumbnailOverlayText}>
                {isOpeningFile ? 'Opening…' : 'Open PDF viewer'}
              </Text>
            </View>
          </Pressable>
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
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  card: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    ...shadows.soft,
  },
  readinessCard: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
  },
  startHereCard: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
  },
  improveCard: {
    backgroundColor: '#fff7ec',
    borderColor: '#ead7b7',
  },
  nextBestCard: {
    backgroundColor: '#f2f8f0',
    borderColor: 'rgba(63, 143, 85, 0.22)',
  },
  sizingStartCard: {
    backgroundColor: '#f4fbfb',
    borderColor: '#c5e1df',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  statTile: {
    width: '48%',
    minHeight: 78,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  statValue: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  heroImage: {
    width: '100%',
    aspectRatio: 1.55,
    borderRadius: 18,
    marginBottom: tokens.spacing.xs,
  },
  heroFallback: {
    width: '100%',
    aspectRatio: 1.55,
    borderRadius: 18,
    marginBottom: tokens.spacing.xs,
    padding: tokens.spacing.lg,
    justifyContent: 'flex-end',
    backgroundColor: '#f6ede4',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  heroFallbackEyebrow: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroFallbackTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 28,
    lineHeight: 32,
    marginTop: tokens.spacing.xs,
  },
  heroFallbackMeta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 14,
    marginTop: tokens.spacing.sm,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 34,
    flexShrink: 1,
  },
  meta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#efe1d3',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
    marginTop: tokens.spacing.xs,
  },
  badgeText: {
    color: tokens.color.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  sourceBadge: {
    backgroundColor: '#edf7f6',
  },
  sourceBadgeText: {
    color: '#2d7478',
  },
  archiveBadge: {
    backgroundColor: '#fff0ea',
  },
  archiveBadgeText: {
    color: tokens.color.danger,
  },
  detailLine: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: tokens.spacing.xs,
  },
  activitySummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  activitySummaryPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fff7f0',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  activitySummaryText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 29,
  },
  sectionHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacing.xs,
  },
  sectionMeta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    alignSelf: 'flex-start',
  },
  body: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 19,
  },
  inlineLink: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  inlineLinkDisabled: {
    color: tokens.color.muted,
  },
  summaryHeaderActions: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
    justifyContent: 'flex-end',
  },
  actionGrid: {
    gap: tokens.spacing.sm,
  },
  readinessList: {
    gap: tokens.spacing.sm,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
  },
  readinessTextBlock: {
    flex: 1,
    gap: 3,
  },
  readinessTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 15,
    fontWeight: '800',
  },
  readinessCopy: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 13,
    lineHeight: 19,
  },
  secondaryActionGrid: {
    gap: tokens.spacing.sm,
  },
  secondaryActionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  fullWidth: {
    width: '100%',
  },
  halfWidth: {
    width: '48.5%',
  },
  input: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    fontFamily: tokens.font.body,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  notice: {
    backgroundColor: '#fff3ed',
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(184, 74, 63, 0.2)',
    padding: tokens.spacing.md,
  },
  noticeText: {
    color: tokens.color.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    minHeight: 48,
  },
  loadingText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
  },
  emptyCopy: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 22,
  },
  metaLine: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: tokens.spacing.sm,
  },
  listItem: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  projectListHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  projectStatusPill: {
    borderRadius: tokens.radius.pill,
    backgroundColor: '#efe1d3',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 5,
  },
  projectStatusPillText: {
    color: tokens.color.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  projectActionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  projectActionButton: {
    flex: 1,
    minHeight: 42,
  },
  listTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 17,
    lineHeight: 21,
  },
  listMeta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
  },
  stashList: {
    gap: tokens.spacing.sm,
  },
  stashItem: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  stashTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  stashReason: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryScroll: {
    maxHeight: 380,
  },
  summaryBody: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 14,
    lineHeight: 20,
  },
  fileThumbnailButton: {
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 220,
    overflow: 'hidden',
  },
  fileThumbnailImage: {
    height: 220,
    width: '100%',
  },
  fileThumbnailFallback: {
    backgroundColor: '#f6ede4',
    height: 220,
    justifyContent: 'flex-end',
    padding: tokens.spacing.lg,
    width: '100%',
  },
  fileThumbnailOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 63, 54, 0.88)',
    bottom: 0,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    justifyContent: 'center',
    left: 0,
    minHeight: 52,
    paddingHorizontal: tokens.spacing.md,
    position: 'absolute',
    right: 0,
  },
  fileThumbnailOverlayText: {
    color: tokens.color.surface,
    fontFamily: tokens.font.body,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});
