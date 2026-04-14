export const lightColors = {
  primary: '#3735C5',
  primaryDim: '#6B69E8',
  primaryLight: '#EEEDFC',
  primaryText: '#3735C5',
  secondary: '#C7F75E',
  secondaryDim: '#A8D94A',
  secondaryLight: '#F0FDD4',
  background: '#FFFFFF',
  surface: '#F2F2F2',
  surfaceAlt: '#E8E8E8',
  textPrimary: '#0D0D0D',
  textSecondary: '#5A5A5A',
  border: '#E8E8E8',
  error: '#FF4444',
  success: '#22C55E',
  amber: '#F59E0B',
  like: '#FF4D6A',
  overlay: 'rgba(0,0,0,0.2)',
};

export const darkColors = {
  primary: '#3735C5',
  primaryDim: '#4E4CC0',
  primaryLight: '#1C1A3A',
  primaryText: '#FFFFFF',
  secondary: '#C7F75E',
  secondaryDim: '#8FB83E',
  secondaryLight: '#1F2D08',
  background: '#0D0D0D',
  surface: '#1C1C1C',
  surfaceAlt: '#252525',
  textPrimary: '#F5F5F5',
  textSecondary: '#9B9B9B',
  border: '#2A2A2A',
  error: '#FF6B6B',
  success: '#4ADE80',
  amber: '#F59E0B',
  like: '#FF4D6A',
  overlay: 'rgba(0,0,0,0.2)',
};

// ── Dukanoh Pro theme ─────────────────────────────────────────
// Used only in Pro areas (profile tab, paywall, boosts).
// Visual language: full-screen gradient + glassmorphism cards.
// Does NOT respond to system light/dark — use useProColors() hook
// which returns proColorsDark or proColorsLight based on isDark.
//
// Pro dark — Accessibility (WCAG AA, 4.5:1 min):
//   Gold (#FBCD47) on gradientBottom (#080714) = ~13:1 ✓
//   textPrimary (#FFF) on gradientBottom        = ~21:1 ✓
//   textSecondary (rgba white 0.55) on bg       = ~6.2:1 ✓
//
// Pro light — Accessibility:
//   textPrimary (#0A0A1A) on gradientBottom     = ~18:1 ✓
//   textSecondary (rgba dark 0.55) on bg        = ~5.8:1 ✓
//   gold primaryText (#8A6800) on surface       = ~4.6:1 ✓

export const proColorsDark = {
  // Full-screen gradient (top → bottom, use with LinearGradient)
  gradientTop:      '#1E1C6E' as const,   // deep brand indigo
  gradientBottom:   '#080714' as const,   // near black

  // Glass surfaces — transparent so gradient bleeds through
  surface:          'rgba(255,255,255,0.07)',   // cards
  surfaceElevated:  'rgba(255,255,255,0.12)',   // icon wraps, inputs
  border:           'rgba(255,255,255,0.10)',   // card + divider borders

  // Text
  textPrimary:      '#FFFFFF',
  textSecondary:    'rgba(255,255,255,0.55)',

  // Functional accent — white on deep indigo (brand primary equivalent)
  primary:          '#FFFFFF',
  primaryDim:       'rgba(255,255,255,0.80)',
  primaryLight:     'rgba(255,255,255,0.10)',
  primaryText:      '#FFFFFF',

  // Gold — Pro identity marker only (checkmark badge, Pro/Founder pills)
  proAccent:        '#FBCD47',
  proAccentText:    '#FBCD47',   // gold text is readable on dark backgrounds

  // CTA button text — dark text on white primary button
  ctaBtnText:       '#080714' as const,

  // Boost — brand lime green used for boost UI
  boostAccent:      '#C7F75E',
  boostAccentText:  '#0D0D0D',   // dark text on lime green (always)

  // Secondary
  secondary:        '#8888AA',
  secondaryDim:     '#6B6B88',
  secondaryLight:   'rgba(136,136,170,0.15)',

  // Status
  success:          '#4ADE80',
  error:            '#FF6B6B',
  amber:            '#F59E0B',
  like:             '#FF4D6A',
  overlay:          'rgba(0,0,0,0.5)',

  // Legacy aliases — kept for seller-hub.tsx until it is deleted
  background:       '#080714',
  surfaceAlt:       'rgba(255,255,255,0.12)',
  gradientStart:    '#080714' as const,
  gradientEnd:      '#1E1C6E' as const,
};

