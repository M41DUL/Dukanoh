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

// ── Dukanoh Pro theme (always dark, gold accent) ─────────────
// Used only in Pro areas (seller-hub, pro card). Not app-wide.
// Accessibility: all pairings tested against WCAG AA (4.5:1 min).
// Gold (#FBCD47) on navy (#0A0A1A)  = ~12:1 ✓
// Gold on surface (#13132E)         = ~11:1 ✓
// Gold on surfaceAlt (#1C1C40)      = ~9.5:1 ✓
// textPrimary on background         = ~18:1 ✓
// textSecondary (#8888AA) on bg     = ~5.9:1 ✓
export const proColors = {
  primary: '#FBCD47',         // gold — main interactive colour, CTAs, icons
  primaryDim: '#D4A820',      // deeper gold — pressed/active states
  primaryLight: '#1C1500',    // dark gold tint — pill/badge backgrounds
  primaryText: '#FBCD47',     // gold text on dark surfaces
  secondary: '#8888AA',       // muted lilac-grey — secondary actions, labels
  secondaryDim: '#6B6B88',    // deeper muted — pressed secondary
  secondaryLight: '#1A1A30',  // subtle secondary background
  background: '#0A0A1A',      // deep navy
  surface: '#13132E',         // card / elevated surface
  surfaceAlt: '#1C1C40',      // further elevated (icon wraps, inputs)
  textPrimary: '#F5F5F5',     // primary body text
  textSecondary: '#8888AA',   // muted / caption text
  border: '#2A2A50',          // card borders, dividers
  error: '#FF6B6B',           // errors (same as dark mode)
  success: '#4ADE80',         // positive values, earnings delta
  amber: '#F59E0B',           // warnings
  like: '#FF4D6A',            // heart / save
  overlay: 'rgba(0,0,0,0.4)',
  // Gradient tokens — angled cool surface gradients (Pro only)
  gradientStart: '#0A0A1A' as const,  // base background (deep navy)
  gradientEnd:   '#0D0A2A' as const,  // cool deep indigo
};

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
