import React, { useRef, useMemo, useCallback } from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
            style={[styles.tab, isActive && styles.tabActive]}
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
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginHorizontal: -Spacing.base,
    },
    row: {
      gap: Spacing.xl,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.md,
    },
    tab: {
      paddingBottom: Spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.textPrimary,
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
