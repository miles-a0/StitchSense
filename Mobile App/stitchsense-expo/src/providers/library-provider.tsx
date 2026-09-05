import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { clearLibraryCache, loadLibraryCache, saveLibraryCache } from '@/src/lib/library-cache';
import { buildPatternThumbnailUrl, stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { Pattern, WordPressSyncStatus } from '@/src/lib/models';
import { useSession } from '@/src/providers/session-provider';

type LibraryContextValue = {
  patterns: Pattern[];
  isLoading: boolean;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  syncStatus: WordPressSyncStatus | null;
  isSyncingWordPress: boolean;
  syncMessage: string | null;
  upsertPattern: (pattern: Pattern) => void;
  removePattern: (patternId: string) => void;
  clearLibrary: () => Promise<void>;
  refreshPatterns: () => Promise<void>;
  refreshSyncStatus: () => Promise<void>;
  syncFromWordPress: () => Promise<void>;
  syncFromWordPressIfNeeded: () => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: React.PropsWithChildren) {
  const { accessToken, user } = useSession();
  const userId = user?.id;
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<WordPressSyncStatus | null>(null);
  const [isSyncingWordPress, setIsSyncingWordPress] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncInFlightRef = useRef(false);
  const automaticSyncCheckRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const hasCachedPatternsRef = useRef(false);
  const lastAutomaticSyncCheckAtRef = useRef(0);
  const syncStatusRef = useRef<WordPressSyncStatus | null>(null);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  const decoratePatterns = useCallback(
    (nextPatterns: Pattern[]) => {
      if (!accessToken) {
        return nextPatterns;
      }

      return nextPatterns.map((pattern) => {
        const fileMimeType = (pattern.fileMimeType ?? '').toLowerCase();
        const originalFilename = pattern.originalFilename ?? '';
        const isPdf = fileMimeType.includes('pdf') || /\.pdf$/i.test(originalFilename);
        const hasRemoteThumbnail =
          typeof pattern.thumbnailUrl === 'string' &&
          (/^https?:\/\//i.test(pattern.thumbnailUrl) || /^data:image\//i.test(pattern.thumbnailUrl));
        const hasProtectedGeneratedThumbnail =
          typeof pattern.thumbnailUrl === 'string' &&
          pattern.thumbnailUrl.includes(`/patterns/${encodeURIComponent(pattern.id)}/thumbnail`);

        if (!isPdf || (hasRemoteThumbnail && !hasProtectedGeneratedThumbnail)) {
          return pattern;
        }

        return {
          ...pattern,
          thumbnailUrl: buildPatternThumbnailUrl(pattern.id, accessToken, pattern.updatedAt ?? null),
        };
      });
    },
    [accessToken],
  );

  const mergePatterns = useCallback((nextPatterns: Pattern[]) => {
    return [...nextPatterns].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
  }, []);

  const upsertPattern = useCallback(
    (pattern: Pattern) => {
      setPatterns((current) => mergePatterns([pattern, ...current.filter((existing) => existing.id !== pattern.id)]));
    },
    [mergePatterns],
  );

  const removePattern = useCallback((patternId: string) => {
    setPatterns((current) => current.filter((pattern) => pattern.id !== patternId));
  }, []);

  const clearLibrary = useCallback(async () => {
    setPatterns([]);
    setErrorMessage(null);
    setLastSyncedAt(null);
    setSyncStatus(null);
    setSyncMessage(null);

    if (user?.id) {
      await clearLibraryCache(user.id);
    }
  }, [user?.id]);

  const refreshSyncStatus = useCallback(async () => {
    if (!accessToken) {
      setSyncStatus(null);
      return;
    }

    try {
      const status = await stitchSenseAPI.syncStatus(accessToken);
      setSyncStatus(status);
    } catch (error) {
      setSyncMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'Could not load sync status.',
        }),
      );
    }
  }, [accessToken]);

  const refreshPatterns = useCallback(async () => {
    if (!accessToken) {
      setPatterns([]);
      setLastSyncedAt(null);
      setSyncStatus(null);
      syncStatusRef.current = null;
      hasCachedPatternsRef.current = false;
      return;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      if (!hasCachedPatternsRef.current) {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const nextPatterns = await stitchSenseAPI.patterns(accessToken);
        const cachedPatterns = nextPatterns.map((pattern) => ({
          ...pattern,
          activityCounts: {
            chats: pattern.activityCounts?.chats ?? 0,
            rewrites: pattern.activityCounts?.rewrites ?? 0,
          },
        }));
        const patternsForLibrary = decoratePatterns(cachedPatterns).map((pattern) => ({
          ...pattern,
          activityCounts: {
            chats: pattern.activityCounts?.chats ?? 0,
            rewrites: pattern.activityCounts?.rewrites ?? 0,
          },
        }));
        setPatterns(mergePatterns(patternsForLibrary));
        hasCachedPatternsRef.current = patternsForLibrary.length > 0;
        const nextLastSyncedAt = new Date().toISOString();
        setLastSyncedAt(nextLastSyncedAt);
        if (user?.id) {
          await saveLibraryCache(user.id, {
            patterns: cachedPatterns,
            lastSyncedAt: nextLastSyncedAt,
            syncStatus: syncStatusRef.current,
          });
        }
      } catch (error) {
        setErrorMessage(
          getUserFacingErrorMessage(error, {
            fallback: 'Could not load patterns.',
          }),
        );
      } finally {
        setIsLoading(false);
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [accessToken, decoratePatterns, mergePatterns, user?.id]);

  const syncFromWordPress = useCallback(async () => {
    if (!accessToken || syncInFlightRef.current) {
      return;
    }

    syncInFlightRef.current = true;
    setIsSyncingWordPress(true);
    setSyncMessage('Checking your WordPress library for new patterns, chats, and rewrites…');
    try {
      const result = await stitchSenseAPI.syncWordPress(accessToken);
      await refreshPatterns();
      setSyncMessage(
        `Sync complete. ${result.patterns} pattern${result.patterns === 1 ? '' : 's'}, ${result.chats} chat${result.chats === 1 ? '' : 's'}, ${result.rewrites} rewrite${result.rewrites === 1 ? '' : 's'} updated.`,
      );
    } catch (error) {
      setSyncMessage(
        getUserFacingErrorMessage(error, {
          fallback: 'WordPress sync failed.',
        }),
      );
    } finally {
      syncInFlightRef.current = false;
      setIsSyncingWordPress(false);
    }
  }, [accessToken, refreshPatterns]);

  const syncFromWordPressIfNeeded = useCallback(async () => {
    if (!accessToken || syncInFlightRef.current || automaticSyncCheckRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastAutomaticSyncCheckAtRef.current < 5 * 60 * 1000) {
      return;
    }
    lastAutomaticSyncCheckAtRef.current = now;
    automaticSyncCheckRef.current = true;
    try {
      const pending = await stitchSenseAPI.pendingWordPressSync(accessToken);
      if (!pending.available || !pending.hasPending) {
        return;
      }

      await syncFromWordPress();
    } catch {
      // Silent by design: opening Library should only interrupt the user when
      // the website check confirms there is something new to sync.
    } finally {
      automaticSyncCheckRef.current = false;
    }
  }, [accessToken, syncFromWordPress]);

  useEffect(() => {
    async function restoreCachedLibrary() {
      if (!userId || !accessToken) {
        return;
      }

      try {
        const snapshot = await loadLibraryCache(userId);
        if (!snapshot) {
          return;
        }
        hasCachedPatternsRef.current = snapshot.patterns.length > 0;
        setPatterns(decoratePatterns(snapshot.patterns));
        setLastSyncedAt(snapshot.lastSyncedAt);
        setSyncStatus(snapshot.syncStatus);
        syncStatusRef.current = snapshot.syncStatus;
      } catch {
        // Cached library restore is best-effort; a live refresh follows immediately.
      }
    }

    if (userId && accessToken) {
      void restoreCachedLibrary();
      void refreshPatterns();
    } else {
      setPatterns([]);
      setErrorMessage(null);
      setLastSyncedAt(null);
      setSyncStatus(null);
      setSyncMessage(null);
    }
  }, [accessToken, decoratePatterns, refreshPatterns, userId]);

  const value = useMemo(
    () => ({
      patterns,
      isLoading,
      errorMessage,
      lastSyncedAt,
      syncStatus,
      isSyncingWordPress,
      syncMessage,
      upsertPattern,
      removePattern,
      clearLibrary,
      refreshPatterns,
      refreshSyncStatus,
      syncFromWordPress,
      syncFromWordPressIfNeeded,
    }),
    [
      errorMessage,
      isLoading,
      isSyncingWordPress,
      lastSyncedAt,
      patterns,
      refreshPatterns,
      refreshSyncStatus,
      syncFromWordPress,
      syncFromWordPressIfNeeded,
      syncMessage,
      syncStatus,
      upsertPattern,
      removePattern,
      clearLibrary,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used inside LibraryProvider');
  }
  return context;
}
