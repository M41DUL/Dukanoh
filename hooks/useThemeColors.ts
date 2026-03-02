import { useTheme } from '@/context/ThemeContext';
import { ColorTokens } from '@/constants/theme';

export function useThemeColors(): ColorTokens {
  return useTheme().colors;
}
