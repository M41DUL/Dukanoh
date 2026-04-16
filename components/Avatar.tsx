import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getImageUrl } from '@/lib/imageUtils';

type AvatarSize = 'small' | 'medium' | 'large' | 'xlarge';

interface AvatarProps {
  uri?: string;
  initials?: string;
  size?: AvatarSize;
  /** Provide a label (e.g. "@username's avatar") when the avatar is meaningful
   *  to screen readers. Omit for purely decorative use — it will be hidden. */
  accessibilityLabel?: string;
}

const sizeMap: Record<AvatarSize, number> = { small: 28, medium: 40, large: 64, xlarge: 96 };
const fontSizeMap: Record<AvatarSize, number> = { small: 10, medium: 14, large: 22, xlarge: 32 };

export function Avatar({ uri, initials = '?', size = 'medium', accessibilityLabel }: AvatarProps) {
  const colors = useThemeColors();
  const dimension = sizeMap[size];
  const fontSize = fontSizeMap[size];

  return (
    <View
      style={[
        styles.container,
        { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor: colors.primary },
      ]}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {uri ? (
        <Image source={{ uri: getImageUrl(uri, 'avatar') }} style={styles.image} contentFit="cover" transition={150} />
      ) : (
        <Text style={[styles.initials, { fontSize, color: '#FFFFFF' }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  initials: { fontFamily: 'Inter_600SemiBold' },
});
