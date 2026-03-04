export const lightColors = {
  primary: '#3735C5',
  primaryText: '#3735C5',
  secondary: '#C7F75E',
  background: '#FFFFFF',
  surface: '#F2F2F2',
  textPrimary: '#0D0D0D',
  textSecondary: '#6B6B6B',
  border: '#E8E8E8',
  error: '#FF4444',
  success: '#22C55E',
};

export const darkColors = {
  primary: '#3735C5',
  primaryText: '#FFFFFF',
  secondary: '#C7F75E',
  background: '#0D0D0D',
  surface: '#1C1C1C',
  textPrimary: '#F5F5F5',
  textSecondary: '#9B9B9B',
  border: '#2A2A2A',
  error: '#FF6B6B',
  success: '#4ADE80',
};

export type ColorTokens = typeof lightColors;

// Static fallback — screens should use useThemeColors() hook instead
export const Colors = lightColors;

export const FontFamily = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const Typography = {
  display: {
    fontSize: 32,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    fontFamily: 'Inter_600SemiBold',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
};

export const BorderRadius = {
  small: 8,
  medium: 12,
  large: 16,
  full: 999,
};

export const Categories = [
  'All',
  'Men',
  'Women',
  'Casualwear',
  'Partywear',
  'Festive',
  'Formal',
  'Achkan',
  'Wedding',
  'Pathani Suit',
  'Shoes',
] as const;

export type Category = (typeof Categories)[number];
