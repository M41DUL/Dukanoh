import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Spacing, BorderRadius, type ProColorTokens } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface BalanceData {
  available: number;
  pending: number;
  lifetime: number;
}

interface BalancePage {
  key: string;
  label: string;
  value: number;
  subtitle: string;
  icon: 'checkmark-circle-outline' | 'time-outline' | 'trophy-outline';
  onPress?: () => void;
}

interface Props {
  data: BalanceData | null;
  loading?: boolean;
  P: ProColorTokens;
}

export function BalanceCarousel({ data, loading, P }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const pages: BalancePage[] = [
    {
      key: 'available',
      label: 'Available',
      value: data?.available ?? 0,
      subtitle: 'Ready to withdraw',
      icon: 'checkmark-circle-outline',
      onPress: () => router.push('/wallet'),
    },
    {
      key: 'pending',
      label: 'Pending',
      value: data?.pending ?? 0,
      subtitle: 'Held until orders complete',
      icon: 'time-outline',
      onPress: () => router.push('/wallet'),
    },
    {
      key: 'lifetime',
      label: 'Lifetime earnings',
      value: data?.lifetime ?? 0,
      subtitle: 'Total earned on Dukanoh',
      icon: 'trophy-outline',
    },
  ];

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = e.nativeEvent.layoutMeasurement.width;
    setActiveIndex(Math.round(x / w));
  }, []);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {pages.map(page => (
          <TouchableOpacity
            key={page.key}
            style={[styles.slide, { width: SCREEN_WIDTH - Spacing.xl * 2 }]}
            activeOpacity={page.onPress ? 0.8 : 1}
            onPress={page.onPress}
            disabled={!page.onPress}
          >
            <View style={[styles.card, { backgroundColor: P.surface, borderColor: P.border }]}>
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, { backgroundColor: P.primaryLight }]}>
                  <Ionicons name={page.icon} size={20} color={P.primary} />
                </View>
                <Text style={[styles.label, { color: P.textSecondary }]}>{page.label}</Text>
              </View>

              {loading ? (
                <ActivityIndicator color={P.primary} style={styles.loader} />
              ) : (
                <Text style={[styles.amount, { color: P.textPrimary }]}>
                  £{(page.value).toFixed(2)}
                </Text>
              )}

              <View style={styles.cardBottom}>
                <Text style={[styles.subtitle, { color: P.textSecondary }]}>{page.subtitle}</Text>
                {page.onPress && (
                  <Ionicons name="chevron-forward" size={14} color={P.primary} />
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {pages.map((p, i) => (
          <View
            key={p.key}
            style={[
              styles.dot,
              { backgroundColor: i === activeIndex ? P.primary : P.border },
              i === activeIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    // Width set dynamically above; horizontal padding creates the card appearance
  },
  card: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
  },
  loader: {
    marginVertical: Spacing.sm,
  },
  amount: {
    fontSize: 32,
    fontFamily: FontFamily.black,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
  },
});
