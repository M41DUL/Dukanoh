import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRecentSales } from '@/hooks/useRecentSales';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function JustSoldToast() {
  const { currentSale, dismiss } = useRecentSales();
  const colors = useThemeColors();
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hasEntered = useRef(false);
  const prevSaleId = useRef<string | null>(null);

  // Entry animation
  useEffect(() => {
    if (!currentSale) return;

    if (!hasEntered.current) {
      hasEntered.current = true;
      prevSaleId.current = currentSale.id;
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    // Rotation crossfade
    if (prevSaleId.current !== currentSale.id) {
      prevSaleId.current = currentSale.id;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [currentSale, translateY, opacity]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 60,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => dismiss());
  };

  if (!currentSale) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.body}
        onPress={() => router.push(`/listing/${currentSale.id}`)}
        activeOpacity={0.8}
      >
        {currentSale.image ? (
          <Image source={{ uri: currentSale.image }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.border }]} />
        )}
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {currentSale.title} <Text style={[styles.label, { color: colors.textSecondary }]}>just sold</Text>
          </Text>
          <Text style={[styles.time, { color: colors.textSecondary }]}>{timeAgo(currentSale.soldAt)}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDismiss} hitSlop={12} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  textCol: {
    flex: 1,
  },
  title: {
    ...Typography.caption,
    fontFamily: 'Inter_600SemiBold',
  },
  label: {
    fontFamily: 'Inter_400Regular',
  },
  time: {
    ...Typography.caption,
    fontSize: 11,
  },
  closeBtn: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
});
