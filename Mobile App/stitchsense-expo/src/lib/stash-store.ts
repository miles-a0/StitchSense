import { deleteStoredItem, getStoredItem, setStoredItem } from './secure-storage';

export type StashCategory = 'yarn' | 'needle-hook' | 'tool';

export type StashItem = {
  id: string;
  category: StashCategory;
  name: string;
  quantity?: string;
  unit?: string;
  brand?: string;
  yarnWeight?: string;
  fibre?: string;
  colour?: string;
  dyeLot?: string;
  size?: string;
  material?: string;
  location?: string;
  reservedFor?: string;
  notes?: string;
  imageUri?: string;
  createdAt: string;
  updatedAt: string;
};

const STASH_KEY_PREFIX = 'stitchsense-stash-v1';

function safeKeyPart(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function stashKey(userId: string) {
  return `${STASH_KEY_PREFIX}-${safeKeyPart(userId)}`;
}

export async function loadStash(userId: string) {
  const saved = await getStoredItem(stashKey(userId));
  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved) as StashItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    await deleteStoredItem(stashKey(userId));
    return [];
  }
}

export async function saveStash(userId: string, items: StashItem[]) {
  await setStoredItem(stashKey(userId), JSON.stringify(items));
}

export async function clearStash(userId: string) {
  await deleteStoredItem(stashKey(userId));
}
