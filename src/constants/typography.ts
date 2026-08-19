/**
 * Centralized Typography Constants
 * Scales font sizes, line heights, weights, and families for high readability across SAC Mobile
 */

export const FONT_SIZES = {
  // Micro / Badges
  xxs: 11,
  // Captions & timestamps
  caption: 12,
  xs: 13,
  // Secondary labels / subtexts
  labelSm: 12,
  labelMd: 13.5,
  bodySm: 13.5,
  // Main body text / buttons / inputs
  sm: 15,
  bodyMd: 15.5,
  labelLg: 15,
  // Prominent body / list titles
  base: 16.5,
  bodyLg: 17,
  headlineSm: 17,
  // Section headers / chat title
  lg: 18.5,
  headlineMd: 19,
  // Screen titles / modal headers
  xl: 21,
  headlineLg: 22,
  // Hero / big display
  xxl: 25,
  headlineXl: 26,
  xxxl: 30,
} as const;

export const LINE_HEIGHTS = {
  xxs: 14,
  caption: 16,
  xs: 18,
  labelSm: 16,
  labelMd: 18,
  bodySm: 19,
  sm: 21,
  bodyMd: 22,
  labelLg: 20,
  base: 24,
  bodyLg: 24,
  headlineSm: 24,
  lg: 26,
  headlineMd: 26,
  xl: 28,
  headlineLg: 30,
  xxl: 32,
  headlineXl: 34,
  xxxl: 36,
} as const;

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  black: '800',
} as const;

export const FONT_FAMILIES = {
  jakarta: 'Plus Jakarta Sans',
  primary: 'Plus Jakarta Sans',
} as const;

export const TYPOGRAPHY = {
  caption: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    fontWeight: FONT_WEIGHTS.regular,
    fontFamily: FONT_FAMILIES.primary,
  },
  labelSm: {
    fontSize: FONT_SIZES.labelSm,
    lineHeight: LINE_HEIGHTS.labelSm,
    fontWeight: FONT_WEIGHTS.medium,
    fontFamily: FONT_FAMILIES.primary,
  },
  labelMd: {
    fontSize: FONT_SIZES.labelMd,
    lineHeight: LINE_HEIGHTS.labelMd,
    fontWeight: FONT_WEIGHTS.medium,
    fontFamily: FONT_FAMILIES.primary,
  },
  labelLg: {
    fontSize: FONT_SIZES.labelLg,
    lineHeight: LINE_HEIGHTS.labelLg,
    fontWeight: FONT_WEIGHTS.semiBold,
    fontFamily: FONT_FAMILIES.primary,
  },
  bodySm: {
    fontSize: FONT_SIZES.bodySm,
    lineHeight: LINE_HEIGHTS.bodySm,
    fontWeight: FONT_WEIGHTS.regular,
    fontFamily: FONT_FAMILIES.primary,
  },
  bodyMd: {
    fontSize: FONT_SIZES.bodyMd,
    lineHeight: LINE_HEIGHTS.bodyMd,
    fontWeight: FONT_WEIGHTS.regular,
    fontFamily: FONT_FAMILIES.primary,
  },
  bodyLg: {
    fontSize: FONT_SIZES.bodyLg,
    lineHeight: LINE_HEIGHTS.bodyLg,
    fontWeight: FONT_WEIGHTS.medium,
    fontFamily: FONT_FAMILIES.primary,
  },
  headlineSm: {
    fontSize: FONT_SIZES.headlineSm,
    lineHeight: LINE_HEIGHTS.headlineSm,
    fontWeight: FONT_WEIGHTS.semiBold,
    fontFamily: FONT_FAMILIES.primary,
  },
  headlineMd: {
    fontSize: FONT_SIZES.headlineMd,
    lineHeight: LINE_HEIGHTS.headlineMd,
    fontWeight: FONT_WEIGHTS.semiBold,
    fontFamily: FONT_FAMILIES.primary,
  },
  headlineLg: {
    fontSize: FONT_SIZES.headlineLg,
    lineHeight: LINE_HEIGHTS.headlineLg,
    fontWeight: FONT_WEIGHTS.bold,
    fontFamily: FONT_FAMILIES.primary,
  },
  headlineXl: {
    fontSize: FONT_SIZES.headlineXl,
    lineHeight: LINE_HEIGHTS.headlineXl,
    fontWeight: FONT_WEIGHTS.bold,
    fontFamily: FONT_FAMILIES.primary,
  },
} as const;

export default {
  FONT_SIZES,
  LINE_HEIGHTS,
  FONT_WEIGHTS,
  FONT_FAMILIES,
  TYPOGRAPHY,
};
