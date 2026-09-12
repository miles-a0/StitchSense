import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Image as NativeImage,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { AppCard } from '@/src/components/ui/app-card';
import { AppSection } from '@/src/components/ui/app-section';
import { BrandButton } from '@/src/components/ui/brand-button';
import { DeadlineSheet, formatDeadlineLabel } from '@/src/components/ui/deadline-sheet';
import { FormField } from '@/src/components/ui/form-field';
import { RichMarkdownText } from '@/src/components/ui/rich-markdown-text';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { SelectSheet } from '@/src/components/ui/select-sheet';
import { authenticatedImageSource, projectPhotoFileUrl, stitchSenseAPI } from '@/src/lib/api';
import { destructiveResourceActionPrompt } from '@/src/lib/destructive-actions';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import { describeStashItem, findStashMentionsInText } from '@/src/lib/stash-insights';
import type { StashItem } from '@/src/lib/stash-store';
import type {
  ChatMessage,
  ChatSession,
  Project,
  ProjectCounter,
  ProjectCounterType,
  ProjectPatternMark,
  ProjectPhoto,
  ProjectWorkLogEntry,
} from '@/src/lib/models';
import { useProjects } from '@/src/providers/projects-provider';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { tokens } from '@/src/theme/tokens';

const projectStateOptions = [
  { label: 'Planned', value: 'planned' },
  { label: 'Active', value: 'active' },
  { label: 'Started', value: 'started' },
  { label: 'Paused', value: 'paused' },
  { label: 'Completed', value: 'completed' },
  { label: 'Archived', value: 'archived' },
] as const;

const counterTypeOptions = [
  { label: 'Rows', value: 'rows' },
  { label: 'Rounds', value: 'rounds' },
  { label: 'Repeats', value: 'repeats' },
  { label: 'Sections', value: 'sections' },
  { label: 'Motifs', value: 'motifs' },
  { label: 'Custom', value: 'custom' },
] as const;

const counterPresets: {
  label: string;
  counterType: ProjectCounterType;
  targetValue?: number;
}[] = [
  { label: 'Rows', counterType: 'rows' },
  { label: 'Rounds', counterType: 'rounds' },
  { label: 'Repeat', counterType: 'repeats' },
  { label: 'Section', counterType: 'sections' },
];

const stepByStepGuidePrompt =
  'Please give me a step by step, row by row guide to making this pattern.';

type ProjectStateValue = (typeof projectStateOptions)[number]['value'];

function stateFromProject(project: Project | null): ProjectStateValue {
  if (!project) return 'started';
  if (project.status === 'active' && project.stageLabel?.trim().toLowerCase() === 'started') {
    return 'started';
  }

  switch (project.status) {
    case 'planned':
    case 'active':
    case 'paused':
    case 'completed':
    case 'archived':
      return project.status;
    default:
      return 'started';
  }
}

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
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    default:
      return 'Getting started';
  }
}

function backendStatusForState(state: ProjectStateValue) {
  switch (state) {
    case 'planned':
    case 'paused':
    case 'completed':
    case 'archived':
      return state;
    case 'active':
    case 'started':
    default:
      return 'active';
  }
}

function counterProgress(counter: ProjectCounter) {
  if (!counter.targetValue || counter.targetValue <= 0) return null;
  const percent = Math.round((counter.currentValue / counter.targetValue) * 100);
  return Math.max(0, Math.min(100, percent));
}

function isCounterComplete(counter: ProjectCounter) {
  return Boolean(
    counter.targetValue &&
      counter.targetValue > 0 &&
      counter.currentValue >= counter.targetValue,
  );
}

function workLogMeta(entry: ProjectWorkLogEntry) {
  const parts: string[] = [];
  if (entry.progressPercent !== null && entry.progressPercent !== undefined) {
    parts.push(`${entry.progressPercent}% progress`);
  }
  if (entry.minutesSpent) {
    parts.push(`${entry.minutesSpent} min`);
  }
  return parts.join(' · ');
}

