import { lightColors, darkColors, ColorTokens } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const palette = { light: lightColors, dark: darkColors };

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ColorTokens
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];
  return colorFromProps ?? palette[theme][colorName];
}