export const proColorsLight = {
  // Full-screen gradient (top → bottom)
  gradientTop:      '#FFFFFF' as const,
  gradientBottom:   '#DFE9F3' as const,

  // Frosted glass surfaces
  surface:          'rgba(255,255,255,0.55)',
  surfaceElevated:  'rgba(255,255,255,0.75)',
  border:           'rgba(55,53,197,0.12)',

  // Text
  textPrimary:      '#0A0A1A',
  textSecondary:    'rgba(10,10,26,0.55)',

  // Functional accent — near black on white (matches textPrimary)
  primary:          '#0A0A1A',
  primaryDim:       'rgba(10,10,26,0.75)',
  primaryLight:     'rgba(10,10,26,0.06)',
  primaryText:      '#0A0A1A',

  // Gold — Pro identity marker only (checkmark badge, Pro/Founder pills)
  proAccent:        '#FBCD47',
  proAccentText:    '#8A6800',   // dark amber — WCAG AA on white (4.8:1)

  // CTA button text — white text on near-black primary button
  ctaBtnText:       '#FFFFFF' as const,

  // Boost — brand lime green used for boost UI
  boostAccent:      '#C7F75E',
  boostAccentText:  '#0D0D0D',   // dark text on lime green (always)

  // Secondary
  secondary:        '#6B6B99',
  secondaryDim:     '#5555AA',
  secondaryLight:   'rgba(107,107,153,0.12)',

  // Status
  success:          '#16A34A',
  error:            '#FF4444',
  amber:            '#D97706',
  like:             '#FF4D6A',
  overlay:          'rgba(0,0,0,0.25)',

  // Legacy aliases
  background:       '#DFE9F3',
  surfaceAlt:       'rgba(255,255,255,0.75)',
  gradientStart:    '#DFE9F3' as const,
  gradientEnd:      '#FFFFFF' as const,
};

// proColors — dark palette, kept for backwards compat with hubTheme.ts
// and seller-hub.tsx. Will be removed when seller-hub.tsx is deleted.
export const proColors = proColorsDark;

export type ProColorTokens = { [K in keyof typeof proColorsDark]: string };

export type ColorTokens = typeof lightColors;

// Static fallback — screens should use useThemeColors() hook instead
export const Colors = lightColors;

export const FontFamily = {
  thin: 'Inter_100Thin',
  extraLight: 'Inter_200ExtraLight',
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
};

export const Typography = {
  display: {
    fontSize: 32,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    includeFontPadding: false,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    includeFontPadding: false,
  },
  price: {
    fontSize: 28,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    includeFontPadding: false,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    includeFontPadding: false,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
    includeFontPadding: false,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
    includeFontPadding: false,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
    includeFontPadding: false,
  },
  small: {
    fontSize: 11,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
    includeFontPadding: false,
  },
  micro: {
    fontSize: 10,
    fontWeight: '400' as const,
    fontFamily: 'Inter_400Regular',
    includeFontPadding: false,
  },
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0,
    fontFamily: 'Inter_500Medium',
    includeFontPadding: false,
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

export const BorderWidth = {
  standard: 1.5,
};

export const Genders = ['Men', 'Women'] as const;
export type Gender = (typeof Genders)[number];

export const Categories = [
  'All',
  'Lehenga',
  'Saree',
  'Anarkali',
  'Sherwani',
  'Kurta',
  'Achkan',
  'Pathani Suit',
  'Casualwear',
  'Shoes',
  'Dupatta',
  'Blouse',
  'Sharara',
  'Salwar',
  'Nehru Jacket',
] as const;

export type Category = (typeof Categories)[number];

export const CategoriesByGender: Record<Gender, string[]> = {
  Women: ['Lehenga', 'Saree', 'Anarkali', 'Kurta', 'Dupatta', 'Blouse', 'Sharara', 'Salwar', 'Casualwear', 'Shoes'],
  Men: ['Sherwani', 'Kurta', 'Achkan', 'Pathani Suit', 'Salwar', 'Nehru Jacket', 'Casualwear', 'Shoes'],
};

export const Conditions = ['New', 'Excellent', 'Good', 'Fair'] as const;

export const Occasions = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'] as const;

export const Sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Custom'] as const;

export const Colours = ['Black', 'White', 'Red', 'Blue', 'Green', 'Gold', 'Pink', 'Maroon', 'Beige', 'Multi', 'Other'] as const;

export const Fabrics = ['Silk', 'Chiffon', 'Georgette', 'Cotton', 'Velvet', 'Net', 'Brocade', 'Linen', 'Other'] as const;