function stashQuantityNumber(item: StashItem) {
  if (!item.quantity) return null;
  const parsed = Number(item.quantity);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectStashUseAmount(item: StashItem) {
  const quantity = stashQuantityNumber(item);
  if (quantity === null || quantity <= 0) return null;
  const unit = item.unit?.trim().toLowerCase() ?? '';
  if (unit === 'g' || unit === 'gram' || unit === 'grams') {
    if (quantity >= 50) return 25;
    if (quantity >= 20) return 10;
    return 5;
  }
  if (unit.includes('skein') || unit.includes('ball') || unit.includes('hank')) {
    return 1;
  }
  return 1;
}

function deadlineState(deadlineAt?: string | null) {
  if (!deadlineAt) return null;
  const diff = new Date(deadlineAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return { tone: 'danger' as const, label: 'Overdue', copy: 'This project is past its deadline.' };
  if (days <= 3) return { tone: 'warning' as const, label: 'Due soon', copy: 'This deadline is close enough to keep in view.' };
  return null;
}

function projectSizingSummary(notes?: string | null) {
  if (!notes?.trim()) {
    return null;
  }

  const match = notes.match(/Sizing and fit choices:\s*([\s\S]*?)(?:\n\n|$)/i);
  if (!match?.[1]?.trim()) {
    return null;
  }

  const lines = match[1]
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const oneSize = lines.some((line) => /one size|no size selection/i.test(line));
  const chosenSize =
    lines.find((line) => /^chosen size:/i.test(line))?.replace(/^chosen size:\s*/i, '') ?? null;
  const valueFor = (label: string) =>
    lines.find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`))?.replace(new RegExp(`^${label}:\\s*`, 'i'), '') ?? '';

  return {
    oneSize,
    chosenSize,
    fitMeasurement: valueFor('Body / to-fit measurement'),
    finishedMeasurement: valueFor('Finished garment measurement'),
    easePreference: valueFor('Intended ease / fit'),
    lengthChoice: valueFor('Length option'),
    sleeveChoice: valueFor('Sleeve option'),
    notes: valueFor('Notes'),
    summary: chosenSize
      ? `Making size ${chosenSize}.`
      : oneSize
        ? 'Pattern marked as one size.'
        : lines.slice(0, 2).join(' · '),
    details: lines,
  };
}

function composeSizingBlock({
  mode,
  selectedSize,
  fitMeasurement,
  finishedMeasurement,
  easePreference,
  lengthChoice,
  sleeveChoice,
  notes,
}: {
  mode: 'sized' | 'one-size';
  selectedSize: string;
  fitMeasurement: string;
  finishedMeasurement: string;
  easePreference: string;
  lengthChoice: string;
  sleeveChoice: string;
  notes: string;
}) {
  if (mode === 'one-size') {
    return [
      'Sizing and fit choices:',
      '- Pattern treated as one size / no size selection needed.',
      notes.trim() ? `- Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'Sizing and fit choices:',
    selectedSize.trim() ? `- Chosen size: ${selectedSize.trim()}` : '- Chosen size:',
    fitMeasurement.trim() ? `- Body / to-fit measurement: ${fitMeasurement.trim()}` : '- Body / to-fit measurement:',
    finishedMeasurement.trim()
      ? `- Finished garment measurement: ${finishedMeasurement.trim()}`
      : '- Finished garment measurement:',
    easePreference.trim() ? `- Intended ease / fit: ${easePreference.trim()}` : '- Intended ease / fit:',
    lengthChoice.trim() ? `- Length option: ${lengthChoice.trim()}` : '- Length option:',
    sleeveChoice.trim() ? `- Sleeve option: ${sleeveChoice.trim()}` : '- Sleeve option:',
    notes.trim() ? `- Notes: ${notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function replaceSizingBlock(notes: string, block: string) {
  const trimmed = notes.trim();
  if (/Sizing and fit choices:/i.test(trimmed)) {
    return trimmed.replace(/Sizing and fit choices:\s*[\s\S]*?(?=\n\n|$)/i, block);
  }
  return [trimmed || null, block].filter(Boolean).join('\n\n');
}

function projectIdleDays(dateString?: string | null) {
  if (!dateString) return null;
  const diff = Date.now() - new Date(dateString).getTime();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function friendlyProjectStatusMessage(message: string | null) {
  if (!message) return null;

  if (/route .*\/counters not found/i.test(message)) {
    return 'Counters are still syncing with the platform. Pull to refresh and try again in a moment.';
  }

  if (/route .*\/work-log not found/i.test(message)) {
    return 'Work log history is still syncing with the platform. Pull to refresh and try again in a moment.';
  }

  if (/patternid/i.test(message)) {
    return 'The project saved, but the linked pattern needs a quick refresh before everything settles.';
  }

  return message;
}

function projectErrorMessage(error: unknown, fallback: string) {
  return friendlyProjectStatusMessage(
    getUserFacingErrorMessage(error, { fallback }),
  );
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useSession();
  const { projects, upsertProject, removeProject, refreshProjects } = useProjects();
  const { settings } = usePreferences();
  const { items: stashItems, updateItem: updateStashItem } = useStash();
  const scrollRef = useRef<ScrollView | null>(null);

  const existingProject = useMemo(
    () => projects.find((item) => item.id === id) ?? null,
    [id, projects],
  );

  const [project, setProject] = useState<Project | null>(existingProject);
  const [counters, setCounters] = useState<ProjectCounter[]>([]);
  const [workLogEntries, setWorkLogEntries] = useState<ProjectWorkLogEntry[]>([]);
  const [projectPhotos, setProjectPhotos] = useState<ProjectPhoto[]>([]);
  const [projectMarks, setProjectMarks] = useState<ProjectPatternMark[]>([]);
  const [draftTitle, setDraftTitle] = useState(existingProject?.title ?? '');
  const [draftProgress, setDraftProgress] = useState(String(existingProject?.progressPercent ?? 0));
  const [draftRecipient, setDraftRecipient] = useState(existingProject?.recipient ?? '');
  const [draftOccasion, setDraftOccasion] = useState(existingProject?.occasion ?? '');
  const [draftIsGift, setDraftIsGift] = useState(existingProject?.isGift ?? false);
  const [draftNotes, setDraftNotes] = useState(existingProject?.notes ?? '');
  const [draftYarnDetails, setDraftYarnDetails] = useState(existingProject?.yarnDetails ?? '');
  const [draftNeedleHookDetails, setDraftNeedleHookDetails] = useState(
    existingProject?.needleHookDetails ?? '',
  );
  const [draftDeadlineAt, setDraftDeadlineAt] = useState<string | null>(
    existingProject?.deadlineAt ?? null,
  );
  const [projectState, setProjectState] = useState<ProjectStateValue>(
    stateFromProject(existingProject),
  );
  const [newCounterLabel, setNewCounterLabel] = useState('');
  const [newCounterTarget, setNewCounterTarget] = useState('');
  const [newCounterType, setNewCounterType] = useState<ProjectCounterType>('rows');
  const [newLogTitle, setNewLogTitle] = useState('');
  const [newLogBody, setNewLogBody] = useState('');
  const [newLogMinutes, setNewLogMinutes] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showStateSheet, setShowStateSheet] = useState(false);
  const [showDeadlineSheet, setShowDeadlineSheet] = useState(false);
  const [showCounterTypeSheet, setShowCounterTypeSheet] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ProjectPhoto | null>(null);
  const [resumePage, setResumePage] = useState('');
  const [resumeLocation, setResumeLocation] = useState('');
  const [resumeNote, setResumeNote] = useState('');
  const [bookmarkLabel, setBookmarkLabel] = useState('');
  const [bookmarkPage, setBookmarkPage] = useState('');
  const [bookmarkLocation, setBookmarkLocation] = useState('');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [counterSectionY, setCounterSectionY] = useState(0);
  const [showMakingAssistant, setShowMakingAssistant] = useState(false);
  const [showPatternPdfOverlay, setShowPatternPdfOverlay] = useState(false);
  const [patternPdfUrl, setPatternPdfUrl] = useState<string | null>(null);
  const [isOpeningPatternOverlay, setIsOpeningPatternOverlay] = useState(false);
  const [patternOverlayStatus, setPatternOverlayStatus] = useState<string | null>(null);
  const [makingChatDraft, setMakingChatDraft] = useState(stepByStepGuidePrompt);
  const [makingChatMessages, setMakingChatMessages] = useState<ChatMessage[]>([]);
  const [makingChatSession, setMakingChatSession] = useState<ChatSession | null>(null);
  const [isMakingChatSending, setIsMakingChatSending] = useState(false);
  const [makingChatStatus, setMakingChatStatus] = useState<string | null>(null);
  const initialSizingSummary = projectSizingSummary(existingProject?.notes);
  const [draftSizingMode, setDraftSizingMode] = useState<'sized' | 'one-size'>(
    initialSizingSummary?.oneSize ? 'one-size' : 'sized',
  );
  const [draftSelectedSize, setDraftSelectedSize] = useState(initialSizingSummary?.chosenSize ?? '');
  const [draftFitMeasurement, setDraftFitMeasurement] = useState(initialSizingSummary?.fitMeasurement ?? '');
  const [draftFinishedMeasurement, setDraftFinishedMeasurement] = useState(initialSizingSummary?.finishedMeasurement ?? '');
  const [draftEasePreference, setDraftEasePreference] = useState(initialSizingSummary?.easePreference ?? '');
  const [draftLengthChoice, setDraftLengthChoice] = useState(initialSizingSummary?.lengthChoice ?? '');
  const [draftSleeveChoice, setDraftSleeveChoice] = useState(initialSizingSummary?.sleeveChoice ?? '');
  const [draftSizingNotes, setDraftSizingNotes] = useState(initialSizingSummary?.notes ?? '');

  const loadProject = useCallback(async () => {
    if (!id || !accessToken) return;
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      const nextProject = await stitchSenseAPI.project(id, accessToken);
      setProject(nextProject);
      setDraftTitle(nextProject.title);
      setDraftProgress(String(nextProject.progressPercent));
      setDraftRecipient(nextProject.recipient ?? '');
      setDraftOccasion(nextProject.occasion ?? '');
      setDraftIsGift(nextProject.isGift ?? false);
      setDraftNotes(nextProject.notes ?? '');
      setDraftYarnDetails(nextProject.yarnDetails ?? '');
      setDraftNeedleHookDetails(nextProject.needleHookDetails ?? '');
      setDraftDeadlineAt(nextProject.deadlineAt ?? null);
      setProjectState(stateFromProject(nextProject));
      const nextSizing = projectSizingSummary(nextProject.notes);
      setDraftSizingMode(nextSizing?.oneSize ? 'one-size' : 'sized');
      setDraftSelectedSize(nextSizing?.chosenSize ?? '');
      setDraftFitMeasurement(nextSizing?.fitMeasurement ?? '');
      setDraftFinishedMeasurement(nextSizing?.finishedMeasurement ?? '');
      setDraftEasePreference(nextSizing?.easePreference ?? '');
      setDraftLengthChoice(nextSizing?.lengthChoice ?? '');
      setDraftSleeveChoice(nextSizing?.sleeveChoice ?? '');
      setDraftSizingNotes(nextSizing?.notes ?? '');
      upsertProject(nextProject);

      const [nextMarksResult, nextCountersResult, nextWorkLogResult, nextPhotosResult] = await Promise.allSettled([
        stitchSenseAPI.projectMarks(id, accessToken),
        stitchSenseAPI.projectCounters(id, accessToken),
        stitchSenseAPI.projectWorkLog(id, accessToken),
        stitchSenseAPI.projectPhotos(id, accessToken),
      ]);

      if (nextMarksResult.status === 'fulfilled') {
        setProjectMarks(nextMarksResult.value);
        const resumeMark =
          nextMarksResult.value.find((mark) => mark.type === 'resume') ?? null;
        setResumePage(resumeMark?.pageNumber ? String(resumeMark.pageNumber) : '');
        setResumeLocation(resumeMark?.locationLabel ?? '');
        setResumeNote(resumeMark?.note ?? '');
      }

      if (nextCountersResult.status === 'fulfilled') {
        setCounters(nextCountersResult.value);
      }

      if (nextWorkLogResult.status === 'fulfilled') {
        setWorkLogEntries(nextWorkLogResult.value);
      }
      const warnings: string[] = [];
      if (nextMarksResult.status === 'rejected') {
        warnings.push(
          nextMarksResult.reason instanceof Error
            ? nextMarksResult.reason.message
            : 'Reading position could not be loaded.',
        );
      }
      if (nextCountersResult.status === 'rejected') {
        warnings.push(
          nextCountersResult.reason instanceof Error
            ? nextCountersResult.reason.message
            : 'Counters could not be loaded.',
        );
      }
      if (nextWorkLogResult.status === 'rejected') {
        warnings.push(
          nextWorkLogResult.reason instanceof Error
            ? nextWorkLogResult.reason.message
            : 'Work log could not be loaded.',
        );
      }
      if (nextPhotosResult && nextPhotosResult.status === 'fulfilled') {
        setProjectPhotos(nextPhotosResult.value);
      }
      if (nextPhotosResult && nextPhotosResult.status === 'rejected') {
        warnings.push(
          nextPhotosResult.reason instanceof Error
            ? nextPhotosResult.reason.message
            : 'Project photos could not be loaded.',
        );
      }
      if (warnings.length > 0) {
        setStatusMessage(friendlyProjectStatusMessage(warnings.join(' ')));
      }
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not load the project.'),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken, id, upsertProject]);

  useFocusEffect(
    useCallback(() => {
      void loadProject();
    }, [loadProject]),
  );

  async function handleSave() {
    if (!project || !accessToken) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const hasSizingDraft =
        draftSizingMode === 'one-size' ||
        Boolean(
          draftSelectedSize.trim() ||
            draftFitMeasurement.trim() ||
            draftFinishedMeasurement.trim() ||
            draftEasePreference.trim() ||
            draftLengthChoice.trim() ||
            draftSleeveChoice.trim() ||
            draftSizingNotes.trim(),
        );
      const notesToSave = hasSizingDraft
        ? replaceSizingBlock(
            draftNotes,
            composeSizingBlock({
              mode: draftSizingMode,
              selectedSize: draftSelectedSize,
              fitMeasurement: draftFitMeasurement,
              finishedMeasurement: draftFinishedMeasurement,
              easePreference: draftEasePreference,
              lengthChoice: draftLengthChoice,
              sleeveChoice: draftSleeveChoice,
              notes: draftSizingNotes,
            }),
          )
        : draftNotes;
      const updated = await stitchSenseAPI.updateProject(project.id, accessToken, {
        title: draftTitle.trim() || project.title,
        stageLabel: stageLabelForState(projectState),
        progressPercent: Math.min(100, Math.max(0, Number(draftProgress) || 0)),
        recipient: draftRecipient.trim() || null,
        occasion: draftOccasion.trim() || null,
        isGift: draftIsGift,
        notes: notesToSave.trim() || null,
        yarnDetails: draftYarnDetails.trim() || null,
        needleHookDetails: draftNeedleHookDetails.trim() || null,
        deadlineAt: draftDeadlineAt,
        isFavorite: project.isFavorite,
        status: backendStatusForState(projectState),
      });
      setProject(updated);
      setDraftNotes(updated.notes ?? '');
      upsertProject(updated);
      await refreshProjects();
      setStatusMessage('Project saved.');
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not save the project.'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleFavorite() {
    if (!project || !accessToken) return;
    setStatusMessage(null);
    try {
      const updated = await stitchSenseAPI.updateProject(project.id, accessToken, {
        isFavorite: !project.isFavorite,
      });
      setProject(updated);
      upsertProject(updated);
      await refreshProjects();
      setStatusMessage(updated.isFavorite ? 'Project pinned.' : 'Project unpinned.');
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not update the project.'),
      );
    }
  }

  async function handleAddCounter() {
    if (!project || !accessToken || !newCounterLabel.trim()) return;
    setStatusMessage(null);
    try {
      const expectedLabel = newCounterLabel.trim();
      const counter = await stitchSenseAPI.createProjectCounter(project.id, accessToken, {
        label: expectedLabel,
        counterType: newCounterType,
        targetValue: newCounterTarget.trim() ? Number(newCounterTarget) : null,
        currentValue: 0,
        stepValue: 1,
        sortOrder: counters.length,
      });

      let resolvedCounter = counter;
      if (!resolvedCounter?.id) {
        const latestCounters = await stitchSenseAPI.projectCounters(project.id, accessToken);
        const recoveredCounter =
          latestCounters.find(
            (item) => item.label.trim().toLowerCase() === expectedLabel.toLowerCase(),
          ) ?? null;
        if (recoveredCounter) {
          resolvedCounter = recoveredCounter;
        }
      }

      setCounters((current) =>
        [...current.filter((item) => item.id !== resolvedCounter.id), resolvedCounter].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      );
      setNewCounterLabel('');
      setNewCounterTarget('');
      setNewCounterType('rows');
      setStatusMessage('Counter added.');
      try {
        await loadProject();
      } catch {
        // Keep local counter state if refresh fails.
      }
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not add the counter.'),
      );
    }
  }

  async function handleAddPresetCounter(preset: (typeof counterPresets)[number]) {
    if (!project || !accessToken) return;
    if (
      counters.some(
        (counter) => counter.label.trim().toLowerCase() === preset.label.toLowerCase(),
      )
    ) {
      setStatusMessage(`${preset.label} counter already exists.`);
      return;
    }

    try {
      const counter = await stitchSenseAPI.createProjectCounter(project.id, accessToken, {
        label: preset.label,
        counterType: preset.counterType,
        targetValue: preset.targetValue ?? null,
        currentValue: 0,
        stepValue: 1,
        sortOrder: counters.length,
      });

      let resolvedCounter = counter;
      if (!resolvedCounter?.id) {
        const latestCounters = await stitchSenseAPI.projectCounters(project.id, accessToken);
        const recoveredCounter =
          latestCounters.find(
            (item) => item.label.trim().toLowerCase() === preset.label.toLowerCase(),
          ) ?? null;
        if (recoveredCounter) {
          resolvedCounter = recoveredCounter;
        }
      }

      setCounters((current) =>
        [...current.filter((item) => item.id !== resolvedCounter.id), resolvedCounter].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      );
      setStatusMessage(`${preset.label} counter added.`);
      try {
        await loadProject();
      } catch {
        // Keep local counter state if refresh fails.
      }
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not add the preset counter.'),
      );
    }
  }

  async function handleAdjustCounter(counter: ProjectCounter, direction: 'up' | 'down') {
    if (!project || !accessToken) return;
    if (isCounterComplete(counter)) {
      setStatusMessage(`${counter.label} is already complete.`);
      return;
    }

    const maxValue =
      counter.targetValue && counter.targetValue > 0 ? counter.targetValue : Number.MAX_SAFE_INTEGER;
    const nextValue =
      direction === 'up'
        ? Math.min(maxValue, counter.currentValue + counter.stepValue)
        : Math.max(0, counter.currentValue - counter.stepValue);

    try {
      const updatedCounter = await stitchSenseAPI.updateProjectCounter(
        project.id,
        counter.id,
        accessToken,
        {
          currentValue: nextValue,
        },
      );
      setCounters((current) =>
        current.map((item) => (item.id === updatedCounter.id ? updatedCounter : item)),
      );
      if (direction === 'up' && isCounterComplete(updatedCounter)) {
        setStatusMessage(`${counter.label} completed.`);
        Alert.alert(
          'Counter completed',
          `${updatedCounter.label} reached its target and is now locked. You can still delete it if you no longer need it.`,
        );
      } else {
        setStatusMessage(`${counter.label} updated.`);
      }
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not update the counter.'),
      );
    }
  }

  function handleDeleteCounter(counter: ProjectCounter) {
    if (!project || !accessToken) return;
    Alert.alert('Delete counter?', `Remove "${counter.label}" from this project?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await stitchSenseAPI.deleteProjectCounter(project.id, counter.id, accessToken);
            setCounters((current) => current.filter((item) => item.id !== counter.id));
            setStatusMessage('Counter deleted.');
          } catch (error) {
            setStatusMessage(
              projectErrorMessage(error, 'Could not delete the counter.'),
            );
          }
        },
      },
    ]);
  }

  async function handleAddWorkLogEntry() {
    if (!project || !accessToken) return;
    if (!newLogTitle.trim() && !newLogBody.trim()) {
      setStatusMessage('Add a short title or note before saving the work log entry.');
      return;
    }

    try {
      const expectedTitle = newLogTitle.trim() || 'Project session';
      const expectedBody = newLogBody.trim() || null;
      const entry = await stitchSenseAPI.createProjectWorkLogEntry(project.id, accessToken, {
        entryType: 'session',
        title: expectedTitle,
        body: expectedBody,
        minutesSpent: newLogMinutes.trim() ? Number(newLogMinutes) : null,
        progressPercent: Math.min(100, Math.max(0, Number(draftProgress) || 0)),
      });

      let resolvedEntry = entry;
      if (!resolvedEntry?.id) {
        const latestEntries = await stitchSenseAPI.projectWorkLog(project.id, accessToken);
        const recoveredEntry =
          latestEntries.find(
            (item) =>
              item.title.trim().toLowerCase() === expectedTitle.toLowerCase() &&
              (item.body?.trim() || null) === expectedBody,
          ) ??
          latestEntries.find(
            (item) => item.title.trim().toLowerCase() === expectedTitle.toLowerCase(),
          ) ??
          null;
        if (recoveredEntry) {
          resolvedEntry = recoveredEntry;
        }
      }

      setWorkLogEntries((current) => [
        resolvedEntry,
        ...current.filter((item) => item.id !== resolvedEntry.id),
      ]);
      setNewLogTitle('');
      setNewLogBody('');
      setNewLogMinutes('');
      setStatusMessage('Work log saved.');
      try {
        await loadProject();
      } catch {
        // Keep local work log state if refresh fails.
      }
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not save the work log.'),
      );
    }
  }

  function handleDeleteWorkLogEntry(entry: ProjectWorkLogEntry) {
    if (!project || !accessToken) return;
    Alert.alert('Delete work log entry?', `Remove "${entry.title}" from this project history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await stitchSenseAPI.deleteProjectWorkLogEntry(project.id, entry.id, accessToken);
            setWorkLogEntries((current) => current.filter((item) => item.id !== entry.id));
            setStatusMessage('Work log entry deleted.');
          } catch (error) {
            setStatusMessage(
              projectErrorMessage(error, 'Could not delete the work log entry.'),
            );
          }
        },
      },
    ]);
  }

  async function handlePickProjectPhoto(mode: 'library' | 'camera') {
    if (!project || !accessToken) return;

    const permission =
      mode === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission required',
        mode === 'camera'
          ? 'Camera permission is required to add progress photos.'
          : 'Photo library permission is required to add progress photos.',
      );
      return;
    }

    const result =
      mode === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    setIsUploadingPhoto(true);
    setStatusMessage(null);

    try {
      const uploaded = await stitchSenseAPI.uploadProjectPhoto(project.id, accessToken, {
        uri: asset.uri,
        name: asset.fileName ?? `${project.id}-progress.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        takenAt: new Date().toISOString(),
      });
      setProjectPhotos((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
      await loadProject();
      setStatusMessage('Progress photo added.');
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not add that project photo.'),
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function handleDeleteProjectPhoto(photo: ProjectPhoto) {
    if (!project || !accessToken) return;
    Alert.alert('Delete photo?', 'Remove this progress photo from the project timeline?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await stitchSenseAPI.deleteProjectPhoto(project.id, photo.id, accessToken);
            setProjectPhotos((current) => current.filter((item) => item.id !== photo.id));
            await loadProject();
            setStatusMessage('Progress photo deleted.');
          } catch (error) {
            setStatusMessage(
              projectErrorMessage(error, 'Could not delete that project photo.'),
            );
          }
        },
      },
    ]);
  }

  async function handleSaveResumeMark() {
    if (!project || !accessToken) return;
    const pageNumber = resumePage.trim() ? Number(resumePage) : null;
    if (resumePage.trim() && (!Number.isFinite(pageNumber) || Number(pageNumber) <= 0)) {
      setStatusMessage('Use a valid page number for the reading position.');
      return;
    }

    try {
      const savedMark = await stitchSenseAPI.createProjectMark(project.id, accessToken, {
        type: 'resume',
        pageNumber,
        locationLabel: resumeLocation.trim() || null,
        note: resumeNote.trim() || null,
      });
      setProjectMarks((current) => {
        const next = [savedMark, ...current.filter((item) => !(item.type === 'resume' || item.id === savedMark.id))];
        return next.sort((left, right) => left.sortOrder - right.sortOrder);
      });
      setStatusMessage('Reading position saved.');
      await loadProject();
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not save the reading position.'),
      );
    }
  }

  async function handleAddBookmark() {
    if (!project || !accessToken) return;
    if (!bookmarkLabel.trim() && !bookmarkPage.trim() && !bookmarkLocation.trim() && !bookmarkNote.trim()) {
      setStatusMessage('Add at least a label, page, section, or note before saving a bookmark.');
      return;
    }

    const pageNumber = bookmarkPage.trim() ? Number(bookmarkPage) : null;
    if (bookmarkPage.trim() && (!Number.isFinite(pageNumber) || Number(pageNumber) <= 0)) {
      setStatusMessage('Use a valid page number for the bookmark.');
      return;
    }

    try {
      const savedMark = await stitchSenseAPI.createProjectMark(project.id, accessToken, {
        type: bookmarkNote.trim() && !bookmarkLabel.trim() ? 'annotation' : 'bookmark',
        label: bookmarkLabel.trim() || undefined,
        pageNumber,
        locationLabel: bookmarkLocation.trim() || null,
        note: bookmarkNote.trim() || null,
        sortOrder: projectMarks.filter((item) => item.type !== 'resume').length,
      });
      setProjectMarks((current) =>
        [...current.filter((item) => item.id !== savedMark.id), savedMark].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      );
      setBookmarkLabel('');
      setBookmarkPage('');
      setBookmarkLocation('');
      setBookmarkNote('');
      setStatusMessage(savedMark.type === 'annotation' ? 'Pattern note saved.' : 'Bookmark saved.');
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not save that bookmark.'),
      );
    }
  }

  function handleDeleteMark(mark: ProjectPatternMark) {
    if (!project || !accessToken) return;
    Alert.alert(
      mark.type === 'resume' ? 'Clear reading position?' : 'Delete bookmark?',
      mark.type === 'resume'
        ? 'Remove the saved reading position from this project?'
        : `Remove "${mark.label}" from this project?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await stitchSenseAPI.deleteProjectMark(project.id, mark.id, accessToken);
              setProjectMarks((current) => current.filter((item) => item.id !== mark.id));
              if (mark.type === 'resume') {
                setResumePage('');
                setResumeLocation('');
                setResumeNote('');
              }
              setStatusMessage(mark.type === 'resume' ? 'Reading position cleared.' : 'Bookmark deleted.');
            } catch (error) {
              setStatusMessage(
                projectErrorMessage(error, 'Could not delete that bookmark.'),
              );
            }
          },
        },
      ],
    );
  }

  function handleDelete() {
    if (!project || !accessToken) return;
    const prompt = destructiveResourceActionPrompt('delete_project', project.title);
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: prompt.confirmLabel,
        style: 'destructive',
        onPress: async () => {
          try {
            await stitchSenseAPI.deleteProject(project.id, accessToken);
            removeProject(project.id);
            router.replace('/(tabs)/workspace');
          } catch (error) {
            setStatusMessage(
              projectErrorMessage(error, 'Could not delete the project.'),
            );
          }
        },
      },
    ]);
  }

  async function completeProject() {
    if (!project || !accessToken) return;
    setStatusMessage(null);
    try {
      const completed = await stitchSenseAPI.updateProject(project.id, accessToken, {
        status: 'completed',
        stageLabel: 'Completed',
        progressPercent: 100,
        progressValue: 100,
        lastWorkedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      setProject(completed);
      setProjectState('completed');
      setDraftProgress('100');
      upsertProject(completed);
      await refreshProjects();
      setStatusMessage('Project marked complete. Lovely work.');
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not mark this project complete.'),
      );
    }
  }

  function handleCompleteProject() {
    if (!project || !accessToken) return;
    Alert.alert(
      'Mark project complete?',
      'This sets progress to 100% and moves the project into completed makes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', onPress: () => void completeProject() },
      ],
    );
  }

  async function handleReopenProject() {
    if (!project || !accessToken) return;
    setStatusMessage(null);
    try {
      const reopened = await stitchSenseAPI.updateProject(project.id, accessToken, {
        status: 'active',
        stageLabel: 'Active',
        completedAt: null,
      });
      setProject(reopened);
      setProjectState('active');
      setDraftProgress(String(reopened.progressPercent));
      upsertProject(reopened);
      await refreshProjects();
      setStatusMessage('Project reopened.');
    } catch (error) {
      setStatusMessage(
        projectErrorMessage(error, 'Could not reopen this project.'),
      );
    }
  }

  if (!project) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyTitle}>Project not found</Text>
        <Text style={styles.emptyCopy}>
          This project may have been deleted or not synced yet.
        </Text>
      </View>
    );
  }

  const activeProject = project;
  const linkedPatternId = activeProject.patternId || activeProject.linkedPattern?.id || null;
  const deadlineStatus = deadlineState(draftDeadlineAt ?? activeProject.deadlineAt ?? null);
  const resumeMark = projectMarks.find((mark) => mark.type === 'resume') ?? null;
  const savedBookmarks = projectMarks.filter((mark) => mark.type !== 'resume');
  const resolvedPhotoUri = (photo: ProjectPhoto | null) => {
    if (!photo) return null;
    if (accessToken && photo.projectId && photo.id) {
      return projectPhotoFileUrl(photo.projectId, photo.id);
    }
    return photo.photoUrl || null;
  };
  const projectMaterialText = [
    activeProject.title,
    activeProject.linkedPattern?.title,
    draftYarnDetails,
    draftNeedleHookDetails,
    draftNotes,
  ]
    .filter(Boolean)
    .join(' ');
  const stashMatches = findStashMentionsInText(projectMaterialText, stashItems, 5);
  const reservedStashItems = stashItems.filter((item) => item.reservedFor === activeProject.title);
  const sizingSummary = projectSizingSummary(draftNotes);
  const draftSizingReady =
    draftSizingMode === 'one-size' ||
    Boolean(
      draftSelectedSize.trim() ||
        draftFitMeasurement.trim() ||
        draftFinishedMeasurement.trim() ||
        draftSizingNotes.trim(),
    );
  const draftSizingSummary =
    draftSizingMode === 'one-size'
      ? 'Pattern marked as one size.'
      : draftSelectedSize.trim()
        ? `Making size ${draftSelectedSize.trim()}.`
        : sizingSummary?.summary ?? 'Choose size or key measurements before starting.';
  const measurementUnitLabel = settings.measurementUnit === 'imperial' ? 'inches' : 'cm';
  const measurementUnitShort = settings.measurementUnit === 'imperial' ? 'in' : 'cm';
  const currentSizingContext = draftSizingReady
    ? [
        draftSizingMode === 'one-size' ? 'Pattern marked as one size.' : null,
        draftSelectedSize ? `Chosen size: ${draftSelectedSize}.` : null,
        draftFitMeasurement ? `To-fit measurement: ${draftFitMeasurement}.` : null,
        draftFinishedMeasurement ? `Finished measurement: ${draftFinishedMeasurement}.` : null,
        draftEasePreference ? `Ease / fit: ${draftEasePreference}.` : null,
        draftLengthChoice ? `Length option: ${draftLengthChoice}.` : null,
        draftSleeveChoice ? `Sleeve option: ${draftSleeveChoice}.` : null,
        draftSizingNotes ? `Sizing notes: ${draftSizingNotes}.` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : sizingSummary
      ? sizingSummary.details.join('; ')
      : null;
  const nextAction =
    counters.length === 0
      ? 'Add a row, round, or repeat counter for the part you are working on now.'
      : !resumeMark
        ? 'Save your reading position before the next making session.'
        : workLogEntries.length === 0
          ? 'Add a first work log entry so future-you knows what happened today.'
          : activeProject.progressPercent >= 95
            ? 'Nearly there. Add final notes, photos, and mark the project complete when ready.'
            : 'Continue from your saved position and update a counter after the next section.';
  const idleDays = projectIdleDays(activeProject.lastWorkedAt ?? activeProject.updatedAt ?? activeProject.createdAt);
  const needsRestartPrompt =
    activeProject.status === 'paused' ||
    (activeProject.status === 'active' && idleDays !== null && idleDays >= 7);
  const setupTasks = [
    {
      key: 'materials',
      title: 'Materials linked',
      copy: reservedStashItems.length
        ? `${reservedStashItems.length} stash item${reservedStashItems.length === 1 ? '' : 's'} reserved.`
        : stashMatches.length
          ? 'Stash matches found and ready to reserve.'
          : 'Add yarn, hooks, needles, or notes when you know what you are using.',
      complete: reservedStashItems.length > 0,
      actionLabel: stashMatches.length ? 'Reserve first match' : null,
      action: stashMatches.length
        ? () => void reserveStashForProject(stashMatches[0].item)
        : null,
    },
    {
      key: 'sizing',
      title: 'Size and fit checked',
      copy: draftSizingReady
        ? draftSizingSummary
        : 'Choose size, fit measurements, sleeve or length options before you rely on row and stitch counts.',
      complete: draftSizingReady,
      actionLabel: 'Draft sizing note',
      action: () => {
        setDraftSizingMode('sized');
        setDraftSizingNotes((current) => current || 'Check the pattern size table before relying on row and stitch counts.');
        setStatusMessage('Sizing fields are ready below. Fill them in and save size choices.');
      },
    },
    {
      key: 'counter',
      title: 'Making counter',
      copy: counters.length
        ? `${counters.length} counter${counters.length === 1 ? '' : 's'} ready.`
        : 'Add a row, round, repeat, or section counter before the first session.',
      complete: counters.length > 0,
      actionLabel: 'Add rows counter',
      action: () => void handleAddPresetCounter(counterPresets[0]),
    },
    {
      key: 'position',
      title: 'Reading position',
      copy: resumeMark
        ? resumeMark.locationLabel || resumeMark.note || 'Resume point saved.'
        : 'Save the page or section where you will begin.',
      complete: Boolean(resumeMark),
      actionLabel: 'Draft start point',
      action: () => {
        setResumePage((current) => current || '1');
        setResumeLocation((current) => current || 'Start');
        setResumeNote((current) => current || 'Ready to begin here.');
        setStatusMessage('Start point drafted. Save the reading position when it looks right.');
      },
    },
    {
      key: 'log',
      title: 'First work note',
      copy: workLogEntries.length
        ? `${workLogEntries.length} work log entr${workLogEntries.length === 1 ? 'y' : 'ies'} saved.`
        : 'Add a short note after the first making session.',
      complete: workLogEntries.length > 0,
      actionLabel: 'Draft first note',
      action: () => {
        setNewLogTitle((current) => current || 'First making session');
        setNewLogBody((current) => current || 'Started the project, checked materials, and set up the next step.');
        setStatusMessage('First work note drafted. Save it in the Work log section when ready.');
      },
    },
  ];
  const setupCompleteCount = setupTasks.filter((task) => task.complete).length;
  const sessionChecklist = [
    reservedStashItems.length
      ? `Gather ${reservedStashItems.slice(0, 2).map((item) => item.name).join(', ')}.`
      : 'Confirm yarn, hook, needles, and notions before starting.',
    draftSizingReady
      ? `Confirm ${draftSizingSummary.toLowerCase()}`
      : 'Choose the size, fit measurement, or one-size setting before counting rows.',
    resumeMark
      ? `Open ${resumeMark.pageNumber ? `page ${resumeMark.pageNumber}` : 'your saved position'}${resumeMark.locationLabel ? `, ${resumeMark.locationLabel}` : ''}.`
      : 'Save a reading position once you know where you are starting.',
    counters[0]
      ? `Update ${counters[0].label} as you work.`
      : 'Add a row, round, or repeat counter if this session needs tracking.',
  ];
  const totalMinutesLogged = workLogEntries.reduce(
    (total, entry) => total + (entry.minutesSpent ?? 0),
    0,
  );
  const completedCounterCount = counters.filter(isCounterComplete).length;
  const nextCounter = counters.find((counter) => !isCounterComplete(counter)) ?? counters[0] ?? null;
  const latestWorkLog = workLogEntries[0] ?? null;
  const latestPhoto = projectPhotos[0] ?? null;
  const cockpitStats = [
    { label: 'Counters', value: `${completedCounterCount}/${counters.length}` },
    { label: 'Logs', value: String(workLogEntries.length) },
    { label: 'Photos', value: String(projectPhotos.length) },
    { label: 'Minutes', value: totalMinutesLogged ? String(totalMinutesLogged) : '-' },
  ];

  function projectChatPrompt() {
    return [
      `Help me with my project "${activeProject.title}".`,
      `Linked pattern: ${activeProject.linkedPattern?.title ?? 'Unknown'}.`,
      draftYarnDetails ? `Yarn/materials: ${draftYarnDetails}.` : null,
      draftNeedleHookDetails ? `Needles/hooks/tools: ${draftNeedleHookDetails}.` : null,
      currentSizingContext ? `Sizing and fit: ${currentSizingContext}` : null,
      resumeMark
        ? `Current position: ${resumeMark.pageNumber ? `page ${resumeMark.pageNumber}` : ''} ${resumeMark.locationLabel ?? ''} ${resumeMark.note ?? ''}`.trim()
        : null,
      counters.length
        ? `Counters: ${counters.map((counter) => `${counter.label} ${counter.currentValue}${counter.targetValue ? `/${counter.targetValue}` : ''}`).join(', ')}.`
        : null,
      `User preferences: ${settings.defaultSkill} help, ${settings.measurementUnit} units, ${settings.language.toUpperCase()} terminology.`,
      `Suggested next step: ${nextAction}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function makingAssistantPrompt(rawPrompt: string) {
    return [
      rawPrompt.trim(),
      '',
      projectChatPrompt(),
      reservedStashItems.length
        ? `Reserved stash: ${reservedStashItems.map(describeStashItem).join('; ')}.`
        : null,
      savedBookmarks.length
        ? `Saved bookmarks: ${savedBookmarks
            .slice(0, 4)
            .map((mark) =>
              [
                mark.label,
                mark.pageNumber ? `page ${mark.pageNumber}` : null,
                mark.locationLabel,
                mark.note,
              ]
                .filter(Boolean)
                .join(' · '),
            )
            .join('; ')}.`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function openMakingAssistant() {
    setMakingChatStatus(null);
    setMakingChatDraft((current) => current.trim() || stepByStepGuidePrompt);
    setShowMakingAssistant(true);
  }

  function scrollToCounters() {
    scrollRef.current?.scrollTo({
      y: Math.max(0, counterSectionY - tokens.spacing.lg),
      animated: true,
    });
    setStatusMessage('Counters are ready when you are.');
  }

  async function handleSendMakingAssistant() {
    const trimmed = makingChatDraft.trim();
    if (!trimmed || !accessToken || !linkedPatternId) {
      return;
    }

    setMakingChatDraft('');
    setIsMakingChatSending(true);
    setMakingChatStatus('StitchSense is thinking...');

    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMakingChatMessages((current) => [...current, optimisticMessage]);

    try {
      let activeSession = makingChatSession;
      if (!activeSession) {
        const createResponse = await stitchSenseAPI.createChat(
          linkedPatternId,
          `${activeProject.title} making help`,
          accessToken,
          settings.defaultSkill,
        );
        activeSession = createResponse.session;
        setMakingChatSession(createResponse.session);
      }

      const response = await stitchSenseAPI.sendChatMessage(
        activeSession.id,
        makingAssistantPrompt(trimmed),
        accessToken,
        { patternId: linkedPatternId },
      );
      setMakingChatMessages((current) => [...current, response.message]);
      setMakingChatStatus('Chat updated.');
    } catch (error) {
      setMakingChatStatus(
        projectErrorMessage(error, 'Could not send that question just now.'),
      );
      setMakingChatDraft(trimmed);
    } finally {
      setIsMakingChatSending(false);
    }
  }

  function sessionPlanPrompt() {
    return [
      `Help me plan a focused making session for "${activeProject.title}".`,
      `Next action: ${nextAction}`,
      resumeMark
        ? `Saved position: ${resumeMark.pageNumber ? `page ${resumeMark.pageNumber}` : ''} ${resumeMark.locationLabel ?? ''} ${resumeMark.note ?? ''}`.trim()
        : 'No saved reading position yet.',
      currentSizingContext ? `Sizing and fit: ${currentSizingContext}` : null,
      counters.length
        ? `Counters: ${counters.map((counter) => `${counter.label} ${counter.currentValue}${counter.targetValue ? `/${counter.targetValue}` : ''}`).join(', ')}.`
        : 'No counters yet.',
      reservedStashItems.length
        ? `Reserved stash: ${reservedStashItems.map(describeStashItem).join('; ')}.`
        : null,
      'Give me a simple 30-60 minute plan with what to check before, during, and after the session.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function restartProjectPrompt() {
    return [
      `Help me restart "${activeProject.title}" gently.`,
      idleDays !== null ? `It has been about ${idleDays} days since the last recorded activity.` : null,
      `Next action: ${nextAction}`,
      resumeMark
        ? `Saved position: ${resumeMark.pageNumber ? `page ${resumeMark.pageNumber}` : ''} ${resumeMark.locationLabel ?? ''} ${resumeMark.note ?? ''}`.trim()
        : 'No saved reading position yet.',
      currentSizingContext ? `Sizing and fit: ${currentSizingContext}` : null,
      counters.length
        ? `Counters: ${counters.map((counter) => `${counter.label} ${counter.currentValue}${counter.targetValue ? `/${counter.targetValue}` : ''}`).join(', ')}.`
        : 'No counters yet.',
      'Give me a tiny restart checklist and the first 10-minute action.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function finishingPrompt() {
    return [
      `Help me finish and care for "${activeProject.title}".`,
      activeProject.linkedPattern?.title ? `Pattern: ${activeProject.linkedPattern.title}.` : null,
      draftYarnDetails ? `Yarn/materials: ${draftYarnDetails}.` : null,
      draftNeedleHookDetails ? `Needles/hooks/tools: ${draftNeedleHookDetails}.` : null,
      currentSizingContext ? `Sizing and fit: ${currentSizingContext}` : null,
      reservedStashItems.length
        ? `Reserved stash used: ${reservedStashItems.map(describeStashItem).join('; ')}.`
        : null,
      'Please suggest a practical finishing checklist, care notes, blocking or washing advice, and what I should record before putting this project away.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function prepareSessionLog() {
    setNewLogTitle((current) => current || 'Today’s making session');
    setNewLogMinutes((current) => current || '30');
    setNewLogBody((current) => current || `${nextAction}\n\n${sessionChecklist.join('\n')}`);
    setStatusMessage('Session note drafted. Review it in the Work log section, then save after making.');
  }

  function draftCheckpointLog() {
    setNewLogTitle((current) => current || 'Progress checkpoint');
    setNewLogMinutes((current) => current || '10');
    setNewLogBody((current) => current || [
      `Progress: ${draftProgress || activeProject.progressPercent}%`,
      nextCounter
        ? `${nextCounter.label}: ${nextCounter.currentValue}${nextCounter.targetValue ? `/${nextCounter.targetValue}` : ''}`
        : 'No active counter yet.',
      resumeMark
        ? `Position: ${resumeMark.pageNumber ? `page ${resumeMark.pageNumber}` : 'saved place'}${resumeMark.locationLabel ? `, ${resumeMark.locationLabel}` : ''}.`
        : 'Position not saved yet.',
      'Next time:',
    ].join('\n'));
    setStatusMessage('Checkpoint note drafted in the Work log section.');
  }

  function draftMistakeLog() {
    setNewLogTitle((current) => current || 'Fix or adjustment note');
    setNewLogMinutes((current) => current || '15');
    setNewLogBody((current) => current || 'Issue noticed:\nWhat I changed:\nWhat to check next time:');
    setStatusMessage('Fix note drafted in the Work log section.');
  }

  function setProgressShortcut(value: number) {
    setDraftProgress(String(value));
    setStatusMessage(`${value}% progress drafted. Save the project when it looks right.`);
  }

  async function reserveStashForProject(item: StashItem) {
    await updateStashItem(item.id, { reservedFor: activeProject.title });
    setStatusMessage(`${item.name} reserved for this project.`);
  }

  async function clearStashReservation(item: StashItem) {
    await updateStashItem(item.id, { reservedFor: undefined });
    setStatusMessage(`${item.name} reservation cleared.`);
  }

  async function consumeReservedStash(item: StashItem) {
    const quantity = stashQuantityNumber(item);
    const amount = projectStashUseAmount(item);
    if (quantity === null || amount === null) {
      setStatusMessage(`Add a numeric quantity to ${item.name} in Stash before quick-use works.`);
      return;
    }
    const nextQuantity = Math.max(0, quantity - amount);
    await updateStashItem(item.id, { quantity: String(nextQuantity) });
    setStatusMessage(
      `${item.name} reduced by ${amount}${item.unit ? ` ${item.unit}` : ''}.`,
    );
  }

  function openProjectPatternMarkers() {
    if (!linkedPatternId) {
      setStatusMessage('This project is missing its linked pattern.');
      return;
    }
    router.push({
      pathname: '/pattern/[id]',
      params: { id: linkedPatternId, openFile: '1', projectId: activeProject.id },
    });
  }

  async function openProjectPatternOverlay() {
    if (!linkedPatternId || !accessToken) {
      setStatusMessage('This project is missing its linked pattern.');
      return;
    }

    setIsOpeningPatternOverlay(true);
    setPatternOverlayStatus('Opening pattern PDF...');
    try {
      const response = await stitchSenseAPI.patternFileUrl(linkedPatternId, accessToken);
      if (!response.fileUrl) {
        setPatternOverlayStatus('No PDF file is linked to this pattern yet.');
        setStatusMessage('No PDF file is linked to this pattern yet.');
        return;
      }
      setPatternPdfUrl(response.fileUrl);
      setShowPatternPdfOverlay(true);
      setPatternOverlayStatus(null);
    } catch (error) {
      const message = projectErrorMessage(error, 'Could not open the pattern PDF.');
      setPatternOverlayStatus(message);
      setStatusMessage(message);
    } finally {
      setIsOpeningPatternOverlay(false);
    }
  }

  const patternThumbnail =
    activeProject.coverImageUrl ||
    activeProject.linkedPattern?.thumbnailUrl ||
    activeProject.latestPhotoUrl ||
    latestPhoto?.photoUrl ||
    null;

  const simplifiedProjectDetail = true;

  if (simplifiedProjectDetail) {
    return (
      <View style={styles.screen}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={tokens.color.primary}
              onRefresh={() => void loadProject()}
            />
          }
          style={styles.screen}>
          <ScreenHero
            eyebrow="Project"
            title={activeProject.title}
            copy={`Linked pattern: ${activeProject.linkedPattern?.title ?? 'Pattern'}`}
            icon="folder-multiple-outline">
            <View style={styles.simpleHeroStack}>
              <View style={styles.heroTopRow}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaPill}>{backendStatusForState(projectState)}</Text>
                  <Text style={styles.metaPill}>{activeProject.progressPercent}% done</Text>
                  <Text style={styles.metaPill}>{stageLabelForState(projectState)}</Text>
                </View>
                <Pressable onPress={() => void handleToggleFavorite()} style={styles.pinIconButton}>
                  <MaterialCommunityIcons
                    color={activeProject.isFavorite ? tokens.color.warning : tokens.color.primary}
                    name={activeProject.isFavorite ? 'pin' : 'pin-outline'}
                    size={18}
                  />
                </Pressable>
              </View>

              <Pressable
                disabled={!linkedPatternId || isOpeningPatternOverlay}
                onPress={() => void openProjectPatternOverlay()}
                style={({ pressed }) => [
                  styles.heroPatternPreview,
                  pressed ? styles.heroPatternPreviewPressed : null,
                  !linkedPatternId ? styles.heroPatternPreviewDisabled : null,
                ]}>
                {patternThumbnail ? (
                  <Image
                    source={authenticatedImageSource(patternThumbnail, accessToken)}
                    style={styles.heroPatternThumbnail}
                    contentFit="cover"
                    cachePolicy="none"
                  />
                ) : (
                  <View style={styles.heroPatternFallback}>
                    <MaterialCommunityIcons
                      color={tokens.color.primary}
                      name="file-pdf-box"
                      size={30}
                    />
                  </View>
                )}
                <View style={styles.heroPatternCopy}>
                  <Text style={styles.heroPatternLabel}>Linked pattern</Text>
                  <Text numberOfLines={2} style={styles.heroPatternTitle}>
                    {activeProject.linkedPattern?.title ?? 'Pattern file'}
                  </Text>
                  <Text style={styles.heroPatternAction}>
                    {isOpeningPatternOverlay ? 'Opening PDF...' : 'Tap to view PDF'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </ScreenHero>

          {statusMessage ? (
            <AppCard elevated style={styles.simpleNoticeCard}>
              <Text style={styles.statusMessage}>{statusMessage}</Text>
            </AppCard>
          ) : null}

          <AppCard elevated warm style={styles.companionCard}>
            <Text style={styles.companionEyebrow}>Next step</Text>
            <Text style={styles.companionTitle}>{nextAction}</Text>
            <View style={styles.actionList}>
              <BrandButton
                label="Chat with this project"
                onPress={openMakingAssistant}
                style={styles.fullWidth}
              />
              <BrandButton
                label={isOpeningPatternOverlay ? 'Opening pattern...' : 'View pattern PDF'}
                variant="secondary"
                disabled={!linkedPatternId || isOpeningPatternOverlay}
                loading={isOpeningPatternOverlay}
                onPress={() => void openProjectPatternOverlay()}
                style={styles.fullWidth}
              />
              <BrandButton
                label="Ask in main chat"
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/chat',
                    params: { prompt: projectChatPrompt() },
                  })
                }
                style={styles.fullWidth}
              />
            </View>
          </AppCard>

          <View
            onLayout={(event) => setCounterSectionY(event.nativeEvent.layout.y)}
            style={styles.sectionAnchor}>
            <AppSection
              title="Counters"
              subtitle="Rows, rounds, repeats, or whatever this make needs today.">
              <View style={styles.counterSummaryCard}>
                <Text style={styles.counterSummaryTitle}>
                  {completedCounterCount} of {counters.length} complete
                </Text>
                <Text style={styles.counterSummaryCopy}>
                  {nextCounter
                    ? `${nextCounter.label}: ${nextCounter.currentValue}${nextCounter.targetValue ? `/${nextCounter.targetValue}` : ''}`
                    : 'Add a quick counter before you start.'}
                </Text>
              </View>
              <View style={styles.presetRow}>
                {counterPresets.map((preset) => (
                  <Pressable
                    key={preset.label}
                    onPress={() => void handleAddPresetCounter(preset)}
                    style={styles.presetPill}>
                    <Text style={styles.presetPillText}>{preset.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.stack}>
                {counters.length === 0 ? (
                  <Text style={styles.copy}>
                    No counters yet. Add rows, rounds, repeats, or sections when you are ready.
                  </Text>
                ) : (
                  counters.map((counter) => {
                    const progress = counterProgress(counter);
                    const counterComplete = isCounterComplete(counter);
                    return (
                      <View key={counter.id} style={styles.subCard}>
                        <View style={styles.counterHeader}>
                          <View style={styles.counterMeta}>
                            <Text style={styles.counterTitle}>{counter.label}</Text>
                            <Text style={styles.counterHint}>
                              {counter.counterType}
                              {counter.targetValue ? ` · target ${counter.targetValue}` : ''}
                              {progress !== null ? ` · ${progress}%` : ''}
                            </Text>
                          </View>
                          <Text style={styles.counterValue}>{counter.currentValue}</Text>
                        </View>
                        <View style={styles.counterActions}>
                          <Pressable
                            disabled={counterComplete}
                            onPress={() => void handleAdjustCounter(counter, 'down')}
                            style={({ pressed }) => [
                              styles.stepperButton,
                              counterComplete ? styles.stepperButtonDisabled : null,
                              pressed ? styles.stepperButtonPressed : null,
                            ]}>
                            <Text
                              style={[
                                styles.stepperLabel,
                                counterComplete ? styles.stepperLabelDisabled : null,
                              ]}>
                              -1
                            </Text>
                          </Pressable>
                          <Pressable
                            disabled={counterComplete}
                            onPress={() => void handleAdjustCounter(counter, 'up')}
                            style={({ pressed }) => [
                              styles.stepperButton,
                              styles.stepperButtonPrimary,
                              counterComplete ? styles.stepperButtonDisabled : null,
                              pressed ? styles.stepperButtonPressed : null,
                            ]}>
                            <Text
                              style={[
                                styles.stepperLabel,
                                styles.stepperLabelPrimary,
                                counterComplete ? styles.stepperLabelDisabled : null,
                              ]}>
                              +{counter.stepValue}
                            </Text>
                          </Pressable>
                        </View>
                        {progress !== null ? (
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${progress}%` }]} />
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            </AppSection>
          </View>

          <AppSection
            title="Work notes"
            subtitle="A quick record of what changed, what to check, and where to continue.">
            <FormField label="Note title">
              <TextInput
                style={styles.input}
                value={newLogTitle}
                onChangeText={setNewLogTitle}
                placeholder="Today’s making session"
                placeholderTextColor="#9b867d"
              />
            </FormField>
            <FormField label="Note">
              <TextInput
                multiline
                style={[styles.input, styles.logInput]}
                value={newLogBody}
                onChangeText={setNewLogBody}
                placeholder="What did you do, and what happens next?"
                placeholderTextColor="#9b867d"
              />
            </FormField>
            <View style={styles.quickLogRow}>
              <Pressable onPress={prepareSessionLog} style={styles.quickLogButton}>
                <Text style={styles.quickLogText}>Session</Text>
              </Pressable>
              <Pressable onPress={draftCheckpointLog} style={styles.quickLogButton}>
                <Text style={styles.quickLogText}>Checkpoint</Text>
              </Pressable>
              <Pressable onPress={draftMistakeLog} style={styles.quickLogButton}>
                <Text style={styles.quickLogText}>Fix note</Text>
              </Pressable>
            </View>
            <BrandButton
              label="Save note"
              onPress={() => void handleAddWorkLogEntry()}
              style={styles.fullWidth}
            />
            <View style={styles.stack}>
              {workLogEntries.length === 0 ? (
                <Text style={styles.copy}>No work notes yet.</Text>
              ) : (
                workLogEntries.slice(0, 3).map((entry) => (
                  <View key={entry.id} style={styles.subCard}>
                    <View style={styles.counterHeader}>
                      <View style={styles.counterMeta}>
                        <Text style={styles.counterTitle}>{entry.title}</Text>
                        <Text style={styles.counterHint}>
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Recently'}
                          {workLogMeta(entry) ? ` · ${workLogMeta(entry)}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.logType}>{entry.entryType}</Text>
                    </View>
                    {entry.body ? <Text style={styles.logBody}>{entry.body}</Text> : null}
                  </View>
                ))
              )}
            </View>
          </AppSection>

          <AppSection title="Finish" subtitle="Keep project management simple.">
            <View style={styles.actionList}>
              <BrandButton
                label={activeProject.status === 'completed' ? 'Reopen project' : 'Mark complete'}
                onPress={
                  activeProject.status === 'completed'
                    ? () => void handleReopenProject()
                    : handleCompleteProject
                }
                style={styles.fullWidth}
                variant={activeProject.status === 'completed' ? 'secondary' : 'ghost'}
              />
              <BrandButton
                label="Delete project"
                variant="ghost"
                onPress={handleDelete}
                style={styles.fullWidth}
              />
            </View>
          </AppSection>
        </ScrollView>

        <Modal
          animationType="slide"
          visible={showPatternPdfOverlay}
          onRequestClose={() => setShowPatternPdfOverlay(false)}>
          <View style={styles.patternOverlay}>
            <View style={styles.patternOverlayHeader}>
              <View style={styles.counterMeta}>
                <Text style={styles.companionEyebrow}>Pattern PDF</Text>
                <Text numberOfLines={1} style={styles.patternOverlayTitle}>
                  {activeProject.linkedPattern?.title ?? activeProject.title}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowPatternPdfOverlay(false)}
                style={styles.makingModalClose}>
                <MaterialCommunityIcons color={tokens.color.primary} name="close" size={20} />
              </Pressable>
            </View>
            {patternPdfUrl ? (
              <WebView source={{ uri: patternPdfUrl }} style={styles.patternOverlayWebView} />
            ) : (
              <View style={styles.patternOverlayEmpty}>
                <Text style={styles.copy}>{patternOverlayStatus ?? 'Pattern PDF not ready yet.'}</Text>
              </View>
            )}
          </View>
        </Modal>

        <Modal
          animationType="slide"
          transparent
          visible={showMakingAssistant}
          onRequestClose={() => setShowMakingAssistant(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.makingModalBackdrop}>
            <View style={styles.makingModalCard}>
              <View style={styles.makingModalHeader}>
                <View style={styles.counterMeta}>
                  <Text style={styles.companionEyebrow}>Making assistant</Text>
                  <Text style={styles.makingModalTitle}>{activeProject.title}</Text>
                </View>
                <Pressable
                  onPress={() => setShowMakingAssistant(false)}
                  style={styles.makingModalClose}>
                  <MaterialCommunityIcons color={tokens.color.primary} name="close" size={20} />
                </Pressable>
              </View>

              <View style={styles.makingQuickActions}>
                <Pressable
                  disabled={!linkedPatternId}
                  onPress={() => void openProjectPatternOverlay()}
                  style={[
                    styles.makingQuickButton,
                    !linkedPatternId ? styles.makingQuickButtonDisabled : null,
                  ]}>
                  <MaterialCommunityIcons
                    color={tokens.color.primary}
                    name="book-open-page-variant-outline"
                    size={18}
                  />
                  <Text style={styles.makingQuickButtonText}>View pattern</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMakingChatDraft(stepByStepGuidePrompt)}
                  style={styles.makingQuickButton}>
                  <MaterialCommunityIcons
                    color={tokens.color.primary}
                    name="format-list-numbered"
                    size={18}
                  />
                  <Text style={styles.makingQuickButtonText}>Step guide</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMakingChatDraft(sessionPlanPrompt())}
                  style={styles.makingQuickButton}>
                  <MaterialCommunityIcons
                    color={tokens.color.primary}
                    name="clock-check-outline"
                    size={18}
                  />
                  <Text style={styles.makingQuickButtonText}>Session plan</Text>
                </Pressable>
              </View>

              <View style={styles.makingContextCard}>
                <Text style={styles.makingContextTitle}>Current position</Text>
                <Text style={styles.makingContextCopy}>
                  {resumeMark
                    ? `${resumeMark.pageNumber ? `Page ${resumeMark.pageNumber}` : 'Saved place'}${resumeMark.locationLabel ? ` · ${resumeMark.locationLabel}` : ''}${resumeMark.note ? ` · ${resumeMark.note}` : ''}`
                    : 'No reading position saved yet.'}
                </Text>
              </View>

              <ScrollView
                contentContainerStyle={styles.makingMessageList}
                style={styles.makingMessageScroll}>
                {makingChatMessages.length === 0 ? (
                  <Text style={styles.copy}>
                    Ask what comes next, check a cuff or sleeve instruction, or send the prepared guide prompt below.
                  </Text>
                ) : (
                  makingChatMessages.map((message) => (
                    <View
                      key={`${message.id}-${message.createdAt ?? ''}`}
                      style={[
                        styles.makingBubble,
                        message.role === 'user'
                          ? styles.makingUserBubble
                          : styles.makingAssistantBubble,
                      ]}>
                      {message.role === 'user' ? (
                        <Text style={[styles.makingBubbleText, styles.makingUserBubbleText]}>
                          {message.content}
                        </Text>
                      ) : (
                        <RichMarkdownText text={message.content} />
                      )}
                    </View>
                  ))
                )}
              </ScrollView>

              {makingChatStatus ? <Text style={styles.statusMessage}>{makingChatStatus}</Text> : null}

              <View style={styles.makingComposer}>
                <TextInput
                  multiline
                  style={styles.makingInput}
                  value={makingChatDraft}
                  onChangeText={setMakingChatDraft}
                  placeholder="Ask what to do next..."
                  placeholderTextColor="#9b867d"
                />
                <Pressable
                  disabled={!makingChatDraft.trim() || isMakingChatSending || !linkedPatternId}
                  onPress={() => void handleSendMakingAssistant()}
                  style={[
                    styles.makingSendButton,
                    !makingChatDraft.trim() || isMakingChatSending || !linkedPatternId
                      ? styles.makingSendButtonDisabled
                      : null,
                  ]}>
                  <MaterialCommunityIcons color="#fffaf4" name="send" size={20} />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Pressable
          onPress={openMakingAssistant}
          style={({ pressed }) => [
            styles.floatingAssistantButton,
            pressed ? styles.floatingAssistantButtonPressed : null,
          ]}>
          <MaterialCommunityIcons color="#fffaf4" name="message-text-outline" size={24} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={tokens.color.primary}
            onRefresh={() => void loadProject()}
          />
        }
        style={styles.screen}>
      <ScreenHero
        eyebrow="Project"
        title={project.title}
        copy={`Linked pattern: ${project.linkedPattern?.title ?? 'Pattern'}`}
        icon="book-open-page-variant-outline">
        <View style={styles.heroTopRow}>
          <View style={styles.metaRow}>
            <Text style={styles.metaPill}>{backendStatusForState(projectState)}</Text>
            <Text style={styles.metaPill}>{project.progressPercent}% done</Text>
            <Text style={styles.metaPill}>{stageLabelForState(projectState)}</Text>
            {project.isFavorite ? <Text style={styles.metaPill}>Pinned</Text> : null}
          </View>
          <Pressable onPress={() => void handleToggleFavorite()} style={styles.pinIconButton}>
            <MaterialCommunityIcons
              color={project.isFavorite ? tokens.color.warning : tokens.color.primary}
              name={project.isFavorite ? 'pin' : 'pin-outline'}
              size={18}
            />
          </Pressable>
        </View>
      </ScreenHero>

      {deadlineStatus ? (
        <AppCard
          elevated
          style={[
            styles.bannerCard,
            deadlineStatus.tone === 'danger' ? styles.bannerDanger : styles.bannerWarning,
          ]}>
          <Text style={styles.bannerTitle}>{deadlineStatus.label}</Text>
          <Text style={styles.bannerCopy}>{deadlineStatus.copy}</Text>
        </AppCard>
      ) : null}

      <AppCard elevated warm style={styles.companionCard}>
        <Text style={styles.companionEyebrow}>Companion next step</Text>
        <Text style={styles.companionTitle}>{nextAction}</Text>
        <View style={styles.actionList}>
          <BrandButton
            label="Ask about this project"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: { prompt: projectChatPrompt() },
              })
            }
            style={styles.fullWidth}
          />
          <BrandButton
            label="Open project pattern"
            disabled={!linkedPatternId}
            onPress={() => {
              if (linkedPatternId) {
                router.push({
                  pathname: '/pattern/[id]',
                  params: { id: linkedPatternId, projectId: activeProject.id },
                });
              }
            }}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      </AppCard>

      <AppCard elevated style={styles.cockpitCard}>
        <Text style={styles.companionEyebrow}>Making cockpit</Text>
        <Text style={styles.sessionTitle}>Everything you need for the next sit-down</Text>
        <View style={styles.cockpitGrid}>
          {cockpitStats.map((stat) => (
            <View key={stat.label} style={styles.cockpitStat}>
              <Text style={styles.cockpitValue}>{stat.value}</Text>
              <Text style={styles.cockpitLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.focusStrip}>
          <View style={styles.focusStripItem}>
            <Text style={styles.focusStripLabel}>Next counter</Text>
            <Text style={styles.focusStripValue}>
              {nextCounter
                ? `${nextCounter.label} ${nextCounter.currentValue}${nextCounter.targetValue ? `/${nextCounter.targetValue}` : ''}`
                : 'None yet'}
            </Text>
          </View>
          <View style={styles.focusStripItem}>
            <Text style={styles.focusStripLabel}>Latest note</Text>
            <Text numberOfLines={1} style={styles.focusStripValue}>
              {latestWorkLog?.title ?? 'No work log yet'}
            </Text>
          </View>
          <View style={styles.focusStripItem}>
            <Text style={styles.focusStripLabel}>Latest photo</Text>
            <Text numberOfLines={1} style={styles.focusStripValue}>
              {latestPhoto?.caption?.trim() || (latestPhoto ? 'Progress photo' : 'No photo yet')}
            </Text>
          </View>
        </View>
        <View style={styles.cockpitActionRow}>
          <BrandButton
            label="Checkpoint note"
            onPress={draftCheckpointLog}
            style={styles.cockpitActionButton}
            variant="secondary"
          />
          <BrandButton
            label="Jump to counters"
            onPress={scrollToCounters}
            style={styles.cockpitActionButton}
            variant="ghost"
          />
        </View>
      </AppCard>

      <AppCard elevated style={styles.sessionCard}>
        <Text style={styles.companionEyebrow}>Start today’s session</Text>
        <Text style={styles.sessionTitle}>A short plan for picking this project back up</Text>
        <View style={styles.sessionChecklist}>
          {sessionChecklist.map((item) => (
            <View key={item} style={styles.sessionChecklistRow}>
              <MaterialCommunityIcons color={tokens.color.primary} name="check-circle-outline" size={18} />
              <Text style={styles.sessionChecklistText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.actionList}>
          <BrandButton
            label="Draft session log"
            onPress={prepareSessionLog}
            style={styles.fullWidth}
            variant="secondary"
          />
          <BrandButton
            label="Ask for session plan"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: { prompt: sessionPlanPrompt() },
              })
            }
            style={styles.fullWidth}
            variant="ghost"
          />
          <BrandButton
            label="Open PDF + markers"
            disabled={!linkedPatternId}
            onPress={openProjectPatternMarkers}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
      </AppCard>

      {needsRestartPrompt ? (
        <AppCard elevated style={styles.restartCard}>
          <Text style={styles.companionEyebrow}>Pick this back up</Text>
          <Text style={styles.sessionTitle}>
            {activeProject.status === 'paused'
              ? 'This project is paused. Restart gently.'
              : `Quiet for ${idleDays ?? 'a few'} days. Make the next step tiny.`}
          </Text>
          <Text style={styles.restartCopy}>
            StitchSense can turn your saved position, counters, and notes into a low-friction restart plan.
          </Text>
          <View style={styles.actionList}>
            <BrandButton
              label="Ask for restart plan"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/chat',
                  params: { prompt: restartProjectPrompt() },
                })
              }
              style={styles.fullWidth}
              variant="secondary"
            />
            <BrandButton
              label="Draft restart note"
              onPress={() => {
                setNewLogTitle((current) => current || 'Restart session');
                setNewLogBody((current) => current || restartProjectPrompt());
                setStatusMessage('Restart note drafted. Review it in the Work log section.');
              }}
              style={styles.fullWidth}
              variant="ghost"
            />
          </View>
        </AppCard>
      ) : null}

      <AppSection
        title="Guided setup"
        subtitle={`${setupCompleteCount} of ${setupTasks.length} foundations ready for an easier next session.`}>
        <View style={styles.stack}>
          {setupTasks.map((task) => (
            <View
              key={task.key}
              style={[
                styles.setupTask,
                task.complete ? styles.setupTaskComplete : null,
              ]}>
              <View style={styles.setupStatus}>
                <MaterialCommunityIcons
                  color={task.complete ? tokens.color.success : tokens.color.muted}
                  name={task.complete ? 'check-circle' : 'circle-outline'}
                  size={20}
                />
              </View>
              <View style={styles.setupText}>
                <Text style={styles.setupTitle}>{task.title}</Text>
                <Text style={styles.setupCopy}>{task.copy}</Text>
                {!task.complete && task.actionLabel && task.action ? (
                  <Pressable onPress={task.action} style={styles.setupAction}>
                    <Text style={styles.setupActionText}>{task.actionLabel}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
        <BrandButton
          label="Ready to start"
          onPress={scrollToCounters}
          style={styles.fullWidth}
        />
      </AppSection>

      <AppSection
        title="Size and fit"
        subtitle="Keep the exact size, measurements, ease, and sleeve or length choices visible while you make.">
        <View style={styles.sizingPanel}>
          <View style={styles.sizingModeRow}>
            {[
              { label: 'Sized pattern', value: 'sized' as const },
              { label: 'One size', value: 'one-size' as const },
            ].map((option) => {
              const active = draftSizingMode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setDraftSizingMode(option.value)}
                  style={[styles.sizingModePill, active ? styles.sizingModePillActive : null]}>
                  <Text style={[styles.sizingModeText, active ? styles.sizingModeTextActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {draftSizingMode === 'sized' ? (
            <>
              <View style={styles.fitSummaryGrid}>
                <View style={styles.fitSummaryCard}>
                  <Text style={styles.fitSummaryLabel}>Size</Text>
                  <Text style={styles.fitSummaryValue}>{draftSelectedSize.trim() || 'Not set'}</Text>
                </View>
                <View style={styles.fitSummaryCard}>
                  <Text style={styles.fitSummaryLabel}>Ease</Text>
                  <Text style={styles.fitSummaryValue}>{draftEasePreference.trim() || 'Not set'}</Text>
                </View>
              </View>
              <TextInput
                onChangeText={setDraftSelectedSize}
                placeholder={`Chosen pattern size, e.g. M, 42 ${measurementUnitShort}, third size`}
                placeholderTextColor="#9b867d"
                style={styles.input}
                value={draftSelectedSize}
              />
              <View style={styles.sizingTwoColumn}>
                <View style={styles.sizingFlexInput}>
                  <Text style={styles.sizingFieldLabel}>Bust/chest to fit ({measurementUnitLabel})</Text>
                  <TextInput
                    onChangeText={setDraftFitMeasurement}
                    placeholder={`e.g. 96 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={draftFitMeasurement}
                  />
                </View>
                <View style={styles.sizingFlexInput}>
                  <Text style={styles.sizingFieldLabel}>Finished bust/chest ({measurementUnitLabel})</Text>
                  <TextInput
                    onChangeText={setDraftFinishedMeasurement}
                    placeholder={`e.g. 104 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={draftFinishedMeasurement}
                  />
                </View>
              </View>
              <Text style={styles.sizingFieldHelp}>
                To-fit is the body measurement. Finished is the garment measurement after ease.
              </Text>
              <View style={styles.fitChipRow}>
                {['Relaxed fit', 'Close fit', 'Positive ease', 'No ease'].map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setDraftEasePreference(option)}
                    style={[
                      styles.fitChip,
                      draftEasePreference === option ? styles.fitChipActive : null,
                    ]}>
                    <Text
                      style={[
                        styles.fitChipText,
                        draftEasePreference === option ? styles.fitChipTextActive : null,
                      ]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.sizingTwoColumn}>
                <View style={styles.sizingFlexInput}>
                  <Text style={styles.sizingFieldLabel}>Body length / to shoulder</Text>
                  <TextInput
                    onChangeText={setDraftLengthChoice}
                    placeholder={`e.g. regular, cropped, 58 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={draftLengthChoice}
                  />
                </View>
                <View style={styles.sizingFlexInput}>
                  <Text style={styles.sizingFieldLabel}>Sleeve seam / sleeve length</Text>
                  <TextInput
                    onChangeText={setDraftSleeveChoice}
                    placeholder={`e.g. long, short, 45 ${measurementUnitShort}`}
                    placeholderTextColor="#9b867d"
                    style={styles.input}
                    value={draftSleeveChoice}
                  />
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.sizingOneSizeCopy}>
              This project is marked as one size, so StitchSense will not expect a size-table choice before counters and row guidance.
            </Text>
          )}
          <TextInput
            multiline
            onChangeText={setDraftSizingNotes}
            placeholder="Sizing notes, measurements to double-check, or custom changes"
            placeholderTextColor="#9b867d"
            style={[styles.input, styles.sizingNotesInput]}
            value={draftSizingNotes}
          />
          <View style={styles.sizingActionRow}>
            <BrandButton
              label="Save size choices"
              loading={isSaving}
              onPress={() => void handleSave()}
              style={styles.sizingActionButton}
              variant="secondary"
            />
            <BrandButton
              label="Gauge check"
              onPress={() => router.push('/gauge-calculator')}
              style={styles.sizingActionButton}
              variant="ghost"
            />
          </View>
          <BrandButton
            label="Ask fit check"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: {
                  prompt: [
                    `Please sanity-check the size and fit choices for "${activeProject.title}".`,
                    draftSizingMode === 'one-size'
                      ? 'This is marked as one size.'
                      : [
                          draftSelectedSize ? `Chosen size: ${draftSelectedSize}.` : null,
                          draftFitMeasurement ? `To-fit measurement: ${draftFitMeasurement}.` : null,
                          draftFinishedMeasurement ? `Finished measurement: ${draftFinishedMeasurement}.` : null,
                          draftEasePreference ? `Ease / fit: ${draftEasePreference}.` : null,
                          draftLengthChoice ? `Length option: ${draftLengthChoice}.` : null,
                          draftSleeveChoice ? `Sleeve option: ${draftSleeveChoice}.` : null,
                        ].filter(Boolean).join(' '),
                    draftSizingNotes ? `Notes: ${draftSizingNotes}.` : null,
                    'Tell me what I should double-check before relying on stitch and row counts.',
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
      </AppSection>

      <AppSection
        title="Pattern waypoints"
        subtitle="Keep your place visible so you can reopen this project and know exactly where to continue.">
        <View style={styles.waypointGrid}>
          <View style={styles.waypointCard}>
            <Text style={styles.waypointLabel}>Reading position</Text>
            <Text style={styles.waypointValue}>
              {resumeMark?.pageNumber ? `Page ${resumeMark.pageNumber}` : 'Not saved yet'}
            </Text>
            <Text style={styles.waypointNote}>
              {resumeMark?.locationLabel || resumeMark?.note || 'Save the page, section, or note where you paused.'}
            </Text>
          </View>
          <View style={styles.waypointCard}>
            <Text style={styles.waypointLabel}>Bookmarks</Text>
            <Text style={styles.waypointValue}>
              {savedBookmarks.length === 0 ? 'None yet' : `${savedBookmarks.length} saved`}
            </Text>
            <Text style={styles.waypointNote}>
              {savedBookmarks[0]?.label
                ? `Latest: ${savedBookmarks[0].label}`
                : 'Save tricky repeats, fitting notes, or restart points here.'}
            </Text>
          </View>
        </View>
        <BrandButton
          label="Open PDF markers"
          disabled={!linkedPatternId}
          onPress={openProjectPatternMarkers}
          style={styles.fullWidth}
          variant="secondary"
        />
        {savedBookmarks.length > 0 ? (
          <View style={styles.markerPreviewList}>
            {savedBookmarks.slice(0, 3).map((mark) => (
              <Pressable
                key={mark.id}
                onPress={openProjectPatternMarkers}
                style={({ pressed }) => [
                  styles.markerPreviewRow,
                  pressed ? styles.stepperButtonPressed : null,
                ]}>
                <View style={styles.markerPreviewCopy}>
                  <Text style={styles.markerPreviewTitle}>
                    {mark.locationLabel || mark.label || 'Pattern marker'}
                  </Text>
                  <Text style={styles.markerPreviewMeta}>
                    {mark.pageNumber ? `Page ${mark.pageNumber}` : 'No page set'}
                    {mark.note ? ` · ${mark.note}` : ''}
                  </Text>
                </View>
                <MaterialCommunityIcons color={tokens.color.muted} name="chevron-right" size={20} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </AppSection>

      <AppSection
        title="Continue working"
        subtitle="Open the linked pattern, jump into chat, or launch a rewrite from the same project context.">
        <View style={styles.actionList}>
          <BrandButton
            label="View Pattern"
            disabled={!linkedPatternId}
            onPress={() => {
              if (!linkedPatternId) {
                setStatusMessage(
                  'This project is missing its linked pattern. Please reopen it from Library.',
                );
                return;
              }
              openProjectPatternMarkers();
            }}
            style={styles.fullWidth}
          />
          <BrandButton
            label="Pattern Chat"
            variant="secondary"
            disabled={!linkedPatternId}
            onPress={() => {
              if (!linkedPatternId) {
                setStatusMessage(
                  'This project is missing its linked pattern. Please reopen it from Library.',
                );
                return;
              }
              router.push({
                pathname: '/pattern-chat',
                params: { patternId: linkedPatternId },
              });
            }}
            style={styles.fullWidth}
          />
          <BrandButton
            label="Open AI rewrite"
            variant="secondary"
            disabled={!linkedPatternId}
            onPress={() => {
              if (!linkedPatternId) {
                setStatusMessage(
                  'This project is missing its linked pattern. Please reopen it from Library.',
                );
                return;
              }
              router.push({
                pathname: '/pattern-rewrite',
                params: { patternId: linkedPatternId },
              });
            }}
            style={styles.fullWidth}
          />
        </View>
      </AppSection>

      <AppSection
        title="Working details"
        subtitle="Keep the practical bits tidy so this project stays easy to resume later.">
        <FormField label="Project name">
          <TextInput
            style={styles.input}
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="Project name"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Project state">
          <Pressable onPress={() => setShowStateSheet(true)} style={styles.selectField}>
            <Text style={styles.selectValue}>
              {projectStateOptions.find((option) => option.value === projectState)?.label ??
                'Select state'}
            </Text>
          </Pressable>
        </FormField>
        <FormField label="Progress" hint="Use a simple percentage from 0 to 100.">
          <TextInput
            style={styles.input}
            value={draftProgress}
            onChangeText={setDraftProgress}
            placeholder="Progress %"
            placeholderTextColor="#9b867d"
            keyboardType="numeric"
          />
        </FormField>
        <View style={styles.quickProgressRow}>
          {[25, 50, 75, 95].map((value) => (
            <Pressable
              key={value}
              onPress={() => setProgressShortcut(value)}
              style={styles.quickProgressButton}>
              <Text style={styles.quickProgressText}>{value}%</Text>
            </Pressable>
          ))}
        </View>
        <FormField label="Recipient">
          <TextInput
            style={styles.input}
            value={draftRecipient}
            onChangeText={setDraftRecipient}
            placeholder="Recipient"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Occasion">
          <TextInput
            style={styles.input}
            value={draftOccasion}
            onChangeText={setDraftOccasion}
            placeholder="Occasion"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Project type">
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setDraftIsGift(false)}
            style={[styles.togglePill, !draftIsGift ? styles.togglePillActive : null]}>
            <Text style={[styles.togglePillText, !draftIsGift ? styles.togglePillTextActive : null]}>
              Personal make
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDraftIsGift(true)}
            style={[styles.togglePill, draftIsGift ? styles.togglePillActive : null]}>
            <Text style={[styles.togglePillText, draftIsGift ? styles.togglePillTextActive : null]}>
              Gift project
            </Text>
          </Pressable>
        </View>
        </FormField>
        <FormField label="Deadline">
          <Pressable onPress={() => setShowDeadlineSheet(true)} style={styles.selectField}>
            <Text style={styles.selectValue}>{formatDeadlineLabel(draftDeadlineAt)}</Text>
          </Pressable>
        </FormField>
        <FormField label="Notes">
          <TextInput
            multiline
            style={[styles.input, styles.notesInput]}
            value={draftNotes}
            onChangeText={setDraftNotes}
            placeholder="Custom notes, yarn swaps, sizing tweaks, reminders..."
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Yarn details">
          <TextInput
            style={styles.input}
            value={draftYarnDetails}
            onChangeText={setDraftYarnDetails}
            placeholder="Base, colourway, dye lot..."
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Needle or hook details">
          <TextInput
            style={styles.input}
            value={draftNeedleHookDetails}
            onChangeText={setDraftNeedleHookDetails}
            placeholder="Needle / hook details"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
        <BrandButton
          label={isSaving ? 'Saving…' : 'Save project'}
          loading={isSaving}
          onPress={() => void handleSave()}
          style={styles.fullWidth}
        />
      </AppSection>

      {stashMatches.length > 0 ? (
        <AppSection
          title="Materials from Stash"
          subtitle="Reserve supplies for this project or clear a reservation when plans change.">
          <View style={styles.stack}>
            {stashMatches.map((match) => {
              const reservedHere = match.item.reservedFor === project.title;
              return (
                <View key={match.item.id} style={styles.subCard}>
                  <View style={styles.counterHeader}>
                    <View style={styles.counterMeta}>
                      <Text style={styles.counterTitle}>{describeStashItem(match.item)}</Text>
                      <Text style={styles.counterHint}>
                        {reservedHere
                          ? 'Reserved for this project'
                          : match.item.reservedFor
                            ? `Reserved for ${match.item.reservedFor}`
                            : match.reason}
                      </Text>
                    </View>
                    <Text style={styles.logType}>{match.item.category}</Text>
                  </View>
                  <View style={styles.actionList}>
                    {reservedHere && projectStashUseAmount(match.item) !== null ? (
                      <BrandButton
                        label={`Use ${projectStashUseAmount(match.item)}${match.item.unit ? ` ${match.item.unit}` : ''}`}
                        onPress={() => void consumeReservedStash(match.item)}
                        style={styles.fullWidth}
                        variant="secondary"
                      />
                    ) : null}
                    <BrandButton
                      label={reservedHere ? 'Clear reservation' : 'Reserve for this project'}
                      onPress={() =>
                        reservedHere
                          ? void clearStashReservation(match.item)
                          : void reserveStashForProject(match.item)
                      }
                      style={styles.fullWidth}
                      variant={reservedHere ? 'ghost' : 'secondary'}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </AppSection>
      ) : null}

      <AppSection
        title="Reading position"
        subtitle="Save the page, section, or note that tells future-you exactly where to pick back up.">
        <FormField label="Page number">
          <TextInput
            style={styles.input}
            value={resumePage}
            onChangeText={setResumePage}
            placeholder="Page number"
            placeholderTextColor="#9b867d"
            keyboardType="numeric"
          />
        </FormField>
        <FormField label="Section or location">
          <TextInput
            style={styles.input}
            value={resumeLocation}
            onChangeText={setResumeLocation}
            placeholder="Section or location"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Note">
          <TextInput
            multiline
            style={[styles.input, styles.logInput]}
            value={resumeNote}
            onChangeText={setResumeNote}
            placeholder="Short note about where you stopped"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <BrandButton
          label="Save reading position"
          onPress={() => void handleSaveResumeMark()}
          style={styles.fullWidth}
        />
        {resumeMark ? (
          <View style={styles.subCard}>
            <View style={styles.counterHeader}>
              <View style={styles.counterMeta}>
                <Text style={styles.counterTitle}>{resumeMark.label}</Text>
                <Text style={styles.counterHint}>
                  {resumeMark.pageNumber ? `Page ${resumeMark.pageNumber}` : 'No page set'}
                  {resumeMark.locationLabel ? ` · ${resumeMark.locationLabel}` : ''}
                </Text>
              </View>
              <Text style={styles.logType}>Resume</Text>
            </View>
            {resumeMark.note ? <Text style={styles.logBody}>{resumeMark.note}</Text> : null}
            <BrandButton
              label="Clear reading position"
              variant="ghost"
              onPress={() => handleDeleteMark(resumeMark)}
              style={styles.fullWidth}
            />
          </View>
        ) : null}
      </AppSection>

      <AppSection
        title="Bookmarks and notes"
        subtitle="Keep tricky repeats, fitting notes, and useful waypoints attached to this project.">
        <FormField label="Bookmark title">
          <TextInput
            style={styles.input}
            value={bookmarkLabel}
            onChangeText={setBookmarkLabel}
            placeholder="Bookmark title"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Page number">
          <TextInput
            style={styles.input}
            value={bookmarkPage}
            onChangeText={setBookmarkPage}
            placeholder="Page number"
            placeholderTextColor="#9b867d"
            keyboardType="numeric"
          />
        </FormField>
        <FormField label="Section or location">
          <TextInput
            style={styles.input}
            value={bookmarkLocation}
            onChangeText={setBookmarkLocation}
            placeholder="Section or location"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Pattern note">
          <TextInput
            multiline
            style={[styles.input, styles.logInput]}
            value={bookmarkNote}
            onChangeText={setBookmarkNote}
            placeholder="Pattern note, stitch reminder, sizing tweak..."
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <BrandButton
          label="Save bookmark"
          onPress={() => void handleAddBookmark()}
          style={styles.fullWidth}
        />
        <View style={styles.stack}>
          {savedBookmarks.length === 0 ? (
            <Text style={styles.copy}>
              No bookmarks yet. Save a repeat note, fitting reminder, or “restart from here” pointer.
            </Text>
          ) : (
            savedBookmarks.map((mark) => (
              <View key={mark.id} style={styles.subCard}>
                <View style={styles.counterHeader}>
                  <View style={styles.counterMeta}>
                    <Text style={styles.counterTitle}>{mark.label}</Text>
                    <Text style={styles.counterHint}>
                      {mark.pageNumber ? `Page ${mark.pageNumber}` : 'No page set'}
                      {mark.locationLabel ? ` · ${mark.locationLabel}` : ''}
                      {mark.type === 'annotation' ? ' · note' : ' · bookmark'}
                    </Text>
                  </View>
                  <Text style={styles.logType}>{mark.type}</Text>
                </View>
                {mark.note ? <Text style={styles.logBody}>{mark.note}</Text> : null}
                <BrandButton
                  label="Delete bookmark"
                  variant="ghost"
                  onPress={() => handleDeleteMark(mark)}
                  style={styles.fullWidth}
                />
              </View>
            ))
          )}
        </View>
      </AppSection>

      <AppSection
        title="Photo timeline"
        subtitle="Save quick progress snapshots so this project keeps a visual history, not just notes.">
        <View style={styles.actionList}>
          <BrandButton
            label={isUploadingPhoto ? 'Adding photo…' : 'Choose from library'}
            loading={isUploadingPhoto}
            onPress={() => void handlePickProjectPhoto('library')}
            style={styles.fullWidth}
          />
          <BrandButton
            label="Take progress photo"
            variant="secondary"
            disabled={isUploadingPhoto}
            onPress={() => void handlePickProjectPhoto('camera')}
            style={styles.fullWidth}
          />
          <BrandButton
            label="Open Stitch Vision"
            variant="ghost"
            onPress={() => router.push('/(tabs)/camera')}
            style={styles.fullWidth}
          />
        </View>

        <View style={styles.stack}>
          {projectPhotos.length === 0 ? (
            <Text style={styles.copy}>
              No project photos yet. Add one after a fitting, a big milestone, or a tricky section.
            </Text>
          ) : (
            projectPhotos.map((photo) => (
              <View key={photo.id} style={styles.subCard}>
                <Pressable onPress={() => setSelectedPhoto(photo)} style={styles.photoPressable}>
                  <Image
                    source={{ uri: resolvedPhotoUri(photo) ?? photo.photoUrl }}
                    style={styles.projectPhoto}
                    contentFit="cover"
                    cachePolicy="none"
                  />
                </Pressable>
                <View style={styles.photoMeta}>
                  <Text style={styles.counterTitle}>
                    {photo.caption?.trim() || 'Progress photo'}
                  </Text>
                  <Text style={styles.counterHint}>
                    {photo.takenAt ? new Date(photo.takenAt).toLocaleString() : 'Recently added'}
                  </Text>
                </View>
                <BrandButton
                  label="Open full photo"
                  variant="secondary"
                  onPress={() => setSelectedPhoto(photo)}
                  style={styles.fullWidth}
                />
                <BrandButton
                  label="Delete photo"
                  variant="ghost"
                  onPress={() => handleDeleteProjectPhoto(photo)}
                  style={styles.fullWidth}
                />
              </View>
            ))
          )}
        </View>
      </AppSection>

      <View
        onLayout={(event) => setCounterSectionY(event.nativeEvent.layout.y)}
        style={styles.sectionAnchor}>
        <AppSection
          title="Project counters"
          subtitle="Track rows, rounds, repeats, or whatever this specific make needs.">
        <View style={styles.counterSummaryCard}>
          <Text style={styles.counterSummaryTitle}>
            {completedCounterCount} of {counters.length} counters complete
          </Text>
          <Text style={styles.counterSummaryCopy}>
            {nextCounter
              ? `Next: ${nextCounter.label} is at ${nextCounter.currentValue}${nextCounter.targetValue ? `/${nextCounter.targetValue}` : ''}.`
              : 'Add a counter before your next making session.'}
          </Text>
        </View>
        <View style={styles.presetRow}>
          {counterPresets.map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => void handleAddPresetCounter(preset)}
              style={styles.presetPill}>
              <Text style={styles.presetPillText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
        <FormField label="Counter name">
          <TextInput
            style={styles.input}
            value={newCounterLabel}
            onChangeText={setNewCounterLabel}
            placeholder="Counter name"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Counter type">
          <Pressable onPress={() => setShowCounterTypeSheet(true)} style={styles.selectField}>
            <Text style={styles.selectValue}>
              {counterTypeOptions.find((option) => option.value === newCounterType)?.label ??
                'Custom'}
            </Text>
          </Pressable>
        </FormField>
        <FormField label="Optional target">
          <TextInput
            style={styles.input}
            value={newCounterTarget}
            onChangeText={setNewCounterTarget}
            placeholder="Optional target"
            placeholderTextColor="#9b867d"
            keyboardType="numeric"
          />
        </FormField>
        <BrandButton
          label="Add counter"
          onPress={() => void handleAddCounter()}
          style={styles.fullWidth}
        />

        <View style={styles.stack}>
          {counters.length === 0 ? (
            <Text style={styles.copy}>
              No counters yet. Add one for rows, rounds, repeats, or sections.
            </Text>
          ) : (
            counters.map((counter) => {
              const progress = counterProgress(counter);
              const counterComplete = isCounterComplete(counter);
              return (
                <View key={counter.id} style={styles.subCard}>
                  <View style={styles.counterHeader}>
                    <View style={styles.counterMeta}>
                      <Text style={styles.counterTitle}>{counter.label}</Text>
                      <Text style={styles.counterHint}>
                        {counter.counterType}
                        {counter.targetValue ? ` · target ${counter.targetValue}` : ''}
                        {progress !== null ? ` · ${progress}%` : ''}
                        {counterComplete ? ' · completed' : ''}
                      </Text>
                    </View>
                    <Text style={styles.counterValue}>{counter.currentValue}</Text>
                  </View>
                  <View style={styles.counterActions}>
                    <Pressable
                      disabled={counterComplete}
                      onPress={() => void handleAdjustCounter(counter, 'down')}
                      style={({ pressed }) => [
                        styles.stepperButton,
                        counterComplete ? styles.stepperButtonDisabled : null,
                        pressed ? styles.stepperButtonPressed : null,
                      ]}>
                      <Text
                        style={[styles.stepperLabel, counterComplete ? styles.stepperLabelDisabled : null]}>
                        -1
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={counterComplete}
                      onPress={() => void handleAdjustCounter(counter, 'up')}
                      style={({ pressed }) => [
                        styles.stepperButton,
                        styles.stepperButtonPrimary,
                        counterComplete ? styles.stepperButtonDisabled : null,
                        pressed ? styles.stepperButtonPressed : null,
                      ]}>
                      <Text
                        style={[
                          styles.stepperLabel,
                          styles.stepperLabelPrimary,
                          counterComplete ? styles.stepperLabelDisabled : null,
                        ]}>
                        +{counter.stepValue}
                      </Text>
                    </Pressable>
                  </View>
                  {progress !== null ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                  ) : null}
                  <BrandButton
                    label="Remove counter"
                    variant="ghost"
                    onPress={() => handleDeleteCounter(counter)}
                    style={styles.fullWidth}
                  />
                </View>
              );
            })
          )}
        </View>
        </AppSection>
      </View>

      <AppSection
        title="Work log"
        subtitle="Save short progress notes so you can pick up exactly where you left off.">
        <FormField label="Session title">
          <TextInput
            style={styles.input}
            value={newLogTitle}
            onChangeText={setNewLogTitle}
            placeholder="Session title"
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <FormField label="Minutes spent">
          <TextInput
            style={styles.input}
            value={newLogMinutes}
            onChangeText={setNewLogMinutes}
            placeholder="Minutes spent (optional)"
            placeholderTextColor="#9b867d"
            keyboardType="numeric"
          />
        </FormField>
        <FormField label="Session notes">
          <TextInput
            multiline
            style={[styles.input, styles.logInput]}
            value={newLogBody}
            onChangeText={setNewLogBody}
            placeholder="What did you do, what needs doing next, any mistakes to remember..."
            placeholderTextColor="#9b867d"
          />
        </FormField>
        <View style={styles.quickLogRow}>
          <Pressable onPress={prepareSessionLog} style={styles.quickLogButton}>
            <Text style={styles.quickLogText}>Session</Text>
          </Pressable>
          <Pressable onPress={draftCheckpointLog} style={styles.quickLogButton}>
            <Text style={styles.quickLogText}>Checkpoint</Text>
          </Pressable>
          <Pressable onPress={draftMistakeLog} style={styles.quickLogButton}>
            <Text style={styles.quickLogText}>Fix note</Text>
          </Pressable>
        </View>
        <BrandButton
          label="Save work log entry"
          onPress={() => void handleAddWorkLogEntry()}
          style={styles.fullWidth}
        />

        <View style={styles.stack}>
          {workLogEntries.length === 0 ? (
            <Text style={styles.copy}>No work log yet. Save your first session note here.</Text>
          ) : (
            workLogEntries.map((entry) => (
              <View key={entry.id} style={styles.subCard}>
                <View style={styles.counterHeader}>
                  <View style={styles.counterMeta}>
                    <Text style={styles.counterTitle}>{entry.title}</Text>
                    <Text style={styles.counterHint}>
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Recently'}
                      {workLogMeta(entry) ? ` · ${workLogMeta(entry)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.logType}>{entry.entryType}</Text>
                </View>
                {entry.body ? <Text style={styles.logBody}>{entry.body}</Text> : null}
                <BrandButton
                  label="Delete entry"
                  variant="ghost"
                  onPress={() => handleDeleteWorkLogEntry(entry)}
                  style={styles.fullWidth}
                />
              </View>
            ))
          )}
        </View>
      </AppSection>

      <AppSection
        title="Project management"
        subtitle="Deleting a project removes only this working record. The pattern itself stays safe in Library.">
        <View style={styles.finishCard}>
          <Text style={styles.finishTitle}>
            {activeProject.status === 'completed' ? 'Completed make' : 'Ready to finish?'}
          </Text>
          <Text style={styles.finishCopy}>
            {activeProject.status === 'completed'
              ? 'This project is filed with completed makes. Reopen it if you need to keep working.'
              : 'When the last end is woven in, mark this complete so Workspace and Dashboard know it is done.'}
          </Text>
          <BrandButton
            label={activeProject.status === 'completed' ? 'Reopen project' : 'Mark complete'}
            onPress={
              activeProject.status === 'completed'
                ? () => void handleReopenProject()
                : handleCompleteProject
            }
            style={styles.fullWidth}
            variant={activeProject.status === 'completed' ? 'secondary' : 'ghost'}
          />
          <BrandButton
            label="Ask finishing help"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/chat',
                params: { prompt: finishingPrompt() },
              })
            }
            style={styles.fullWidth}
            variant="ghost"
          />
          <BrandButton
            label="Draft final note"
            onPress={() => {
              setNewLogTitle((current) => current || 'Finished project notes');
              setNewLogBody(
                (current) =>
                  current ||
                  'Finished the project. Add final measurements, care notes, changes made, and anything to remember next time.',
              );
              setNewLogMinutes((current) => current || '15');
              setStatusMessage('Final note drafted in the Work log section.');
            }}
            style={styles.fullWidth}
            variant="ghost"
          />
        </View>
        <BrandButton
          label="Delete project"
          variant="ghost"
          onPress={handleDelete}
          style={styles.fullWidth}
        />
      </AppSection>

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
        visible={showCounterTypeSheet}
        title="Counter type"
        options={counterTypeOptions.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        selectedValue={newCounterType}
        onClose={() => setShowCounterTypeSheet(false)}
        onSelect={(value) => setNewCounterType(value as ProjectCounterType)}
      />
      <DeadlineSheet
        visible={showDeadlineSheet}
        value={draftDeadlineAt}
        onClose={() => setShowDeadlineSheet(false)}
        onConfirm={(value) => {
          setDraftDeadlineAt(value);
          setShowDeadlineSheet(false);
        }}
      />
      </ScrollView>
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(selectedPhoto)}
        onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.photoViewerBackdrop}>
          <Pressable style={styles.photoViewerClose} onPress={() => setSelectedPhoto(null)}>
            <Text style={styles.photoViewerCloseLabel}>Close</Text>
          </Pressable>
          {selectedPhoto ? (
            <View style={styles.photoViewerCard}>
              <NativeImage
                source={{ uri: resolvedPhotoUri(selectedPhoto) ?? selectedPhoto.photoUrl }}
                style={styles.photoViewerImage}
                resizeMode="contain"
              />
              <View style={styles.photoViewerMeta}>
                <Text style={styles.photoViewerTitle}>
                  {selectedPhoto.caption?.trim() || 'Progress photo'}
                </Text>
                <Text style={styles.photoViewerCopy}>
                  {selectedPhoto.takenAt
                    ? new Date(selectedPhoto.takenAt).toLocaleString()
                    : 'Recently added'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent
        visible={showMakingAssistant}
        onRequestClose={() => setShowMakingAssistant(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.makingModalBackdrop}>
          <View style={styles.makingModalCard}>
            <View style={styles.makingModalHeader}>
              <View style={styles.counterMeta}>
                <Text style={styles.companionEyebrow}>Making assistant</Text>
                <Text style={styles.makingModalTitle}>{activeProject.title}</Text>
              </View>
              <Pressable
                onPress={() => setShowMakingAssistant(false)}
                style={styles.makingModalClose}>
                <MaterialCommunityIcons color={tokens.color.primary} name="close" size={20} />
              </Pressable>
            </View>

            <View style={styles.makingQuickActions}>
              <Pressable
                disabled={!linkedPatternId}
                onPress={() => {
                  if (!linkedPatternId) return;
                  setShowMakingAssistant(false);
                  router.push({
                    pathname: '/pattern/[id]',
                    params: { id: linkedPatternId, openFile: '1', projectId: activeProject.id },
                  });
                }}
                style={[
                  styles.makingQuickButton,
                  !linkedPatternId ? styles.makingQuickButtonDisabled : null,
                ]}>
                <MaterialCommunityIcons
                  color={tokens.color.primary}
                  name="book-open-page-variant-outline"
                  size={18}
                />
                <Text style={styles.makingQuickButtonText}>View pattern</Text>
              </Pressable>
              <Pressable
                onPress={() => setMakingChatDraft(stepByStepGuidePrompt)}
                style={styles.makingQuickButton}>
                <MaterialCommunityIcons
                  color={tokens.color.primary}
                  name="format-list-numbered"
                  size={18}
                />
                <Text style={styles.makingQuickButtonText}>Step guide</Text>
              </Pressable>
              <Pressable
                onPress={() => setMakingChatDraft(sessionPlanPrompt())}
                style={styles.makingQuickButton}>
                <MaterialCommunityIcons
                  color={tokens.color.primary}
                  name="clock-check-outline"
                  size={18}
                />
                <Text style={styles.makingQuickButtonText}>Session plan</Text>
              </Pressable>
            </View>

            <View style={styles.makingContextCard}>
              <Text style={styles.makingContextTitle}>Current position</Text>
              <Text style={styles.makingContextCopy}>
                {resumeMark
                  ? `${resumeMark.pageNumber ? `Page ${resumeMark.pageNumber}` : 'Saved place'}${resumeMark.locationLabel ? ` · ${resumeMark.locationLabel}` : ''}${resumeMark.note ? ` · ${resumeMark.note}` : ''}`
                  : 'No reading position saved yet.'}
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={styles.makingMessageList}
              style={styles.makingMessageScroll}>
              {makingChatMessages.length === 0 ? (
                <Text style={styles.copy}>
                  Ask what comes next, check a cuff or sleeve instruction, or send the prepared guide prompt below.
                </Text>
              ) : (
                makingChatMessages.map((message) => (
                  <View
                    key={`${message.id}-${message.createdAt ?? ''}`}
                    style={[
                      styles.makingBubble,
                      message.role === 'user'
                        ? styles.makingUserBubble
                        : styles.makingAssistantBubble,
                    ]}>
                    {message.role === 'user' ? (
                      <Text style={[styles.makingBubbleText, styles.makingUserBubbleText]}>
                        {message.content}
                      </Text>
                    ) : (
                      <RichMarkdownText text={message.content} />
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            {makingChatStatus ? <Text style={styles.statusMessage}>{makingChatStatus}</Text> : null}

            <View style={styles.makingComposer}>
              <TextInput
                multiline
                style={styles.makingInput}
                value={makingChatDraft}
                onChangeText={setMakingChatDraft}
                placeholder="Ask what to do next..."
                placeholderTextColor="#9b867d"
              />
              <Pressable
                disabled={!makingChatDraft.trim() || isMakingChatSending || !linkedPatternId}
                onPress={() => void handleSendMakingAssistant()}
                style={[
                  styles.makingSendButton,
                  !makingChatDraft.trim() || isMakingChatSending || !linkedPatternId
                    ? styles.makingSendButtonDisabled
                    : null,
                ]}>
                <MaterialCommunityIcons color="#fffaf4" name="send" size={20} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Pressable
        onPress={openMakingAssistant}
        style={({ pressed }) => [
          styles.floatingAssistantButton,
          pressed ? styles.floatingAssistantButtonPressed : null,
        ]}>
        <MaterialCommunityIcons color="#fffaf4" name="message-text-outline" size={24} />
    </Pressable>
    </View>
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
  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    backgroundColor: tokens.color.background,
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: 24,
    fontWeight: '700',
  },
  emptyCopy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: tokens.spacing.sm,
  },
  card: {
    padding: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  subCard: {
    backgroundColor: tokens.color.surfaceWarm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  stack: {
    gap: tokens.spacing.sm,
  },
  sectionAnchor: {
    gap: 0,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  presetPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#efe1d3',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  presetPillText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: tokens.type.body,
    lineHeight: 24,
  },
  bannerCard: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  bannerDanger: {
    borderColor: '#efb3a7',
    backgroundColor: '#fff0ec',
  },
  bannerWarning: {
    borderColor: '#ead7b7',
    backgroundColor: '#fff8ec',
  },
  bannerTitle: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '800',
  },
  bannerCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  companionCard: {
    gap: tokens.spacing.md,
  },
  companionEyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  companionTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  sessionCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#fffaf4',
    borderColor: '#dbc3ac',
  },
  restartCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#f2f8f0',
    borderColor: 'rgba(63, 143, 85, 0.22)',
  },
  restartCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  cockpitCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#f4fbfb',
    borderColor: '#c5e1df',
  },
  cockpitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  cockpitStat: {
    width: '48%',
    minHeight: 74,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  cockpitValue: {
    color: tokens.color.text,
    fontSize: 23,
    fontWeight: '900',
  },
  cockpitLabel: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  focusStrip: {
    gap: tokens.spacing.sm,
  },
  focusStripItem: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    gap: 3,
  },
  focusStripLabel: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  focusStripValue: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  cockpitActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  cockpitActionButton: {
    flexGrow: 1,
    minWidth: 136,
  },
  sessionTitle: {
    color: tokens.color.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  sessionChecklist: {
    gap: tokens.spacing.sm,
  },
  sessionChecklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
  },
  sessionChecklistText: {
    flex: 1,
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  setupTask: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
  },
  setupTaskComplete: {
    borderColor: '#bfd5bf',
    backgroundColor: '#f2f8f0',
  },
  setupStatus: {
    width: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupText: {
    flex: 1,
    gap: 4,
  },
  setupTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '800',
  },
  setupCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  setupAction: {
    alignSelf: 'flex-start',
    marginTop: tokens.spacing.xs,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  setupActionText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  sizingPanel: {
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#c5e1df',
    backgroundColor: '#f4fbfb',
    padding: tokens.spacing.md,
  },
  sizingModeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sizingModePill: {
    flex: 1,
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
  fitSummaryGrid: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  fitSummaryCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    justifyContent: 'center',
    gap: 3,
  },
  fitSummaryLabel: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  fitSummaryValue: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
  },
  sizingTwoColumn: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sizingFlexInput: {
    flex: 1,
  },
  sizingFieldLabel: {
    color: tokens.color.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  sizingFieldHelp: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  fitChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  fitChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  fitChipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  fitChipText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  fitChipTextActive: {
    color: '#fff',
  },
  sizingOneSizeCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sizingNotesInput: {
    minHeight: 86,
    paddingTop: tokens.spacing.md,
    textAlignVertical: 'top',
  },
  sizingActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  sizingActionButton: {
    flexGrow: 1,
    minWidth: 136,
  },
  waypointGrid: {
    gap: tokens.spacing.sm,
  },
  waypointCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: 6,
  },
  waypointLabel: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  waypointValue: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  waypointNote: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  markerPreviewList: {
    gap: tokens.spacing.sm,
  },
  markerPreviewRow: {
    minHeight: 62,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  markerPreviewCopy: {
    flex: 1,
    gap: 3,
  },
  markerPreviewTitle: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '900',
  },
  markerPreviewMeta: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  pinIconButton: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metaPill: {
    overflow: 'hidden',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
    backgroundColor: '#efe1d3',
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  simpleHeroStack: {
    gap: tokens.spacing.md,
  },
  heroPatternPreview: {
    minHeight: 118,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: tokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  heroPatternPreviewPressed: {
    opacity: 0.94,
    transform: [{ translateY: 1 }],
  },
  heroPatternPreviewDisabled: {
    opacity: 0.55,
  },
  heroPatternThumbnail: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.large,
    backgroundColor: '#f4eadf',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  heroPatternFallback: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPatternCopy: {
    flex: 1,
    gap: 4,
  },
  heroPatternLabel: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroPatternTitle: {
    color: tokens.color.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  heroPatternAction: {
    color: tokens.color.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  simpleNoticeCard: {
    padding: tokens.spacing.md,
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: tokens.type.title,
    lineHeight: 28,
    fontWeight: '800',
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
  notesInput: {
    minHeight: 144,
    paddingTop: tokens.spacing.md,
    textAlignVertical: 'top',
  },
  quickProgressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  quickProgressButton: {
    flexGrow: 1,
    minWidth: 70,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickProgressText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  logInput: {
    minHeight: 120,
    paddingTop: tokens.spacing.md,
    textAlignVertical: 'top',
  },
  quickLogRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  quickLogButton: {
    flexGrow: 1,
    minWidth: 104,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickLogText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  statusMessage: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  actionList: {
    gap: tokens.spacing.sm,
  },
  projectPhoto: {
    width: '100%',
    aspectRatio: 1.25,
    borderRadius: tokens.radius.large,
    backgroundColor: '#f4eadf',
  },
  photoPressable: {
    width: '100%',
  },
  photoMeta: {
    gap: 4,
  },
  counterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacing.sm,
  },
  counterMeta: {
    flex: 1,
    gap: 4,
  },
  counterTitle: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  counterHint: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
    textTransform: 'capitalize',
  },
  counterValue: {
    color: tokens.color.primary,
    fontSize: 32,
    fontWeight: '800',
  },
  counterSummaryCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(63, 143, 85, 0.22)',
    backgroundColor: '#f2f8f0',
    padding: tokens.spacing.md,
    gap: 4,
  },
  counterSummaryTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '900',
  },
  counterSummaryCopy: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  counterActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  stepperButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  stepperButtonPrimary: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  stepperButtonDisabled: {
    backgroundColor: '#f4ebe3',
    borderColor: '#e4d6c9',
    opacity: 0.65,
  },
  stepperButtonPressed: {
    opacity: 0.94,
    transform: [{ translateY: 1 }],
  },
  stepperLabel: {
    color: tokens.color.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  stepperLabelPrimary: {
    color: tokens.color.surface,
  },
  stepperLabelDisabled: {
    color: '#9b867d',
  },
  progressTrack: {
    height: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#f1e4d6',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
  },
  logType: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  logBody: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 21,
  },
  fullWidth: {
    width: '100%',
  },
  finishCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  finishTitle: {
    color: tokens.color.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900',
  },
  finishCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  photoViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 19, 14, 0.82)',
    padding: tokens.spacing.lg,
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  photoViewerClose: {
    alignSelf: 'flex-end',
    minHeight: 44,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  photoViewerCloseLabel: {
    color: tokens.color.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  photoViewerCard: {
    borderRadius: tokens.radius.xlarge,
    overflow: 'hidden',
    backgroundColor: '#1f1713',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  photoViewerImage: {
    width: '100%',
    aspectRatio: 0.9,
    backgroundColor: '#1f1713',
  },
  photoViewerMeta: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  photoViewerTitle: {
    color: tokens.color.surface,
    fontSize: 18,
    fontWeight: '800',
  },
  photoViewerCopy: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 20,
  },
  patternOverlay: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  patternOverlayHeader: {
    paddingTop: Platform.OS === 'ios' ? 58 : tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  patternOverlayTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  patternOverlayWebView: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  patternOverlayEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  floatingAssistantButton: {
    position: 'absolute',
    right: tokens.spacing.lg,
    bottom: 86,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2f2019',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  floatingAssistantButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  makingModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(47,32,25,0.4)',
  },
  makingModalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  makingModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  makingModalTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  makingModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  makingQuickActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  makingQuickButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
  },
  makingQuickButtonDisabled: {
    opacity: 0.45,
  },
  makingQuickButtonText: {
    color: tokens.color.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  makingContextCard: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
    gap: 4,
  },
  makingContextTitle: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  makingContextCopy: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  makingMessageScroll: {
    maxHeight: 300,
  },
  makingMessageList: {
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  makingBubble: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    padding: tokens.spacing.md,
  },
  makingUserBubble: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  makingAssistantBubble: {
    alignSelf: 'flex-start',
    maxWidth: '96%',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
  },
  makingBubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  makingUserBubbleText: {
    color: '#fffaf4',
    fontWeight: '700',
  },
  makingComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
  },
  makingInput: {
    flex: 1,
    minHeight: 54,
    maxHeight: 132,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  makingSendButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  makingSendButtonDisabled: {
    opacity: 0.45,
  },
});
