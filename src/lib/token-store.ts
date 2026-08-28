import { deleteStoredItem, getStoredItem, setStoredItem } from './secure-storage';

const ACCESS_KEY = 'stitchsense-access-token';
const REFRESH_KEY = 'stitchsense-refresh-token';

export async function loadTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    getStoredItem(ACCESS_KEY),
    getStoredItem(REFRESH_KEY),
  ]);

  return { accessToken, refreshToken };
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    setStoredItem(ACCESS_KEY, accessToken),
    setStoredItem(REFRESH_KEY, refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    deleteStoredItem(ACCESS_KEY),
    deleteStoredItem(REFRESH_KEY),
  ]);
}
