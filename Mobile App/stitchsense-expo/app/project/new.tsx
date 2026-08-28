import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppCard } from '@/src/components/ui/app-card';
import { BrandButton } from '@/src/components/ui/brand-button';
import { DeadlineSheet, formatDeadlineLabel } from '@/src/components/ui/deadline-sheet';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { SelectSheet } from '@/src/components/ui/select-sheet';
import { stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { Pattern } from '@/src/lib/models';
import { describeStashItem, findStashInsights } from '@/src/lib/stash-insights';
import type { StashItem } from '@/src/lib/stash-store';
import { useLibrary } from '@/src/providers/library-provider';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useProjects } from '@/src/providers/projects-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { tokens } from '@/src/theme/tokens';

const projectStateOptions = [
  { label: 'Planned', value: 'planned' },
  { label: 'Active', value: 'active' },
  { label: 'Started', value: 'started' },
  { label: 'Paused', value: 'paused' },
] as const;

type ProjectStateValue = (typeof projectStateOptions)[number]['value'];
type PatternSizingMode = 'unknown' | 'sized' | 'one-size';

function stageLabelForState(state: ProjectStateValue) {
  switch (state) {
    case 'planned':
      return 'Planned';
    case 'active':
      return 'Active';
    case 'started':
      return 'Started';
    case 'paused':
      return 'Paused';
    default:
      return 'Getting started';
  }
}

function backendStatusForState(state: ProjectStateValue) {
  switch (state) {
    case 'planned':
      return 'planned';
    case 'paused':
      return 'paused';
    case 'active':
    case 'started':
    default:
      return 'active';
  }
}

function extractProjectPrefill(pattern: Pattern | null) {
  const metadata = (pattern?.metadata ?? {}) as Record<string, unknown>;
  const yarnParts = [
    metadata.yarn_name,
    metadata.yarn_weight,
    metadata.yardage,
    metadata.fibre,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  const needleParts = [
    metadata.needle_size,
    metadata.needle_sizes,
    metadata.hook_size,
    metadata.hook_sizes,
    metadata.recommended_needle,
    metadata.recommended_hook,
    metadata.gauge,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  return {
    yarnDetails: yarnParts.join(' · ') || null,
    needleHookDetails: needleParts.join(' · ') || null,
  };
}

function metadataText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const joined = value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .join(', ');
      if (joined) return joined;
    }
  }
  return '';
}

