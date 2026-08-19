import { create } from 'zustand';
import { storage } from './mmkv';
import { Appearance } from 'react-native';
import { LIGHT_COLORS, DARK_COLORS } from '../constants/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  colors: typeof LIGHT_COLORS | typeof DARK_COLORS;
}

const THEME_STORAGE_KEY = 'app_theme_mode';

function computeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

const initialMode = (storage.getString(THEME_STORAGE_KEY) as ThemeMode) || 'light';
const initialIsDark = computeIsDark(initialMode);

export const useThemeStore = create<ThemeState>((set) => ({
  themeMode: initialMode,
  isDark: initialIsDark,
  colors: initialIsDark ? DARK_COLORS : LIGHT_COLORS,
  setThemeMode: (mode: ThemeMode) => {
    storage.set(THEME_STORAGE_KEY, mode);
    const isDark = computeIsDark(mode);
    set({
      themeMode: mode,
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
    });
  },
}));

// Listen to OS appearance changes when in system mode
Appearance.addChangeListener(({ colorScheme }) => {
  const currentMode = useThemeStore.getState().themeMode;
  if (currentMode === 'system') {
    const isDark = colorScheme === 'dark';
    useThemeStore.setState({
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
    });
  }
});
