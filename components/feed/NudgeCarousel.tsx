import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientCard } from '@/components/GradientCard';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { NudgeSlide } from '@/hooks/useFeed';

export function NudgeCarousel({ slides }: { slides: NudgeSlide[] }) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = e.nativeEvent.layoutMeasurement.width;
    setActiveIndex(Math.round(x / w));
  }, []);

  if (slides.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {slides.map((slide) => (
          <View key={slide.key} style={styles.slide}>
            <GradientCard
              colors={[colors.primaryLight ?? colors.surface, colors.surface]}
              title={slide.title}
              subtitle={slide.subtitle}
              onPress={slide.onPress}
              style={{ borderRadius: BorderRadius.full }}
              left={
                <View style={styles.iconCircle}>
                  <Ionicons name={slide.icon} size={22} color={colors.primary} />
                </View>
              }
              right={
                <TouchableOpacity onPress={slide.onDismiss} hitSlop={10} style={styles.close}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              }
            />
          </View>
        ))}
      </ScrollView>
      {slides.length > 1 && (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    wrapper: {
      marginBottom: Spacing.xl,
    },
    slide: {
      width: Dimensions.get('window').width,
      paddingHorizontal: Spacing.base,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    close: {
      padding: Spacing.xs,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.primary,
      width: 18,
    },
  });
}