function inferPatternSizing(pattern: Pattern | null) {
  const metadata = (pattern?.metadata ?? {}) as Record<string, unknown>;
  const sizesText = metadataText(metadata, [
    'sizes',
    'size',
    'size_options',
    'sizeOptions',
    'finished_measurements',
    'finishedMeasurements',
    'to_fit',
    'toFit',
  ]);

  const oneSize = /\bone size\b|\bone-size\b|one size fits|osfa|no sizing/i.test(sizesText);
  const options = sizesText
    .split(/[,;/|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 42)
    .slice(0, 8);

  return {
    sizesText,
    suggestedMode: oneSize ? 'one-size' as const : sizesText ? 'sized' as const : 'unknown' as const,
    options,
  };
}

function buildSizingNotes({
  sizingMode,
  selectedSize,
  fitMeasurement,
  finishedMeasurement,
  easePreference,
  lengthChoice,
  sleeveChoice,
  sizingNotes,
}: {
  sizingMode: PatternSizingMode;
  selectedSize: string;
  fitMeasurement: string;
  finishedMeasurement: string;
  easePreference: string;
  lengthChoice: string;
  sleeveChoice: string;
  sizingNotes: string;
}) {
  if (sizingMode === 'unknown') {
    return null;
  }

  if (sizingMode === 'one-size') {
    return [
      'Sizing and fit choices:',
      '- Pattern treated as one size / no size selection needed.',
      sizingNotes.trim() ? `- Notes: ${sizingNotes.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const lines = [
    selectedSize.trim() ? `- Chosen size: ${selectedSize.trim()}` : null,
    fitMeasurement.trim() ? `- Bust/chest to-fit measurement: ${fitMeasurement.trim()}` : null,
    finishedMeasurement.trim() ? `- Finished bust/chest measurement: ${finishedMeasurement.trim()}` : null,
    easePreference.trim() ? `- Intended ease / fit: ${easePreference.trim()}` : null,
    lengthChoice.trim() ? `- Body length / length to shoulder: ${lengthChoice.trim()}` : null,
    sleeveChoice.trim() ? `- Sleeve seam / sleeve length: ${sleeveChoice.trim()}` : null,
    sizingNotes.trim() ? `- Notes: ${sizingNotes.trim()}` : null,
  ].filter(Boolean);

  return lines.length ? ['Sizing and fit choices:', ...lines].join('\n') : null;
}

function friendlyProjectCreateError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'We could not create the project just now.';
  }

  if (/valid project id/i.test(error.message)) {
    return 'The project was saved, but the app needs one more moment to finish linking it cleanly.';
  }

  if (/patternid/i.test(error.message)) {
    return 'The linked pattern did not carry through cleanly. Please reopen the pattern and try again.';
  }

  return getUserFacingErrorMessage(error, {
    fallback: 'We could not create the project just now.',
  });
}

export default function NewProjectScreen() {
  const router = useRouter();
  const { patternId, stashId, stashName, stashIdea } = useLocalSearchParams<{
    patternId?: string;
    stashId?: string;
    stashName?: string;
    stashIdea?: string;
  }>();
  const { patterns } = useLibrary();
  const { accessToken } = useSession();
  const { settings } = usePreferences();
  const { upsertProject, refreshProjects } = useProjects();
  const { items: stashItems, updateItem: updateStashItem } = useStash();

  const availablePatterns = useMemo(
    () => patterns.filter((pattern) => !pattern.isArchived),
    [patterns],
  );
  const initialPattern =
    availablePatterns.find((pattern) => pattern.id === patternId) ??
    availablePatterns[0] ??
    null;
  const isPatternLocked = Boolean(patternId && initialPattern);

  const [selectedPatternId, setSelectedPatternId] = useState<string>(initialPattern?.id ?? '');
  const [title, setTitle] = useState(initialPattern?.title ?? '');
  const [projectState, setProjectState] = useState<ProjectStateValue>('started');
  const [recipient, setRecipient] = useState('');
  const [occasion, setOccasion] = useState('');
  const [isGift, setIsGift] = useState(false);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showStateSheet, setShowStateSheet] = useState(false);
  const [showDeadlineSheet, setShowDeadlineSheet] = useState(false);
  const [showSizeSheet, setShowSizeSheet] = useState(false);
  const [selectedStashIds, setSelectedStashIds] = useState<string[]>([]);
  const [sizingMode, setSizingMode] = useState<PatternSizingMode>('unknown');
  const [selectedSize, setSelectedSize] = useState('');
  const [fitMeasurement, setFitMeasurement] = useState('');
  const [finishedMeasurement, setFinishedMeasurement] = useState('');
  const [easePreference, setEasePreference] = useState('');
  const [lengthChoice, setLengthChoice] = useState('');
  const [sleeveChoice, setSleeveChoice] = useState('');
  const [sizingNotes, setSizingNotes] = useState('');

  const selectedPattern = useMemo<Pattern | null>(
    () => availablePatterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
    [availablePatterns, selectedPatternId],
  );

  const effectivePattern = isPatternLocked ? initialPattern : selectedPattern;
  const resolvedPatternId = effectivePattern?.id ?? null;
  const projectPrefill = useMemo(() => extractProjectPrefill(effectivePattern), [effectivePattern]);
  const patternSizing = useMemo(() => inferPatternSizing(effectivePattern), [effectivePattern]);
  const measurementUnitLabel = settings.measurementUnit === 'imperial' ? 'inches' : 'cm';
  const measurementUnitShort = settings.measurementUnit === 'imperial' ? 'in' : 'cm';
  const patternSizeOptions = useMemo(
    () => [
      ...patternSizing.options.map((option) => ({ label: option, value: option })),
      { label: 'Custom size / measurement', value: '__custom__' },
    ],
    [patternSizing.options],
  );
  const stashInsights = useMemo(
    () => findStashInsights(effectivePattern, stashItems, 5),
    [effectivePattern, stashItems],
  );
  const initialStashMatch = useMemo(() => {
    if (stashId) {
      return stashItems.find((item) => item.id === stashId) ?? null;
    }

    const normalizedName = String(stashName ?? '').trim().toLowerCase();
    if (!normalizedName) return null;

    return stashItems.find((item) => item.name.trim().toLowerCase() === normalizedName) ?? null;
  }, [stashId, stashItems, stashName]);
  const selectedStashItems = useMemo(
    () => stashItems.filter((item) => selectedStashIds.includes(item.id)),
    [selectedStashIds, stashItems],
  );
  const creationChecklist = [
    {
      label: 'Pattern selected',
      complete: Boolean(effectivePattern),
      copy: effectivePattern?.title ?? 'Choose the pattern this project follows.',
    },
    {
      label: 'Project named',
      complete: Boolean(title.trim()),
      copy: title.trim() || 'Add a name so it is easy to find later.',
    },
    {
      label: 'Materials context',
      complete: Boolean(projectPrefill.yarnDetails || projectPrefill.needleHookDetails || selectedStashItems.length),
      copy: selectedStashItems.length
        ? `${selectedStashItems.length} stash item${selectedStashItems.length === 1 ? '' : 's'} selected.`
        : projectPrefill.yarnDetails || projectPrefill.needleHookDetails
          ? 'Pattern material details will be carried over.'
          : 'Optional, but helpful for future guidance.',
    },
    {
      label: 'Sizing checked',
      complete:
        sizingMode === 'one-size' ||
        (sizingMode === 'sized' &&
          Boolean(
            selectedSize.trim() ||
              fitMeasurement.trim() ||
              finishedMeasurement.trim() ||
              sizingNotes.trim(),
          )) ||
        (sizingMode === 'unknown' && patternSizing.suggestedMode === 'unknown'),
      copy:
        sizingMode === 'one-size'
          ? 'No size choice needed for this project.'
          : sizingMode === 'sized'
            ? selectedSize.trim()
              ? `Making size ${selectedSize.trim()}.`
              : 'Add the chosen size or key measurement before you start.'
            : patternSizing.suggestedMode === 'sized'
              ? 'This pattern appears to have size options.'
              : 'No size options detected yet.',
    },
    {
      label: 'Making intention',
      complete: Boolean(projectState || recipient.trim() || deadlineAt || notes.trim()),
      copy: isGift && recipient.trim()
        ? `Gift for ${recipient.trim()}.`
        : deadlineAt
          ? `Deadline set: ${formatDeadlineLabel(deadlineAt)}.`
          : 'State, recipient, deadline, or notes can be added now or later.',
    },
  ];

  function toggleStashItem(item: StashItem) {
    setSelectedStashIds((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id],
    );
  }

  useEffect(() => {
    if (!initialPattern) return;

    if (isPatternLocked) {
      setSelectedPatternId(initialPattern.id);
      setTitle((current) => (current.trim() ? current : initialPattern.title));
      return;
    }

    if (!selectedPatternId) {
      setSelectedPatternId(initialPattern.id);
      setTitle((current) => (current.trim() ? current : initialPattern.title));
    }
  }, [initialPattern, isPatternLocked, selectedPatternId]);

  useEffect(() => {
    setSizingMode(patternSizing.suggestedMode);
    setSelectedSize('');
    setFitMeasurement('');
    setFinishedMeasurement('');
    setEasePreference('');
    setLengthChoice('');
    setSleeveChoice('');
    setSizingNotes('');
  }, [effectivePattern?.id, patternSizing.suggestedMode]);

  useEffect(() => {
    if (!initialStashMatch) return;

    setSelectedStashIds((current) =>
      current.includes(initialStashMatch.id) ? current : [initialStashMatch.id, ...current],
    );
  }, [initialStashMatch]);

  async function handleCreate() {
    if (!accessToken || !effectivePattern || !resolvedPatternId) {
      setErrorMessage('Please choose a linked pattern first.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const expectedTitle = title.trim() || effectivePattern.title;
      const selectedStashSummary = selectedStashItems.map(describeStashItem).join('; ');
      const sizingSummary = buildSizingNotes({
        sizingMode,
        selectedSize,
        fitMeasurement,
        finishedMeasurement,
        easePreference,
        lengthChoice,
        sleeveChoice,
        sizingNotes,
      });
      const projectNotes = [
        notes.trim() || null,
        sizingSummary,
        stashIdea ? `Started from stash idea: ${stashIdea}` : null,
        selectedStashSummary ? `Stash selected for this project: ${selectedStashSummary}` : null,
      ]
        .filter(Boolean)
        .join('\n\n') || null;
      const yarnDetails = [
        projectPrefill.yarnDetails,
        selectedStashItems
          .filter((item) => item.category === 'yarn')
          .map(describeStashItem)
          .join('; ') || null,
      ]
        .filter(Boolean)
        .join(' · ') || null;
      const needleHookDetails = [
        projectPrefill.needleHookDetails,
        selectedStashItems
          .filter((item) => item.category !== 'yarn')
          .map(describeStashItem)
          .join('; ') || null,
      ]
        .filter(Boolean)
        .join(' · ') || null;
      const createdProject = await stitchSenseAPI.createProject(accessToken, {
        patternId: resolvedPatternId,
        title: expectedTitle,
        craftType: effectivePattern.craftType ?? null,
        status: backendStatusForState(projectState),
        stageLabel: stageLabelForState(projectState),
        recipient: recipient.trim() || null,
        deadlineAt,
        notes: projectNotes,
        occasion: occasion.trim() || null,
        isGift,
        yarnDetails,
        needleHookDetails,
        coverImageUrl: effectivePattern.thumbnailUrl ?? null,
      });

      let resolvedProject = createdProject;

      if (!resolvedProject?.id) {
        const latestProjects = await stitchSenseAPI.projects(accessToken);
        const normalizedTitle = expectedTitle.trim().toLowerCase();
        const recoveredProject =
          latestProjects.find(
            (project) =>
              project.patternId === resolvedPatternId &&
              project.title.trim().toLowerCase() === normalizedTitle,
          ) ??
          latestProjects.find((project) => project.patternId === resolvedPatternId) ??
          latestProjects.find((project) => project.title.trim().toLowerCase() === normalizedTitle) ??
          null;

        if (!recoveredProject?.id) {
          throw new Error('Project saved, but the app did not receive a valid project ID back.');
        }

        resolvedProject = recoveredProject;
      }

      upsertProject(resolvedProject);
      if (selectedStashItems.length) {
        await Promise.all(
          selectedStashItems.map((item) =>
            updateStashItem(item.id, { reservedFor: resolvedProject.title }).catch(() => undefined),
          ),
        );
      }
      try {
        await refreshProjects();
      } catch {
        // Keep the optimistic project so creation still feels successful.
      }
      router.replace(`/project/${resolvedProject.id}`);
    } catch (error) {
      setErrorMessage(friendlyProjectCreateError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <ScreenHero
        eyebrow="New project"
        title="Start from a library pattern"
        copy="One pattern can power as many separate projects as you need, each with its own notes, deadline, recipient, and progress."
        icon="notebook-plus-outline"
      />

      {isPatternLocked ? (
        <AppCard elevated style={styles.card}>
          <Text style={styles.sectionTitle}>Selected pattern</Text>
          <Text style={styles.lockedPatternTitle}>
            {selectedPattern?.title ?? 'Selected pattern'}
          </Text>
          <Text style={styles.lockedPatternCopy}>
            This project will be created from the pattern you opened in Library.
          </Text>
        </AppCard>
      ) : (
        <AppCard elevated style={styles.card}>
          <Text style={styles.sectionTitle}>Choose pattern</Text>
          <Text style={styles.sectionCopy}>
            Pick the library pattern you want this project to follow.
          </Text>
          <View style={styles.patternList}>
            {availablePatterns.slice(0, 12).map((pattern) => {
              const active = pattern.id === selectedPatternId;
              return (
                <Pressable
                  key={pattern.id}
                  onPress={() => {
                    setSelectedPatternId(pattern.id);
                    if (!title.trim() || title === selectedPattern?.title) {
                      setTitle(pattern.title);
                    }
                  }}
                  style={[styles.patternOption, active ? styles.patternOptionActive : null]}>
                  <Text
                    style={[
                      styles.patternOptionText,
                      active ? styles.patternOptionTextActive : null,
                    ]}>
                    {pattern.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AppCard>
      )}

      <AppCard elevated style={styles.card}>
        <Text style={styles.sectionTitle}>Project details</Text>
        <TextInput
          onChangeText={setTitle}
          placeholder="Project name"
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={title}
        />
        <View style={styles.quickFillRow}>
          <Pressable
            disabled={!effectivePattern}
            onPress={() => setTitle(effectivePattern?.title ?? title)}
            style={[styles.quickFillButton, !effectivePattern ? styles.quickFillButtonDisabled : null]}>
            <Text style={styles.quickFillText}>Use pattern title</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setNotes((current) =>
                current.trim()
                  ? current
                  : 'Start by checking materials, reading the first section, and setting up a row or round counter.',
              )
            }
            style={styles.quickFillButton}>
            <Text style={styles.quickFillText}>Draft start note</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setShowStateSheet(true)} style={styles.selectField}>
          <Text style={styles.selectLabel}>Project state</Text>
          <Text style={styles.selectValue}>
            {projectStateOptions.find((option) => option.value === projectState)?.label ??
              'Select state'}
          </Text>
        </Pressable>
        <TextInput
          onChangeText={setRecipient}
          placeholder="Recipient, if any"
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={recipient}
        />
        <TextInput
          onChangeText={setOccasion}
          placeholder="Occasion, if any"
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={occasion}
        />
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setIsGift(false)}
            style={[styles.togglePill, !isGift ? styles.togglePillActive : null]}>
            <Text style={[styles.togglePillText, !isGift ? styles.togglePillTextActive : null]}>
              Personal make
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setIsGift(true)}
            style={[styles.togglePill, isGift ? styles.togglePillActive : null]}>
            <Text style={[styles.togglePillText, isGift ? styles.togglePillTextActive : null]}>
              Gift project
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setShowDeadlineSheet(true)} style={styles.selectField}>
          <Text style={styles.selectLabel}>Deadline</Text>
          <Text style={styles.selectValue}>{formatDeadlineLabel(deadlineAt)}</Text>
        </Pressable>
        {projectPrefill.yarnDetails || projectPrefill.needleHookDetails ? (
          <View style={styles.prefillCard}>
            <Text style={styles.prefillTitle}>Pattern details ready to carry over</Text>
            {projectPrefill.yarnDetails ? (
              <Text style={styles.prefillCopy}>Yarn: {projectPrefill.yarnDetails}</Text>
            ) : null}
            {projectPrefill.needleHookDetails ? (
              <Text style={styles.prefillCopy}>
                Needle / hook: {projectPrefill.needleHookDetails}
              </Text>
            ) : null}
          </View>
        ) : null}
        {initialStashMatch || stashName || stashIdea ? (
          <View style={styles.prefillCard}>
            <Text style={styles.prefillTitle}>Started from stash</Text>
            <Text style={styles.prefillCopy}>
              {initialStashMatch
                ? `${describeStashItem(initialStashMatch)} is already selected for this project.`
                : stashName
                  ? `${stashName} will be carried into the project notes.`
                  : 'This project started from a stash idea.'}
            </Text>
            {stashIdea ? <Text style={styles.prefillCopy}>Idea: {stashIdea}</Text> : null}
          </View>
        ) : null}
        {stashInsights.length ? (
          <View style={styles.prefillCard}>
            <Text style={styles.prefillTitle}>Possible stash matches</Text>
            <Text style={styles.prefillCopy}>
              Select anything you want carried into the project notes and material details.
            </Text>
            <View style={styles.stashSuggestionList}>
              {stashInsights.map((insight) => {
                const active = selectedStashIds.includes(insight.item.id);
                return (
                  <Pressable
                    key={insight.item.id}
                    onPress={() => toggleStashItem(insight.item)}
                    style={[styles.stashSuggestion, active ? styles.stashSuggestionActive : null]}>
                    <Text style={[styles.stashSuggestionTitle, active ? styles.stashSuggestionTitleActive : null]}>
                      {describeStashItem(insight.item)}
                    </Text>
                    <Text style={[styles.stashSuggestionReason, active ? styles.stashSuggestionReasonActive : null]}>
                      {insight.reason}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <View style={styles.sizingCard}>
          <Text style={styles.prefillTitle}>Size and fit setup</Text>
          <Text style={styles.prefillCopy}>
            Choose the size or measurements before you start so counters, notes, and chat guidance stay aligned with the version you are actually making.
          </Text>
          {patternSizing.sizesText ? (
            <View style={styles.detectedSizingBox}>
              <Text style={styles.detectedSizingLabel}>Detected from pattern</Text>
              <Text style={styles.detectedSizingText}>{patternSizing.sizesText}</Text>
            </View>
          ) : (
            <View style={styles.detectedSizingBox}>
              <Text style={styles.detectedSizingLabel}>No size table detected</Text>
              <Text style={styles.detectedSizingText}>
                If this pattern is one size, mark it as one size. If it has a sizing table in the PDF, add the chosen size manually.
              </Text>
            </View>
          )}
          <View style={styles.sizingModeRow}>
            {[
              { label: 'Has sizes', value: 'sized' as const },
              { label: 'One size', value: 'one-size' as const },
              { label: 'Decide later', value: 'unknown' as const },
            ].map((option) => {
              const active = sizingMode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setSizingMode(option.value)}
                  style={[styles.sizingModePill, active ? styles.sizingModePillActive : null]}>
                  <Text style={[styles.sizingModeText, active ? styles.sizingModeTextActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {sizingMode === 'sized' ? (
            <>
              {patternSizing.options.length > 0 ? (
                <Pressable onPress={() => setShowSizeSheet(true)} style={styles.selectField}>
                  <Text style={styles.selectLabel}>Pattern size</Text>
                  <Text style={styles.selectValue}>
                    {selectedSize.trim() || 'Choose from pattern sizes'}
                  </Text>
                </Pressable>
              ) : null}
              {patternSizing.options.length === 0 || !patternSizing.options.includes(selectedSize) ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Custom size or pattern size label</Text>
                  <TextInput
                    onChangeText={setSelectedSize}
                    placeholder={`e.g. M, 42 ${measurementUnitShort}, third size`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={selectedSize === '__custom__' ? '' : selectedSize}
                  />
                </View>
              ) : null}
              <View style={styles.twoColumn}>
                <View style={styles.flexInput}>
                  <Text style={styles.fieldLabel}>Bust/chest to fit ({measurementUnitLabel})</Text>
                  <TextInput
                    onChangeText={setFitMeasurement}
                    placeholder={`e.g. 96 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={fitMeasurement}
                  />
                </View>
                <View style={styles.flexInput}>
                  <Text style={styles.fieldLabel}>Finished bust/chest ({measurementUnitLabel})</Text>
                  <TextInput
                    onChangeText={setFinishedMeasurement}
                    placeholder={`e.g. 104 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={finishedMeasurement}
                  />
                </View>
              </View>
              <Text style={styles.fieldHelp}>
                Use the measurements from this pattern’s size table. The to-fit measurement is the body size; the finished measurement is the garment size after ease.
              </Text>
              <View style={styles.quickFillRow}>
                {['Relaxed fit', 'Close fit', 'Positive ease', 'No ease'].map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setEasePreference(option)}
                    style={[
                      styles.quickFillButton,
                      easePreference === option ? styles.quickFillButtonActive : null,
                    ]}>
                    <Text
                      style={[
                        styles.quickFillText,
                        easePreference === option ? styles.quickFillTextActive : null,
                      ]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.twoColumn}>
                <View style={styles.flexInput}>
                  <Text style={styles.fieldLabel}>Body length / to shoulder</Text>
                  <TextInput
                    onChangeText={setLengthChoice}
                    placeholder={`e.g. regular, cropped, 58 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={lengthChoice}
                  />
                </View>
                <View style={styles.flexInput}>
                  <Text style={styles.fieldLabel}>Sleeve seam / sleeve length</Text>
                  <TextInput
                    onChangeText={setSleeveChoice}
                    placeholder={`e.g. long, short, 45 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={sleeveChoice}
                  />
                </View>
              </View>
            </>
          ) : null}
          <TextInput
            multiline
            onChangeText={setSizingNotes}
            placeholder={
              sizingMode === 'one-size'
                ? 'Any one-size fit notes, optional'
                : 'Sizing notes, measurements to double-check, or custom changes'
            }
            placeholderTextColor="#9b867d"
            style={[styles.input, styles.sizingNotesInput]}
            value={sizingNotes}
          />
        </View>
        <TextInput
          multiline
          onChangeText={setNotes}
          placeholder="Notes, customisations, reminders..."
          placeholderTextColor="#9b867d"
          style={[styles.input, styles.notesInput]}
          value={notes}
        />
        <View style={styles.readinessCard}>
          <Text style={styles.prefillTitle}>Ready to create?</Text>
          <View style={styles.readinessList}>
            {creationChecklist.map((item) => (
              <View key={item.label} style={styles.readinessRow}>
                <Text style={[styles.readinessMark, item.complete ? styles.readinessMarkComplete : null]}>
                  {item.complete ? '✓' : '○'}
                </Text>
                <View style={styles.readinessCopyBlock}>
                  <Text style={styles.readinessTitle}>{item.label}</Text>
                  <Text style={styles.readinessCopy}>{item.copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <BrandButton
          label={isSaving ? 'Creating…' : 'Create project'}
          loading={isSaving}
          onPress={() => void handleCreate()}
          style={styles.fullWidth}
        />
      </AppCard>

      <SelectSheet
        visible={showStateSheet}
        title="Project state"
        options={projectStateOptions.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        selectedValue={projectState}
        onClose={() => setShowStateSheet(false)}
        onSelect={(value) => setProjectState(value as ProjectStateValue)}
      />
      <SelectSheet
        visible={showSizeSheet}
        title="Choose pattern size"
        options={patternSizeOptions}
        selectedValue={selectedSize}
        onClose={() => setShowSizeSheet(false)}
        onSelect={(value) => setSelectedSize(value === '__custom__' ? '' : value)}
      />
      <DeadlineSheet
        visible={showDeadlineSheet}
        value={deadlineAt}
        onClose={() => setShowDeadlineSheet(false)}
        onConfirm={(value) => {
          setDeadlineAt(value);
          setShowDeadlineSheet(false);
        }}
      />
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
    gap: tokens.spacing.xl2,
    paddingBottom: tokens.spacing.xxl,
  },
  card: {
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: tokens.type.title,
    lineHeight: 28,
    fontWeight: '800',
  },
  sectionCopy: {
    color: tokens.color.muted,
    fontSize: tokens.type.body,
    lineHeight: 22,
  },
  patternList: {
    gap: tokens.spacing.sm,
  },
  lockedPatternTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
  },
  lockedPatternCopy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  patternOption: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 14,
  },
  patternOptionActive: {
    backgroundColor: '#efe1d3',
    borderColor: tokens.color.accent,
  },
  patternOptionText: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
  patternOptionTextActive: {
    color: tokens.color.primary,
  },
  input: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  selectField: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
  },
  selectLabel: {
    color: tokens.color.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  selectValue: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '700',
  },
  notesInput: {
    minHeight: 132,
    paddingTop: tokens.spacing.md,
    textAlignVertical: 'top',
  },
  errorText: {
    color: tokens.color.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  fullWidth: {
    width: '100%',
  },
  quickFillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  quickFillButton: {
    flexGrow: 1,
    minHeight: 40,
    minWidth: 132,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  quickFillButtonDisabled: {
    opacity: 0.54,
  },
  quickFillButtonActive: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  quickFillText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  quickFillTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  togglePill: {
    flex: 1,
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  togglePillActive: {
    backgroundColor: '#efe1d3',
    borderColor: tokens.color.accent,
  },
  togglePillText: {
    color: tokens.color.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  togglePillTextActive: {
    color: tokens.color.primary,
  },
  prefillCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fcf5ed',
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  prefillTitle: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  prefillCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sizingCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#c5e1df',
    backgroundColor: '#f4fbfb',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  detectedSizingBox: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    gap: 4,
  },
  detectedSizingLabel: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detectedSizingText: {
    color: tokens.color.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  sizingModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  sizingModePill: {
    flexGrow: 1,
    minHeight: 42,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizingModePillActive: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  sizingModeText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  sizingModeTextActive: {
    color: '#fff',
  },
  sizeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  sizeChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  sizeChipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: '#efe1d3',
  },
  sizeChipText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  sizeChipTextActive: {
    color: tokens.color.text,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  flexInput: {
    flex: 1,
  },
  fieldBlock: {
    gap: tokens.spacing.xs,
  },
  fieldLabel: {
    color: tokens.color.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  fieldHelp: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  sizingNotesInput: {
    minHeight: 86,
    paddingTop: tokens.spacing.md,
    textAlignVertical: 'top',
  },
  stashSuggestionList: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  stashSuggestion: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: 4,
  },
  stashSuggestionActive: {
    backgroundColor: '#efe1d3',
    borderColor: tokens.color.accent,
  },
  stashSuggestionTitle: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '800',
  },
  stashSuggestionTitleActive: {
    color: tokens.color.primary,
  },
  stashSuggestionReason: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  stashSuggestionReasonActive: {
    color: tokens.color.primary,
  },
  readinessCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(63, 143, 85, 0.22)',
    backgroundColor: '#f2f8f0',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  readinessList: {
    gap: tokens.spacing.sm,
  },
  readinessRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    alignItems: 'flex-start',
  },
  readinessMark: {
    color: tokens.color.muted,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    width: 22,
  },
  readinessMarkComplete: {
    color: tokens.color.success,
  },
  readinessCopyBlock: {
    flex: 1,
    gap: 2,
  },
  readinessTitle: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '900',
  },
  readinessCopy: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
