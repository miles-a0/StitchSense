import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function webStorage() {
  return Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined'
    ? globalThis.localStorage
    : null;
}

export async function getStoredItem(key: string) {
  const storage = webStorage();
  return storage ? storage.getItem(key) : SecureStore.getItemAsync(key);
}

export async function setStoredItem(key: string, value: string) {
  const storage = webStorage();
  if (storage) {
    storage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteStoredItem(key: string) {
  const storage = webStorage();
  if (storage) {
    storage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
