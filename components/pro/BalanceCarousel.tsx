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
import { FontFamily, Spacing, type ProColorTokens } from '@/constants/theme';

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
  showWithdraw: boolean;
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
      label: 'Available balance',
      value: data?.available ?? 0,
      subtitle: 'Ready to withdraw',
      showWithdraw: true,
    },
    {
      key: 'pending',
      label: 'Pending',
      value: data?.pending ?? 0,
      subtitle: 'Held until orders complete',
      showWithdraw: false,
    },
    {
      key: 'lifetime',
      label: 'Lifetime earnings',
      value: data?.lifetime ?? 0,
      subtitle: 'Total earned on Dukanoh',
      showWithdraw: false,
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
          <View
            key={page.key}
            style={[styles.slide, { width: SCREEN_WIDTH - Spacing.xl * 2 }]}
          >
            {/* Amount — centred, no card */}
            {loading ? (
              <ActivityIndicator color={P.primary} style={styles.loader} />
            ) : (
              <Text style={[styles.amount, { color: P.textPrimary }]}>
                £{page.value.toFixed(2)}
              </Text>
            )}
            <Text style={[styles.label, { color: P.textSecondary }]}>{page.label}</Text>
            <Text style={[styles.subtitle, { color: P.textSecondary }]}>{page.subtitle}</Text>

            {/* Withdraw CTA — pill button, available page only */}
            {page.showWithdraw && (
              <TouchableOpacity
                style={[styles.withdrawBtn, { borderColor: P.border }]}
                onPress={() => router.push('/wallet')}
                activeOpacity={0.7}
              >
                <Text style={[styles.withdrawBtnText, { color: P.textSecondary }]}>Withdraw</Text>
              </TouchableOpacity>
            )}
          </View>
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
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  loader: {
    marginVertical: Spacing.lg,
  },
  amount: {
    fontSize: 40,
    fontFamily: FontFamily.black,
    letterSpacing: -1,
    lineHeight: 48,
  },
  label: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },
  withdrawBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  withdrawBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
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
  },
  dotActive: {
    width: 18,
  },
});
