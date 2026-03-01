import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

type AvatarSize = 'small' | 'medium' | 'large';

interface AvatarProps {
  uri?: string;
  initials?: string;
  size?: AvatarSize;
}

const sizeMap: Record<AvatarSize, number> = { small: 28, medium: 40, large: 64 };
const fontSizeMap: Record<AvatarSize, number> = { small: 10, medium: 14, large: 22 };

export function Avatar({ uri, initials = '?', size = 'medium' }: AvatarProps) {
  const dimension = sizeMap[size];
  const fontSize = fontSizeMap[size];

  return (
    <View
      style={[
        styles.container,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} />
      ) : (
        <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  initials: { color: Colors.background, fontFamily: 'Inter_600SemiBold' },
});
