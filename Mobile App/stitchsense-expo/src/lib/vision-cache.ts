import { deleteStoredItem, getStoredItem, setStoredItem } from './secure-storage';

const CACHE_KEY_PREFIX = 'stitchsense-vision-cache-';
const MAX_SECURESTORE_BYTES = 1800;
const MAX_RESULT_TEXT_LENGTH = 1200;

type VisionCacheSnapshot = {
  question: string;
  resultText: string;
  imageUri: string | null;
  updatedAt: string;
};

function cacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

function isUsableUserId(userId: string) {
  return typeof userId === 'string' && userId.trim().length > 0;
}

function byteSize(value: string) {
  return new TextEncoder().encode(value).length;
}

export async function loadVisionCache(userId: string) {
  if (!isUsableUserId(userId)) {
    return null;
  }
  const saved = await getStoredItem(cacheKey(userId));
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as VisionCacheSnapshot;
  } catch {
    await deleteStoredItem(cacheKey(userId));
    return null;
  }
}

export async function saveVisionCache(
  userId: string,
  snapshot: {
    question: string;
    resultText: string;
    imageUri: string | null;
  },
) {
  if (!isUsableUserId(userId)) {
    return;
  }

  const payload = JSON.stringify({
    ...snapshot,
    resultText: snapshot.resultText.slice(0, MAX_RESULT_TEXT_LENGTH),
    updatedAt: new Date().toISOString(),
  });

  if (byteSize(payload) > MAX_SECURESTORE_BYTES) {
    await deleteStoredItem(cacheKey(userId));
    return;
  }

  await setStoredItem(cacheKey(userId), payload);
}

export async function clearVisionCache(userId: string) {
  if (!isUsableUserId(userId)) {
    return;
  }
  await deleteStoredItem(cacheKey(userId));
}
