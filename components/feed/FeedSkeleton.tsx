import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

function SkeletonCard() {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={[styles.image, { backgroundColor: colors.surface }]} />
      <View style={styles.content}>
        <View style={[styles.line, { backgroundColor: colors.surface }]} />
        <View style={[styles.line, { backgroundColor: colors.surface, width: '60%' }]} />
        <View style={[styles.line, { backgroundColor: colors.surface, width: '45%', height: 14 }]} />
      </View>
    </Animated.View>
  );
}

export function SkeletonSection() {
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={[styles.line, { width: 140, height: 16 }]} />
        <View style={[styles.line, { width: 48, height: 14 }]} />
      </View>
      {[0, 1, 2].map(row => (
        <View key={row} style={styles.gridRow}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  image: { aspectRatio: 4 / 5, borderRadius: BorderRadius.medium },
  content: { paddingVertical: Spacing.sm, gap: 6 },
  line: { height: 12, borderRadius: 6, width: '85%' },
  section: { marginBottom: Spacing.xl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  gridRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
});
