let storageInstance: {
  getString: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
  getAllKeys: () => string[];
};

try {
  const { createMMKV } = require('react-native-mmkv');
  const mmkv = createMMKV();
  storageInstance = {
    getString: (key: string) => {
      const val = mmkv.getString(key);
      return val === undefined ? null : val;
    },
    set: (key: string, value: string) => mmkv.set(key, value),
    remove: (key: string) => mmkv.remove(key),
    delete: (key: string) => mmkv.remove(key),
    clearAll: () => mmkv.clearAll(),
    getAllKeys: () => mmkv.getAllKeys(),
  };
} catch (e) {
  // In a real build this means a broken native setup: crash at startup rather than silently losing
  // the session (and all cached data) on every restart. Only dev keeps the in-memory fallback.
  if (!__DEV__) {
    throw new Error(`MMKV failed to initialize: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.error('MMKV failed to initialize (native module missing). DEV ONLY: using non-persistent memory storage.', e);
  const mockStorage: Record<string, string> = {};
  storageInstance = {
    getString: (key: string) => mockStorage[key] || null,
    set: (key: string, value: string) => { mockStorage[key] = value; },
    remove: (key: string) => { delete mockStorage[key]; },
    delete: (key: string) => { delete mockStorage[key]; },
    clearAll: () => {
      Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    },
    getAllKeys: () => Object.keys(mockStorage),
  };
}

export const storage = storageInstance;

export { mmkvKeys } from '../constants/storage';
