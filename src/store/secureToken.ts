import { storage } from './mmkv';
import { mmkvKeys } from '../constants/storage';

// The auth token lives in the OS keystore (Android Keystore / iOS Keychain) rather than MMKV.
// SecureStore's getItem/setItem are synchronous, which the store init and axios interceptor need.
type SecureStoreModule = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  deleteItemAsync: (key: string) => Promise<void>;
};

let secure: SecureStoreModule | null = null;
try {
  secure = require('expo-secure-store');
} catch (e) {
  // Native module missing (e.g. dev build not rebuilt after adding it). Keep the app usable but say so.
  console.warn('[auth] expo-secure-store unavailable, token falls back to MMKV:', e);
}

const KEY = mmkvKeys.USER_TOKEN;

export function getToken(): string | null {
  if (!secure) return storage.getString(KEY) || null;
  try {
    const value = secure.getItem(KEY);
    if (value) return value;

    // One-time migration for sessions saved before the token moved to SecureStore
    const legacy = storage.getString(KEY);
    if (legacy) {
      secure.setItem(KEY, legacy);
      storage.remove(KEY);
      return legacy;
    }
  } catch (e) {
    console.error('[auth] failed to read token from secure storage:', e);
  }
  return null;
}

export function setToken(token: string): void {
  if (!secure) {
    storage.set(KEY, token);
    return;
  }
  secure.setItem(KEY, token);
  storage.remove(KEY); // never leave a plain-text copy behind
}

export function clearToken(): void {
  storage.remove(KEY);
  if (!secure) return;
  try {
    // There is no synchronous delete: blank it now so reads see "no token" immediately, then delete.
    secure.setItem(KEY, '');
    secure.deleteItemAsync(KEY).catch(() => {});
  } catch (e) {
    console.error('[auth] failed to clear secure token:', e);
  }
}
