import React, { useRef, useMemo, useCallback } from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface ScrollTabsProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function ScrollTabs({ tabs, activeTab, onTabChange }: ScrollTabsProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const layoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const handlePress = useCallback((tab: string) => {
    if (tab === activeTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabChange(tab);

    const layout = layoutsRef.current[tab];
    if (layout && scrollRef.current) {
      scrollRef.current.scrollTo({ x: Math.max(0, layout.x - Spacing.xl), animated: true });
    }
  }, [activeTab, onTabChange]);

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tab}
              onPress={() => handlePress(tab)}
              activeOpacity={0.7}
              onLayout={(e) => {
                layoutsRef.current[tab] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab}
              </Text>
              {isActive && <View style={styles.indicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.separator} />
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    wrapper: {
      marginHorizontal: -Spacing.base,
    },
    scroll: {
      flexGrow: 0,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    row: {
      gap: Spacing.xl,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.md,
    },
    tab: {
      paddingBottom: Spacing.sm,
    },
    indicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.textPrimary,
      borderRadius: 1,
    },
    tabLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.textSecondary,
    },
    tabLabelActive: {
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
