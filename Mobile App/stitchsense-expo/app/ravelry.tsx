import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { RavelryPattern, RavelryStatusResponse } from '@/src/lib/models';
import type { StashItem } from '@/src/lib/stash-store';
import { useLibrary } from '@/src/providers/library-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { tokens } from '@/src/theme/tokens';

const modeOptions = [
  { key: 'search', label: 'Search New' },
  { key: 'saved', label: 'My Library' },
] as const;

const craftOptions = ['', 'knitting', 'crochet'] as const;
const weightOptions = ['', 'lace', 'fingering', 'sport', 'dk', 'worsted', 'bulky', 'super-bulky'] as const;
const availabilityOptions = ['', 'free', 'paid'] as const;
const sortOptions = ['', 'popularity', 'created', 'favorites'] as const;

function isRavelryReconnectMessage(message: string) {
  return /authorization expired|reconnect|required|not connected|oauth|token/i.test(message);
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function optionOrEmpty<T extends readonly string[]>(value: string | undefined, options: T): T[number] {
  return options.includes(value ?? '') ? (value as T[number]) : '';
}

function pageSizeFromParam(value: string | string[] | undefined) {
  const parsed = Number(paramValue(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(24, Math.max(1, parsed)) : 24;
}

function fallbackPatternUrl(pattern: RavelryPattern) {
  if (pattern.url?.trim()) {
    return pattern.url.trim();
  }
  return pattern.id ? `https://www.ravelry.com/patterns/library/${encodeURIComponent(pattern.id)}` : '';
}

function extractRavelryIdFromMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return null;

  const directCandidates = [
    metadata.ravelry_id,
    metadata.ravelryId,
    metadata.ravelry_pattern_id,
    metadata.ravelryPatternId,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  const urlCandidates = [metadata.ravelry_url, metadata.ravelryUrl, metadata.source_url, metadata.sourceUrl];

  for (const candidate of urlCandidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const match = candidate.match(/ravelry\.com\/patterns\/library\/([^/?#]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

const patternToolKeys = [
  'needleSizes',
  'needle_sizes',
  'patternNeedleSizes',
  'pattern_needle_sizes',
  'needles',
  'needle',
  'hookSizes',
  'hook_sizes',
  'patternHookSizes',
  'pattern_hook_sizes',
  'hooks',
  'hook',
  'needleHookDetails',
  'needle_hook_details',
];

type ToolCompatibility = {
  score: number;
  label: string;
  detail: string;
};

function recordValue(record: Record<string, unknown> | undefined, key: string) {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function flattenToolText(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 3) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenToolText(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => flattenToolText(entry, depth + 1));
  }
  return [];
}

function extractMillimetres(text: string) {
  const sizes: number[] = [];
  const matcher = /(\d+(?:\.\d+)?)\s*mm\b/gi;
  let match = matcher.exec(text);
  while (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) sizes.push(parsed);
    match = matcher.exec(text);
  }
  return sizes;
}

function uniqueRoundedSizes(sizes: number[]) {
  return [...new Set(sizes.map((size) => Number(size.toFixed(2))))];
}

function patternToolTexts(pattern: RavelryPattern) {
  const raw = pattern.raw;
  return patternToolKeys
    .flatMap((key) => [
      ...flattenToolText(recordValue(pattern as unknown as Record<string, unknown>, key)),
      ...flattenToolText(recordValue(raw, key)),
    ])
    .map((text) => text.trim())
    .filter(Boolean);
}

function stashToolLabel(item: StashItem) {
  return [item.size, item.name, item.material].filter(Boolean).join(' - ') || item.name;
}

function stashToolSizes(item: StashItem) {
  return uniqueRoundedSizes(
    [item.size, item.name, item.material, item.notes].flatMap((value) => (value ? extractMillimetres(value) : [])),
  );
}

function toolCompatibilityForPattern(pattern: RavelryPattern, stashTools: StashItem[]): ToolCompatibility | null {
  if (!stashTools.length) return null;

  const toolTexts = patternToolTexts(pattern);
  const patternSizes = uniqueRoundedSizes(toolTexts.flatMap(extractMillimetres));
  if (!patternSizes.length) return null;

  const matches = stashTools
    .map((item) => {
      const matchedSizes = stashToolSizes(item).filter((toolSize) =>
        patternSizes.some((patternSize) => Math.abs(patternSize - toolSize) <= 0.15),
      );
      return matchedSizes.length ? { item, matchedSizes } : null;
    })
    .filter((entry): entry is { item: StashItem; matchedSizes: number[] } => Boolean(entry));

  if (!matches.length) return null;

  const firstMatch = matches[0];
  const firstSize = firstMatch.matchedSizes[0];
  const extraCount = matches.length - 1;
  return {
    score: matches.length,
    label: extraCount > 0 ? `Matches ${matches.length} saved tools` : `Matches ${firstSize}mm`,
    detail:
      extraCount > 0
        ? `Likely compatible with ${stashToolLabel(firstMatch.item)} and ${extraCount} more.`
        : `Likely compatible with ${stashToolLabel(firstMatch.item)}.`,
  };
}

export default function RavelryScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    craft?: string;
    weight?: string;
    availability?: string;
    sort?: string;
    pageSize?: string;
    autoRun?: string;
    source?: string;
    stashId?: string;
    stashName?: string;
    idea?: string;
  }>();
  const router = useRouter();
  const { accessToken } = useSession();
  const { patterns, refreshPatterns, upsertPattern } = useLibrary();
  const { items: stashItems } = useStash();
  const autoRunKeyRef = useRef('');
  const scrollRef = useRef<ScrollView | null>(null);
  const resultsTopRef = useRef(0);
  const shouldScrollToResultsRef = useRef(false);
  const statusInFlightRef = useRef<Promise<RavelryStatusResponse | null> | null>(null);
  const lastStatusLoadedAtRef = useRef(0);

  const [status, setStatus] = useState<RavelryStatusResponse | null>(null);
  const [mode, setMode] = useState<(typeof modeOptions)[number]['key']>('search');
  const [query, setQuery] = useState(paramValue(params.q) ?? '');
  const [craft, setCraft] = useState<(typeof craftOptions)[number]>(
    optionOrEmpty(paramValue(params.craft), craftOptions),
  );
  const [weight, setWeight] = useState<(typeof weightOptions)[number]>(
    optionOrEmpty(paramValue(params.weight), weightOptions),
  );
  const [availability, setAvailability] = useState<(typeof availabilityOptions)[number]>(
    optionOrEmpty(paramValue(params.availability), availabilityOptions),
  );
  const [sort, setSort] = useState<(typeof sortOptions)[number]>(optionOrEmpty(paramValue(params.sort), sortOptions));
  const [pageSize, setPageSize] = useState(pageSizeFromParam(params.pageSize));
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<RavelryPattern[]>([]);
  const [, setSelectedPattern] = useState<RavelryPattern | null>(null);
  const [accountOverlayOpen, setAccountOverlayOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [, setIsLoadingPattern] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importingPatternId, setImportingPatternId] = useState<string | null>(null);
  const [locallyImportedIds, setLocallyImportedIds] = useState<string[]>([]);
  const [locallyImportedPatternIds, setLocallyImportedPatternIds] = useState<Record<string, string>>({});
  const [lastConnectUrl, setLastConnectUrl] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [lastImportDebug, setLastImportDebug] = useState<string | null>(null);
  const [lastImportedLibraryPatternId, setLastImportedLibraryPatternId] = useState<string | null>(null);
  const [savedAccessIssue, setSavedAccessIssue] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize,
    pageCount: 1,
    totalCount: 0,
    returnedCount: 0,
    hasNext: false,
    hasPrev: false,
  });

  const scrollToResults = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(resultsTopRef.current - tokens.spacing.md, 0),
          animated: true,
        });
      }, 80);
    });
  }, []);

  const loadStatus = useCallback(
    async (force = false) => {
      if (!accessToken) return null;
      const now = Date.now();
      if (!force && status && now - lastStatusLoadedAtRef.current < 30 * 1000) {
        return status;
      }
      if (statusInFlightRef.current) {
        return statusInFlightRef.current;
      }

      const statusPromise = (async () => {
        setIsLoadingStatus(true);
        try {
          const response = await stitchSenseAPI.ravelryStatus(accessToken);
          setStatus(response);
          lastStatusLoadedAtRef.current = Date.now();
          setStatusMessage(null);
          return response;
        } catch (error) {
          setStatusMessage(
            getUserFacingErrorMessage(error, {
              fallback: 'Could not load Ravelry status.',
            }),
          );
          return null;
        } finally {
          setIsLoadingStatus(false);
          statusInFlightRef.current = null;
        }
      })();

      statusInFlightRef.current = statusPromise;
      return statusPromise;
    },
    [accessToken, status],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  useEffect(() => {
    const nextQuery = paramValue(params.q);
    if (nextQuery !== undefined) {
      setQuery(nextQuery);
    }
    setCraft(optionOrEmpty(paramValue(params.craft), craftOptions));
    setWeight(optionOrEmpty(paramValue(params.weight), weightOptions));
    setAvailability(optionOrEmpty(paramValue(params.availability), availabilityOptions));
    setSort(optionOrEmpty(paramValue(params.sort), sortOptions));
    setPageSize(pageSizeFromParam(params.pageSize));
    if (nextQuery) {
      setMode('search');
    }
  }, [params.availability, params.craft, params.pageSize, params.q, params.sort, params.weight]);

  async function runBrowse(
    nextPage = 1,
    nextMode = mode,
    overrides?: {
      query?: string;
      craft?: (typeof craftOptions)[number];
      weight?: (typeof weightOptions)[number];
      availability?: (typeof availabilityOptions)[number];
      sort?: (typeof sortOptions)[number];
      pageSize?: number;
    },
  ) {
    if (!accessToken) return;
    const activeQuery = overrides?.query ?? query;
    const activePageSize = overrides?.pageSize ?? pageSize;
    if (nextMode === 'search' && !activeQuery.trim()) {
      setStatusMessage('Enter a Ravelry search term first.');
      return;
    }

    setIsLoadingResults(true);
    setStatusMessage(null);
    setPage(nextPage);
    try {
      const response =
        nextMode === 'saved'
          ? await stitchSenseAPI.ravelrySaved(accessToken, {
              page: nextPage,
              pageSize: activePageSize,
            })
          : await stitchSenseAPI.ravelrySearch(accessToken, {
              q: activeQuery.trim(),
              page: nextPage,
              pageSize: activePageSize,
              craft: overrides?.craft ?? craft,
              weight: overrides?.weight ?? weight,
              availability: overrides?.availability ?? availability,
              sort: overrides?.sort ?? sort,
            });
      setResults(response.patterns);
      setPagination(response.pagination);
      setSelectedPattern(response.patterns[0] ?? null);
      if (response.patterns.length > 0) {
        shouldScrollToResultsRef.current = true;
        if (resultsTopRef.current > 0) {
          scrollToResults();
        }
      }
      if (nextMode === 'saved') {
        setSavedAccessIssue(null);
      }
    } catch (error) {
      const message = getUserFacingErrorMessage(error, {
        fallback: 'Ravelry request failed.',
      });
      setStatusMessage(message);
      if (nextMode === 'saved' && isRavelryReconnectMessage(message)) {
        setSavedAccessIssue(message);
      }
    } finally {
      setIsLoadingResults(false);
    }
  }

  useEffect(() => {
    const requestedQuery = paramValue(params.q);
    if (!accessToken || params.autoRun !== '1' || !requestedQuery?.trim()) {
      return;
    }

    const key = JSON.stringify({
      q: requestedQuery,
      craft: paramValue(params.craft) ?? '',
      weight: paramValue(params.weight) ?? '',
      availability: paramValue(params.availability) ?? '',
      sort: paramValue(params.sort) ?? '',
      pageSize: paramValue(params.pageSize) ?? '',
    });
    if (autoRunKeyRef.current === key) {
      return;
    }
    autoRunKeyRef.current = key;
    void runBrowse(1, 'search', {
      query: requestedQuery,
      craft: optionOrEmpty(paramValue(params.craft), craftOptions),
      weight: optionOrEmpty(paramValue(params.weight), weightOptions),
      availability: optionOrEmpty(paramValue(params.availability), availabilityOptions),
      sort: optionOrEmpty(paramValue(params.sort), sortOptions),
      pageSize: pageSizeFromParam(params.pageSize),
    });
    // The parameter snapshot above fully specifies this one-shot deep-link search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    params.autoRun,
    params.availability,
    params.craft,
    params.pageSize,
    params.q,
    params.sort,
    params.weight,
  ]);

  async function loadPattern(id: string) {
    if (!accessToken) return;
    setIsLoadingPattern(true);
    try {
      const response = await stitchSenseAPI.ravelryPattern(accessToken, id);
      setSelectedPattern(response.pattern);
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not load pattern details.',
        }),
      );
    } finally {
      setIsLoadingPattern(false);
    }
  }

  async function connectRavelry() {
    if (!accessToken) return;
    try {
      const response = await stitchSenseAPI.ravelryConnectUrl(accessToken);
      if (!response.url) {
        setStatusMessage('Ravelry could not provide a connection URL yet.');
        Alert.alert('Ravelry connect not ready', 'The shared API did not return a Ravelry authorisation URL yet.');
        return;
      }
      setLastConnectUrl(response.url);
      setStatusMessage('Opening Ravelry sign-in…');
      try {
        await WebBrowser.openBrowserAsync(response.url);
      } catch {
        await Linking.openURL(response.url);
      }
      setStatusMessage('Checking Ravelry connection…');

      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        const latest = await loadStatus(true);
        if (latest?.connected) {
          setStatusMessage(latest.username ? `Ravelry connected as ${latest.username}.` : 'Ravelry connected.');
          setSavedAccessIssue(null);
          return;
        }
      }

      setStatusMessage('Ravelry sign-in opened. If you approved access, tap Refresh status in a moment.');
    } catch (error) {
      const message = getUserFacingErrorMessage(error, {
        fallback: 'Could not open Ravelry connect flow.',
      });
      setStatusMessage(message);
      Alert.alert('Ravelry connection problem', message);
    }
  }

  async function reopenLastConnectUrl() {
    if (!lastConnectUrl) {
      setStatusMessage('No recent Ravelry authorisation link is available yet.');
      return;
    }

    try {
      await Linking.openURL(lastConnectUrl);
      setStatusMessage('Re-opened the last Ravelry authorisation link.');
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not re-open the Ravelry authorisation link.',
        }),
      );
    }
  }

  async function disconnectRavelry() {
    if (!accessToken) return;
    try {
      await stitchSenseAPI.ravelryDisconnect(accessToken);
      setStatusMessage('Ravelry disconnected.');
      setResults([]);
      setSelectedPattern(null);
      setSavedAccessIssue(null);
      await loadStatus(true);
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not disconnect Ravelry.',
        }),
      );
    }
  }

  async function changeRavelryAccount() {
    if (!accessToken) return;
    Alert.alert(
      'Change Ravelry account?',
      'This disconnects the current Ravelry account on StitchSense, then opens Ravelry authorisation again. If Ravelry reuses the same browser login, sign out of Ravelry in the browser first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change account',
          onPress: async () => {
            try {
              await stitchSenseAPI.ravelryDisconnect(accessToken);
              setStatus(null);
              setResults([]);
              setSelectedPattern(null);
              setSavedAccessIssue(null);
              await loadStatus(true);
              await connectRavelry();
            } catch (error) {
              setStatusMessage(
                getUserFacingErrorMessage(error, {
                  fallback: 'Could not start the Ravelry account change flow.',
                }),
              );
            }
          },
        },
      ],
    );
  }

  async function importPattern(pattern: RavelryPattern) {
    if (!accessToken) return;
    const existingLibraryPatternId =
      patterns.find((candidate) => extractRavelryIdFromMetadata(candidate.metadata) === pattern.id)?.id ??
      locallyImportedPatternIds[pattern.id];
    setIsImporting(true);
    setImportingPatternId(pattern.id);
    try {
      const response = await stitchSenseAPI.ravelryImport(accessToken, {
        id: pattern.id,
        libraryPatternId: existingLibraryPatternId,
        pattern: pattern.raw ?? (pattern as unknown as Record<string, unknown>),
      });
      setLocallyImportedIds((current) => (current.includes(pattern.id) ? current : [...current, pattern.id]));
      if (response.pattern) {
        upsertPattern(response.pattern);
      }
      void refreshPatterns();

      let matchedImportedPattern = response.pattern ?? null;

      if (matchedImportedPattern) {
        upsertPattern(matchedImportedPattern);
        setLocallyImportedPatternIds((current) => ({
          ...current,
          [pattern.id]: matchedImportedPattern.id,
        }));
        setLastImportedLibraryPatternId(matchedImportedPattern.id);
      }

      setLastImportDebug(
        [
          `requested=${pattern.id}`,
          `operation=${existingLibraryPatternId ? 're-import' : 'import'}`,
          `responsePattern=${response.pattern ? 'yes' : 'no'}`,
          `responseId=${response.id ?? 'none'}`,
          `matchedLibrary=${matchedImportedPattern ? 'yes' : 'no'}`,
          `analysis=${response.analysisSucceeded ? 'yes' : 'no'}`,
          response.downloadError ? `downloadError=${response.downloadError}` : null,
          response.analysisError ? `analysisError=${response.analysisError}` : null,
          typeof (response as Record<string, unknown>).visibilityWarning === 'string'
            ? `visibilityWarning=${String((response as Record<string, unknown>).visibilityWarning)}`
            : null,
          typeof (response as Record<string, unknown>).syncWarning === 'string'
            ? `syncWarning=${String((response as Record<string, unknown>).syncWarning)}`
            : null,
        ]
          .filter(Boolean)
          .join(' | '),
      );

      setStatusMessage(
        !matchedImportedPattern
          ? 'Import request succeeded, but the pattern did not come back into the live library list yet. See the import debug line below.'
          : typeof (response as Record<string, unknown>).visibilityWarning === 'string'
            ? String((response as Record<string, unknown>).visibilityWarning)
            : response.analysisSucceeded
              ? existingLibraryPatternId
                ? 'Ravelry pattern re-imported and summarised.'
                : 'Ravelry pattern imported and summarised.'
              : response.downloadError
                ? `${existingLibraryPatternId ? 'Re-imported' : 'Imported'} with a PDF issue: ${response.downloadError}`
                : existingLibraryPatternId
                  ? 'Ravelry pattern updated in your library.'
                  : 'Ravelry pattern imported to your library.',
      );
    } catch (error) {
      const message = getUserFacingErrorMessage(error, {
        fallback: 'Ravelry import failed.',
      });
      setLastImportDebug(`requested=${pattern.id} | failed=${message}`);
      setStatusMessage(message);
    } finally {
      setIsImporting(false);
      setImportingPatternId(null);
    }
  }

  async function importShown() {
    if (!results.length) return;
    Alert.alert(
      'Import shown patterns?',
      `Import ${results.length} pattern${results.length === 1 ? '' : 's'} from this page into your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            for (const pattern of results) {
              // keep this sequential to avoid hammering the bridge workflow
              // and to stay consistent with the web import rhythm
              await importPattern(pattern);
            }
          },
        },
      ],
    );
  }

  async function openRavelryListing(pattern: RavelryPattern) {
    const url = fallbackPatternUrl(pattern);
    if (!url) {
      setStatusMessage('No Ravelry listing URL is available for this pattern yet.');
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      await Linking.openURL(url);
    }
  }

  const importedRavelryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pattern of patterns) {
      const ravelryId = extractRavelryIdFromMetadata(pattern.metadata);
      if (ravelryId) {
        ids.add(ravelryId);
      }
    }
    for (const importedId of locallyImportedIds) {
      ids.add(importedId);
    }
    return ids;
  }, [locallyImportedIds, patterns]);
  const stashNeedleHookTools = useMemo(
    () => stashItems.filter((item) => item.category === 'needle-hook'),
    [stashItems],
  );
  const toolCompatibilityByPatternId = useMemo(() => {
    return new Map(results.map((pattern) => [pattern.id, toolCompatibilityForPattern(pattern, stashNeedleHookTools)]));
  }, [results, stashNeedleHookTools]);
  const rankedResults = useMemo(() => {
    return [...results].sort((left, right) => {
      const rightScore = toolCompatibilityByPatternId.get(right.id)?.score ?? 0;
      const leftScore = toolCompatibilityByPatternId.get(left.id)?.score ?? 0;
      return rightScore - leftScore;
    });
  }, [results, toolCompatibilityByPatternId]);

  const activeFilterSummary = [
    craft ? `Craft: ${formatFilterValue(craft)}` : null,
    weight ? `Weight: ${formatFilterValue(weight)}` : null,
    availability ? `Price: ${formatFilterValue(availability)}` : null,
    sort ? `Sort: ${formatFilterValue(sort)}` : null,
  ].filter((item): item is string => Boolean(item));
  const sourceFromStash = paramValue(params.source) === 'stash';
  const stashId = paramValue(params.stashId);
  const stashName = paramValue(params.stashName);
  const ideaName = paramValue(params.idea);
  const projectLaunchParams = useCallback(
    (libraryPatternId: string) => ({
      patternId: libraryPatternId,
      ...(sourceFromStash
        ? {
            ...(stashId ? { stashId } : {}),
            ...(stashName ? { stashName } : {}),
            ...(ideaName ? { stashIdea: ideaName } : {}),
          }
        : {}),
    }),
    [ideaName, sourceFromStash, stashId, stashName],
  );

  function importedLibraryPatternId(ravelryId: string) {
    return (
      patterns.find((candidate) => extractRavelryIdFromMetadata(candidate.metadata) === ravelryId)?.id ??
      locallyImportedPatternIds[ravelryId] ??
      null
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} style={styles.screen}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>Search and import patterns</Text>
              <Text style={styles.copy}>
                Connect your Ravelry account, browse saved patterns, and import them into the same shared StitchSense
                library used by the web app.
              </Text>
            </View>
            <View style={styles.ravelryIconWrap}>
              <Text style={styles.ravelryIconText}>r</Text>
            </View>
          </View>
          <BrandButton
            label="Ravelry Account"
            onPress={() => setAccountOverlayOpen(true)}
            style={styles.fullWidth}
            variant="ghost"
          />
          {statusMessage ? <Text style={styles.statusBanner}>{statusMessage}</Text> : null}
          {lastImportDebug ? <Text style={styles.debugBanner}>{lastImportDebug}</Text> : null}
        </View>

        {sourceFromStash ? (
          <View style={styles.ideaContextCard}>
            <Text style={styles.ideaContextEyebrow}>From Stash</Text>
            <Text style={styles.ideaContextTitle}>
              {ideaName ? `Patterns for ${ideaName}` : 'Compatible pattern ideas'}
            </Text>
            <Text style={styles.ideaContextCopy}>
              {stashName
                ? `Searching Ravelry for likely matches using ${stashName}. Import a pattern, then start a project and keep the stash details attached.`
                : 'Import a pattern, then start a project from the result.'}
            </Text>
            {lastImportedLibraryPatternId ? (
              <BrandButton
                label="Start project from imported pattern"
                onPress={() =>
                  router.push({
                    pathname: '/project/new',
                    params: projectLaunchParams(lastImportedLibraryPatternId),
                  })
                }
                style={styles.fullWidth}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Browse</Text>
          {status?.connected ? (
            <Text style={styles.meta}>
              Connected{status.username ? ` as ${status.username}` : ''}. Search is ready.
            </Text>
          ) : null}
          <View style={styles.modeRow}>
            {modeOptions.map((option) => {
              const active = mode === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    setMode(option.key);
                    setResults([]);
                    setSelectedPattern(null);
                    setPage(1);
                    if (option.key === 'saved') {
                      void runBrowse(1, 'saved');
                    }
                  }}
                  style={({ pressed }) => [
                    styles.modePill,
                    active ? styles.modePillActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={[styles.modeLabel, active ? styles.modeLabelActive : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {mode === 'search' ? (
            <>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                blurOnSubmit
                onChangeText={setQuery}
                onSubmitEditing={() => void runBrowse(1)}
                placeholder="Sweater, socks, shawl..."
                placeholderTextColor="#9b867d"
                returnKeyType="search"
                style={styles.input}
                value={query}
              />
              <View style={styles.filterGrid}>
                <FilterSelect
                  label="Craft"
                  options={craftOptions}
                  value={craft}
                  onChange={setCraft}
                  expanded={openFilter === 'craft'}
                  onToggle={() => setOpenFilter((current) => (current === 'craft' ? null : 'craft'))}
                />
                <FilterSelect
                  label="Weight"
                  options={weightOptions}
                  value={weight}
                  onChange={setWeight}
                  expanded={openFilter === 'weight'}
                  onToggle={() => setOpenFilter((current) => (current === 'weight' ? null : 'weight'))}
                />
                <FilterSelect
                  label="Price"
                  options={availabilityOptions}
                  value={availability}
                  onChange={setAvailability}
                  expanded={openFilter === 'availability'}
                  onToggle={() => setOpenFilter((current) => (current === 'availability' ? null : 'availability'))}
                />
                <FilterSelect
                  label="Sort"
                  options={sortOptions}
                  value={sort}
                  onChange={setSort}
                  expanded={openFilter === 'sort'}
                  onToggle={() => setOpenFilter((current) => (current === 'sort' ? null : 'sort'))}
                />
              </View>
              {activeFilterSummary.length ? (
                <View style={styles.activeFilterRow}>
                  {activeFilterSummary.map((filterLabel) => (
                    <View key={filterLabel} style={styles.activeFilterPill}>
                      <Text style={styles.activeFilterText}>{filterLabel}</Text>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      setCraft('');
                      setWeight('');
                      setAvailability('');
                      setSort('');
                    }}
                    style={styles.clearFiltersButton}
                  >
                    <Text style={styles.clearFiltersText}>Clear filters</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.savedModeHelp}>
              <Text style={styles.meta}>
                Patterns saved in your Ravelry library load automatically from your connected personal account.
              </Text>
              {isLoadingResults ? <ActivityIndicator color={tokens.color.primary} /> : null}
            </View>
          )}

          {mode === 'search' || results.length > 0 ? (
            <View style={styles.actionStack}>
              {mode === 'search' ? (
                <BrandButton
                  label={isLoadingResults ? 'Loading…' : 'Search Ravelry'}
                  onPress={() => void runBrowse(1)}
                  loading={isLoadingResults}
                  style={styles.fullWidth}
                />
              ) : null}
              {results.length > 0 ? (
                <BrandButton
                  label="Import shown"
                  onPress={() => void importShown()}
                  style={styles.fullWidth}
                  variant="ghost"
                />
              ) : null}
            </View>
          ) : null}
          {results.length > 0 ? (
            <Text style={styles.meta}>
              Showing {pagination.returnedCount || results.length} of {pagination.totalCount || results.length} result
              {(pagination.totalCount || results.length) === 1 ? '' : 's'}.
            </Text>
          ) : null}
        </View>

        {results.length > 0 ? (
          <View
            onLayout={(event) => {
              resultsTopRef.current = event.nativeEvent.layout.y;
              if (shouldScrollToResultsRef.current) {
                shouldScrollToResultsRef.current = false;
                scrollToResults();
              }
            }}
            style={styles.card}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Results</Text>
              <Text style={styles.meta}>
                Page {pagination.page}
                {pagination.pageCount > 1 ? ` of ${pagination.pageCount}` : ''}
              </Text>
            </View>
            <View style={styles.list}>
              {rankedResults.map((pattern) => {
                const toolCompatibility = toolCompatibilityByPatternId.get(pattern.id);
                return (
                  <View
                    key={pattern.id}
                    style={[
                      styles.resultCard,
                      importedRavelryIds.has(pattern.id) ? styles.importedResultCard : null,
                      toolCompatibility ? styles.compatibleResultCard : null,
                    ]}
                  >
                    <View style={styles.resultHeaderRow}>
                      <View style={styles.resultThumbnailShell}>
                        {pattern.thumbnailUrl ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: pattern.thumbnailUrl }}
                            style={styles.resultThumbnail}
                          />
                        ) : (
                          <View style={styles.resultThumbnailFallback}>
                            <Text style={styles.resultThumbnailFallbackEyebrow}>Ravelry</Text>
                            <Text style={styles.resultThumbnailFallbackLabel}>
                              {(pattern.craftType || 'Pattern').trim()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.resultContent}>
                        <Text onPress={() => void loadPattern(pattern.id)} style={styles.resultTitle}>
                          {pattern.title}
                        </Text>
                        <Text style={styles.resultMeta}>
                          {pattern.designer ? `by ${pattern.designer}` : 'Ravelry pattern'}
                        </Text>
                        <View style={styles.tagRow}>
                          {pattern.craftType ? (
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>{pattern.craftType.toUpperCase()}</Text>
                            </View>
                          ) : null}
                          {pattern.availability ? (
                            <View style={[styles.badge, styles.sourceBadge]}>
                              <Text style={[styles.badgeText, styles.sourceBadgeText]}>
                                {pattern.availability.toUpperCase()}
                              </Text>
                            </View>
                          ) : null}
                          {toolCompatibility ? (
                            <View style={[styles.badge, styles.toolMatchBadge]}>
                              <Text style={[styles.badgeText, styles.toolMatchBadgeText]}>
                                {toolCompatibility.label.toUpperCase()}
                              </Text>
                            </View>
                          ) : null}
                          {importedRavelryIds.has(pattern.id) ? (
                            <View style={[styles.badge, styles.importedBadge]}>
                              <Text style={[styles.badgeText, styles.importedBadgeText]}>IMPORTED</Text>
                            </View>
                          ) : null}
                        </View>
                        {toolCompatibility ? (
                          <Text style={styles.compatibilityDetail}>{toolCompatibility.detail}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.resultActions}>
                      <BrandButton
                        label="Preview"
                        onPress={() => void openRavelryListing(pattern)}
                        style={styles.fullWidth}
                        variant="ghost"
                      />
                      <BrandButton
                        disabled={isImporting}
                        label={
                          isImporting && importingPatternId === pattern.id
                            ? 'Importing…'
                            : importedRavelryIds.has(pattern.id)
                              ? 'Re-import'
                              : 'Import'
                        }
                        onPress={() => void importPattern(pattern)}
                        style={styles.fullWidth}
                        variant={importedRavelryIds.has(pattern.id) ? 'success' : 'primary'}
                      />
                      {importedLibraryPatternId(pattern.id) ? (
                        <>
                          <BrandButton
                            label="Open in library"
                            onPress={() =>
                              router.push({
                                pathname: '/pattern/[id]',
                                params: {
                                  id: importedLibraryPatternId(pattern.id) ?? '',
                                },
                              })
                            }
                            style={styles.fullWidth}
                            variant="ghost"
                          />
                          <BrandButton
                            label="Start project"
                            onPress={() =>
                              router.push({
                                pathname: '/project/new',
                                params: projectLaunchParams(importedLibraryPatternId(pattern.id) ?? ''),
                              })
                            }
                            style={styles.fullWidth}
                            variant="secondary"
                          />
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
            {mode === 'saved' && (!status?.connected || savedAccessIssue) ? (
              <View style={styles.savedResultsActions}>
                <BrandButton
                  label="Reconnect saved patterns"
                  onPress={() => void connectRavelry()}
                  style={styles.fullWidth}
                  variant="secondary"
                />
                <BrandButton
                  label="Change account"
                  onPress={() => void changeRavelryAccount()}
                  style={styles.fullWidth}
                  variant="ghost"
                />
              </View>
            ) : null}
            <View style={styles.paginationRow}>
              <BrandButton
                label="Previous"
                disabled={!pagination.hasPrev}
                onPress={() => void runBrowse(page - 1)}
                style={styles.paginationButton}
                variant="ghost"
              />
              <BrandButton
                label="Next"
                disabled={!pagination.hasNext}
                onPress={() => void runBrowse(page + 1)}
                style={styles.paginationButton}
                variant="ghost"
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setAccountOverlayOpen(false)}
        transparent
        visible={accountOverlayOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.accountModalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.eyebrow}>Ravelry account</Text>
                <Text style={styles.sectionTitle}>Connection</Text>
              </View>
              <Pressable
                accessibilityLabel="Close Ravelry account"
                accessibilityRole="button"
                onPress={() => setAccountOverlayOpen(false)}
                style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>
            {isLoadingStatus ? <ActivityIndicator color={tokens.color.primary} /> : null}
            <View style={styles.accountStatusCard}>
              <Text style={styles.accountStatusLabel}>Connected account</Text>
              <Text style={styles.accountStatusValue}>
                {status?.connected ? status.username || 'Connected account' : 'Not connected'}
              </Text>
              {status?.tokenExpires ? (
                <Text style={styles.accountStatusMeta}>Token expires: {status.tokenExpires}</Text>
              ) : null}
            </View>
            {savedAccessIssue ? <Text style={styles.warning}>{savedAccessIssue}</Text> : null}
            {status?.apiWarning ? <Text style={styles.warning}>{status.apiWarning}</Text> : null}
            {status?.apiError ? <Text style={styles.warning}>{status.apiError}</Text> : null}
            <View style={styles.actionStack}>
              <BrandButton
                label={status?.connected ? 'Reconnect Ravelry' : 'Connect Ravelry'}
                onPress={() => void connectRavelry()}
                style={styles.fullWidth}
              />
              {status?.connected ? (
                <BrandButton
                  label="Change Ravelry account"
                  onPress={() => void changeRavelryAccount()}
                  style={styles.fullWidth}
                  variant="secondary"
                />
              ) : null}
              {lastConnectUrl ? (
                <BrandButton
                  label="Open last Ravelry link again"
                  onPress={() => void reopenLastConnectUrl()}
                  style={styles.fullWidth}
                  variant="ghost"
                />
              ) : null}
              <BrandButton
                label="Refresh status"
                onPress={() => void loadStatus()}
                style={styles.fullWidth}
                variant={lastConnectUrl ? 'secondary' : 'ghost'}
              />
              {status?.connected ? (
                <BrandButton
                  label="Disconnect"
                  onPress={() => void disconnectRavelry()}
                  style={styles.fullWidth}
                  variant="secondary"
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatFilterValue(option?: string | null) {
  const safeOption = option ?? '';
  if (safeOption === '') {
    return 'Any';
  }
  return safeOption.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
  expanded,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  value?: string | null;
  onChange: (next: any) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const selectedValue = value ?? '';
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable onPress={onToggle} style={styles.selectButton}>
        <Text style={styles.selectButtonText}>{formatFilterValue(selectedValue)}</Text>
        <Text style={styles.selectButtonChevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.selectMenu}>
          {options.map((option) => {
            const active = selectedValue === option;
            return (
              <Pressable
                key={`${label}-${option || 'any'}`}
                onPress={() => {
                  onChange(option);
                  onToggle();
                }}
                style={[styles.selectOption, active ? styles.selectOptionActive : null]}
              >
                <Text style={[styles.selectOptionText, active ? styles.selectOptionTextActive : null]}>
                  {formatFilterValue(option)}
                </Text>
              </Pressable>
            );
          })}
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
    paddingBottom: tokens.spacing.xl,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  card: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  heroCard: {
    backgroundColor: 'rgba(255, 253, 250, 0.7)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 26,
    borderWidth: 1,
    gap: tokens.spacing.lg,
    overflow: 'hidden',
    padding: tokens.spacing.xl,
  },
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    gap: tokens.spacing.sm,
    minWidth: 0,
  },
  ravelryIconWrap: {
    alignItems: 'center',
    backgroundColor: '#f1695f',
    borderColor: 'rgba(255, 253, 250, 0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 54,
  },
  ravelryIconText: {
    color: tokens.color.surface,
    fontFamily: tokens.font.body,
    fontSize: 39,
    fontWeight: '900',
    lineHeight: 42,
    marginTop: -2,
  },
  ideaContextCard: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  ideaContextEyebrow: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  ideaContextTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    lineHeight: 29,
  },
  ideaContextCopy: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 19,
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
  },
  copy: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 19,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  sectionTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    lineHeight: 29,
  },
  statusBanner: {
    color: tokens.color.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  debugBanner: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    lineHeight: 18,
  },
  meta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    lineHeight: 19,
  },
  warning: {
    color: tokens.color.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  accountStatusCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  accountStatusLabel: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  accountStatusValue: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 22,
    lineHeight: 27,
  },
  accountStatusMeta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    lineHeight: 17,
  },
  savedModeHelp: {
    gap: tokens.spacing.sm,
  },
  savedModeActions: {
    gap: tokens.spacing.sm,
  },
  savedResultsActions: {
    borderTopColor: 'rgba(20, 63, 54, 0.08)',
    borderTopWidth: 1,
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.md,
  },
  actionStack: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  fullWidth: {
    width: '100%',
  },
  input: {
    minHeight: tokens.component.controlHeight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.13)',
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    fontFamily: tokens.font.body,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  modeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  modePill: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    backgroundColor: 'rgba(255, 253, 250, 0.82)',
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: tokens.spacing.md,
  },
  modePillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  modeLabel: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 14,
    fontWeight: '900',
  },
  modeLabelActive: {
    color: '#fff',
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  activeFilterPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(104, 64, 42, 0.1)',
    backgroundColor: '#f7eee5',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  activeFilterText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  clearFiltersButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  clearFiltersText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 12,
    fontWeight: '800',
  },
  filterWrap: {
    gap: tokens.spacing.md,
  },
  filterGrid: {
    gap: tokens.spacing.md,
  },
  filterGroup: {
    gap: tokens.spacing.xs,
    zIndex: 5,
  },
  filterLabel: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  selectButton: {
    minHeight: tokens.component.controlHeight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.13)',
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 15,
    fontWeight: '800',
  },
  selectButtonChevron: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  selectMenu: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    overflow: 'hidden',
  },
  selectOption: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(104, 64, 42, 0.08)',
  },
  selectOptionActive: {
    backgroundColor: '#eef9ef',
  },
  selectOptionText: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 14,
    textTransform: 'capitalize',
  },
  selectOptionTextActive: {
    color: tokens.color.success,
    fontWeight: '700',
  },
  list: {
    gap: tokens.spacing.sm,
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  importedResultCard: {
    backgroundColor: '#eef9ef',
    borderColor: 'rgba(63, 143, 85, 0.24)',
  },
  compatibleResultCard: {
    borderColor: 'rgba(47, 125, 90, 0.36)',
  },
  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  resultThumbnailShell: {
    width: 108,
    aspectRatio: 0.82,
    borderRadius: tokens.radius.medium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fff8f0',
    flexShrink: 0,
  },
  resultThumbnail: {
    width: '100%',
    height: '100%',
  },
  resultThumbnailFallback: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: tokens.spacing.sm,
    backgroundColor: '#f6ede4',
  },
  resultThumbnailFallbackEyebrow: {
    color: tokens.color.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultThumbnailFallbackLabel: {
    color: tokens.color.primary,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: tokens.spacing.xs,
    textTransform: 'capitalize',
  },
  resultContent: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  resultTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 20,
    lineHeight: 24,
  },
  resultMeta: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 13,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#efe1d3',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  badgeText: {
    color: tokens.color.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  sourceBadge: {
    backgroundColor: '#edf7f6',
  },
  sourceBadgeText: {
    color: '#2d7478',
  },
  importedBadge: {
    backgroundColor: '#e7f4eb',
  },
  importedBadgeText: {
    color: tokens.color.success,
  },
  toolMatchBadge: {
    backgroundColor: '#e6f4ea',
  },
  toolMatchBadgeText: {
    color: tokens.color.primary,
  },
  compatibilityDetail: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  signalPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fffaf4',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(104, 64, 42, 0.1)',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  signalText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 11,
    fontWeight: '800',
  },
  resultActions: {
    gap: tokens.spacing.sm,
  },
  paginationRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  paginationButton: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 63, 54, 0.28)',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  accountModalCard: {
    backgroundColor: tokens.color.surface,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 26,
    borderWidth: 1,
    gap: tokens.spacing.md,
    maxHeight: '88%',
    padding: tokens.spacing.lg,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'space-between',
  },
  modalHeaderCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.primary,
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  closeButtonText: {
    color: tokens.color.surface,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
  },
  pressed: {
    opacity: 0.78,
  },
});
