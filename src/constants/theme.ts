import { FONT_SIZES, LINE_HEIGHTS, FONT_WEIGHTS, FONT_FAMILIES, TYPOGRAPHY } from './typography';
import { IMAGE_PATHS } from './imagePaths';

// The category-standard look (see DESIGN.md): white ground, navy-tinted neutrals, navy for brand and
// primary actions, WhatsApp green only for unread and success.
export const LIGHT_COLORS = {
  primary: '#00326b',
  primaryContainer: '#10488f',
  primaryFixed: '#d7e2ff',
  primaryTint: '#e4ecfa', // selected chip, tab indicator, avatar ground
  onPrimary: '#ffffff',
  secondary: '#0b7a3e', // green text (unread time, success)
  secondaryContainer: '#d8f5e4',
  unread: '#0e8344', // unread badge fill (white 12px text needs 4.5:1)
  onUnread: '#ffffff',
  surface: '#ffffff',
  surfaceContainerLow: '#f3f6fb',
  surfaceContainer: '#ebf0f7',
  surfaceContainerHigh: '#e2e9f3',
  surfaceContainerHighest: '#d8e1ee',
  surfaceContainerLowest: '#ffffff',
  surfaceVariant: '#f3f6fb',
  onSurface: '#0f1a2a',
  onSurfaceVariant: '#414b5a',
  outline: '#667085',
  outlineVariant: '#cfd6e1',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onError: '#ffffff',
  warning: '#b45309',
  star: '#e09b13',
  chatAccent: '#00a884',
  onChatAccent: '#ffffff',
  bubbleIn: '#ffffff',
  bubbleOut: '#d9fdd3',
  chatComposer: '#ffffff',
  chatBg: '#efeae2',
  cardBg: '#ffffff',
  divider: 'rgba(15,26,42,0.08)',
} as const;

export const DARK_COLORS = {
  primary: '#a9c7ff',
  primaryContainer: '#00458e',
  primaryFixed: '#d7e2ff',
  primaryTint: 'rgba(169,199,255,0.16)',
  onPrimary: '#002f65',
  secondary: '#4ede7d',
  secondaryContainer: '#0d3a22',
  unread: '#2fd27a',
  onUnread: '#04210f',
  surface: '#0f1620',
  surfaceContainerLow: '#18212d',
  surfaceContainer: '#1e2936',
  surfaceContainerHigh: '#243140',
  surfaceContainerHighest: '#2b394a',
  surfaceContainerLowest: '#0f1620',
  surfaceVariant: '#18212d',
  onSurface: '#e6ebf2',
  onSurfaceVariant: '#b9c2cf',
  outline: '#8a95a5',
  outlineVariant: '#3a4656',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',
  warning: '#fbbf24',
  star: '#f5b544',
  chatAccent: '#21c063',
  onChatAccent: '#0b141a',
  bubbleIn: '#202c33',
  bubbleOut: '#005c4b',
  chatComposer: '#202c33',
  chatBg: '#0b121c',
  cardBg: '#18212d',
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
