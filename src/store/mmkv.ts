let storageInstance: {
  getString: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
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
  };
} catch (e) {
  console.warn("MMKV failed to initialize (native TurboModule missing). Falling back to memory storage.");
  const mockStorage: Record<string, string> = {};
  storageInstance = {
    getString: (key: string) => mockStorage[key] || null,
    set: (key: string, value: string) => { mockStorage[key] = value; },
    remove: (key: string) => { delete mockStorage[key]; },
    delete: (key: string) => { delete mockStorage[key]; },
    clearAll: () => {
      Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    },
  };
}

export const storage = storageInstance;

export { mmkvKeys } from '../constants/storage';
