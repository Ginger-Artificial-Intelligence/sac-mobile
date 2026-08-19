import { FONT_SIZES, LINE_HEIGHTS, FONT_WEIGHTS, FONT_FAMILIES, TYPOGRAPHY } from './typography';
import { IMAGE_PATHS } from './imagePaths';

export const LIGHT_COLORS = {
  primary: '#00326b',
  primaryContainer: '#10488f',
  primaryFixed: '#d7e2ff',
  onPrimary: '#ffffff',
  secondary: '#006d2f',
  secondaryContainer: '#5dfd8a',
  surface: '#f8f9ff',
  surfaceContainerLow: '#eff4ff',
  surfaceContainer: '#e5eeff',
  surfaceContainerHigh: '#dce9ff',
  surfaceContainerHighest: '#d3e4fe',
  surfaceContainerLowest: '#ffffff',
  surfaceVariant: '#eff4ff',
  onSurface: '#0b1c30',
  onSurfaceVariant: '#434751',
  outline: '#737782',
  outlineVariant: '#c3c6d2',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onError: '#ffffff',
  chatBg: '#efeae2',
  cardBg: '#ffffff',
  divider: 'rgba(0,50,107,0.08)',
} as const;

export const DARK_COLORS = {
  primary: '#abc7ff',
  primaryContainer: '#00458e',
  primaryFixed: '#d7e2ff',
  onPrimary: '#002f65',
  secondary: '#4ede7d',
  secondaryContainer: '#005322',
  surface: '#0d1520',
  surfaceContainerLow: '#121d2b',
  surfaceContainer: '#172435',
  surfaceContainerHigh: '#1c2b3f',
  surfaceContainerHighest: '#22334b',
  surfaceContainerLowest: '#0a1019',
  surfaceVariant: '#1a2738',
  onSurface: '#e1e7f5',
  onSurfaceVariant: '#c3c6d2',
  outline: '#8d919d',
  outlineVariant: '#434751',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',
  chatBg: '#0b121c',
  cardBg: '#121d2b',
  divider: 'rgba(255,255,255,0.08)',
} as const;

export const COLORS = LIGHT_COLORS;

export function getThemeColors(isDark: boolean) {
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

export { FONT_SIZES, LINE_HEIGHTS, FONT_WEIGHTS, FONT_FAMILIES, TYPOGRAPHY, IMAGE_PATHS };

export default {
  LIGHT_COLORS,
  DARK_COLORS,
  COLORS,
  getThemeColors,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZES,
  LINE_HEIGHTS,
  FONT_WEIGHTS,
  FONT_FAMILIES,
  TYPOGRAPHY,
  IMAGE_PATHS,
};
