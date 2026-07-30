import { Directory, File, Paths } from 'expo-file-system';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  clearStash,
  loadStash,
  saveStash,
  type StashCategory,
  type StashItem,
} from '@/src/lib/stash-store';
import { stitchSenseAPI } from '@/src/lib/api';
import { useSession } from '@/src/providers/session-provider';

type StashDraft = Omit<Partial<StashItem>, 'id' | 'createdAt' | 'updatedAt'> & {
  category: StashCategory;
  name: string;
};

type StashContextValue = {
  items: StashItem[];
  isReady: boolean;
  addItem: (draft: StashDraft) => Promise<StashItem | null>;
  updateItem: (id: string, patch: Partial<StashItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearItems: () => Promise<void>;
};

const StashContext = createContext<StashContextValue | null>(null);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortStash(items: StashItem[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function isLocalFileUri(uri: string | null | undefined) {
  return Boolean(uri?.startsWith('file://'));
}

function mergeRemoteWithLocalImages(remote: StashItem[], cached: StashItem[]) {
  const cachedById = new Map(cached.map((item) => [item.id, item]));
  return remote.map((item) => {
    const cachedItem = cachedById.get(item.id);
    if (isLocalFileUri(cachedItem?.imageUri)) {
      return { ...item, imageUri: cachedItem?.imageUri };
    }
    return item;
  });
}

async function persistLocalImage(itemId: string, imageUri: string | undefined) {
  if (!imageUri || imageUri.startsWith('http') || imageUri.startsWith('file://') === false) {
    return imageUri;
  }

  try {
    const directory = new Directory(Paths.document, 'stash-images');
    if (!directory.exists) {
      directory.create({ idempotent: true, intermediates: true });
    }
    const extension = imageUri.split('?')[0]?.split('.').pop()?.toLowerCase();
    const safeExtension =
      extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : 'jpg';
    const destination = new File(directory, `${itemId}-${Date.now()}.${safeExtension}`);
    const source = new File(imageUri);
    source.copy(destination);
    return destination.uri;
  } catch {
    return imageUri;
  }
}

export function StashProvider({ children }: React.PropsWithChildren) {
  const { accessToken, user } = useSession();
  const [items, setItems] = useState<StashItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  const persist = useCallback(
    async (nextItems: StashItem[]) => {
      if (!user?.id) {
        return;
      }
      const sorted = sortStash(nextItems);
      setItems(sorted);
      await saveStash(user.id, sorted).catch(() => undefined);
    },
    [user?.id],
  );

  useEffect(() => {
    let mounted = true;

    async function restore() {
      if (!user?.id) {
        setItems([]);
        setIsReady(true);
        return;
      }

      setIsReady(false);
      let cached: StashItem[] = [];
      try {
        cached = await loadStash(user.id);
      } catch {
        cached = [];
      }
      if (!mounted) {
        return;
      }
      setItems(sortStash(cached));
      setIsReady(true);

      if (accessToken) {
        try {
          const remote = await stitchSenseAPI.stashItems(accessToken);
          if (!mounted) {
            return;
          }
          const sorted = sortStash(mergeRemoteWithLocalImages(remote, cached));
          setItems(sorted);
          await saveStash(user.id, sorted).catch(() => undefined);
        } catch {
          // Local cache keeps Stash usable if the API is temporarily unavailable.
        }
      }
    }

    void restore();

    return () => {
      mounted = false;
    };
  }, [accessToken, user?.id]);

  const addItem = useCallback(
    async (draft: StashDraft) => {
      if (!user?.id) {
        return null;
      }

      const now = new Date().toISOString();
      const localImageUri = draft.imageUri;
      const item: StashItem = {
        id: createId(),
        ...draft,
        name: draft.name.trim(),
        createdAt: now,
        updatedAt: now,
      };

      if (accessToken) {
        try {
          const created = await stitchSenseAPI.createStashItem(accessToken, {
            ...draft,
            imageUri: undefined,
            name: draft.name.trim(),
          });
          const uploaded =
            localImageUri && !String(localImageUri).startsWith('http')
              ? await stitchSenseAPI.uploadStashImage(created.id, accessToken, {
                  uri: localImageUri,
                  name: `${created.id}.jpg`,
                  mimeType: 'image/jpeg',
                })
              : created;
          const localDisplayImageUri = await persistLocalImage(created.id, localImageUri);
          const saved = localDisplayImageUri ? { ...uploaded, imageUri: localDisplayImageUri } : uploaded;
          await persist([saved, ...items]);
          return saved;
        } catch {
          // Fall through to local save so users can keep recording stash.
        }
      }

      const localImageUriForItem = await persistLocalImage(item.id, item.imageUri);
      const localItem = localImageUriForItem ? { ...item, imageUri: localImageUriForItem } : item;
      await persist([localItem, ...items]);
      return localItem;
    },
    [accessToken, items, persist, user?.id],
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<StashItem>) => {
      const now = new Date().toISOString();
      if (accessToken) {
        try {
          const updated = await stitchSenseAPI.updateStashItem(id, accessToken, patch);
          const uploaded =
            patch.imageUri && !String(patch.imageUri).startsWith('http')
              ? await stitchSenseAPI.uploadStashImage(updated.id, accessToken, {
                  uri: patch.imageUri,
                  name: `${updated.id}.jpg`,
                  mimeType: 'image/jpeg',
                })
              : updated;
          const localDisplayImageUri = await persistLocalImage(updated.id, patch.imageUri);
          const saved = localDisplayImageUri ? { ...uploaded, imageUri: localDisplayImageUri } : uploaded;
          await persist(items.map((item) => (item.id === id ? saved : item)));
          return;
        } catch {
          // Keep edits local if the remote stash endpoint is unavailable.
        }
      }

      const localImageUriForPatch = await persistLocalImage(id, patch.imageUri);
      await persist(
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                ...patch,
                ...(localImageUriForPatch ? { imageUri: localImageUriForPatch } : {}),
                updatedAt: now,
              }
            : item,
        ),
      );
    },
    [accessToken, items, persist],
  );

  const removeItem = useCallback(
    async (id: string) => {
      if (accessToken) {
        await stitchSenseAPI.deleteStashItem(id, accessToken).catch(() => undefined);
      }
      await persist(items.filter((item) => item.id !== id));
    },
    [accessToken, items, persist],
  );

  const clearItems = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    setItems([]);
    await clearStash(user.id);
  }, [user?.id]);

  const value = useMemo<StashContextValue>(
    () => ({
      items,
      isReady,
      addItem,
      updateItem,
      removeItem,
      clearItems,
    }),
    [addItem, clearItems, isReady, items, removeItem, updateItem],
  );

  return <StashContext.Provider value={value}>{children}</StashContext.Provider>;
}

export function useStash() {
  const context = useContext(StashContext);
  if (!context) {
    throw new Error('useStash must be used inside StashProvider');
  }
  return context;
}
