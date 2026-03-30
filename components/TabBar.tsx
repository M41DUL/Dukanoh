import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  /** Optional Animated.Value — the TabBar will fade it out/in on tab switch so the parent can apply it to content below */
  contentFade?: Animated.Value;
}

export function TabBar({ tabs, activeTab, onTabChange, contentFade }: TabBarProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handlePress = (key: string) => {
    if (key === activeTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (contentFade) {
      Animated.timing(contentFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
        onTabChange(key);
        Animated.timing(contentFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      });
    } else {
      onTabChange(key);
    }
  };

  return (
    <View style={styles.container}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => handlePress(tab.key)}
            activeOpacity={0.7}
          >
            <View style={styles.tabLabelWrap}>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginHorizontal: -Spacing.base,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.textPrimary,
    },
    tabLabelWrap: {
      width: '100%',
      alignItems: 'center',
    },
    tabLabel: {
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    tabLabelActive: {
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
