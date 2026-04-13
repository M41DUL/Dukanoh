import { useTheme } from '@/context/ThemeContext';
import { proColorsDark, proColorsLight, type ProColorTokens } from '@/constants/theme';

/**
 * Returns the correct Pro colour palette for the current system theme.
 * Pro has its own visual language (gradient + glass) in both modes —
 * it does not use the standard app ColorTokens.
 *
 * Dark mode → proColorsDark (deep indigo gradient, glass cards, gold accent)
 * Light mode → proColorsLight (lavender gradient, frosted glass, gold accent)
 */
export function useProColors(): ProColorTokens {
  const { isDark } = useTheme();
  return isDark ? proColorsDark : proColorsLight;
}
