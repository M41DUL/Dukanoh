import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  AccessibilityInfo,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Spacing, BorderRadius, FontFamily, Typography, ColorTokens } from '@/constants/theme';
import { GOOGLE_PAY_MARK, APPLE_PAY_MARK } from '@/constants/paymentMarks';
import { formatGBP } from '@/lib/paymentHelpers';

export type PaidWith = 'apple_pay' | 'google_pay' | 'card';

interface Props {
  orderId: string;
  itemTitle: string;
  imageUrl: string | null;
  sellerUsername: string | null;
  protectionFee: number;
  totalPaid: number;
  paidWith: PaidWith;
  /**
   * The PaymentIntent came back `Processing` — the payment is real and the
   * money is committed, it just hasn't settled yet. Softens the headline so we
   * don't claim a completed charge we can't see the end of.
   */
  processing?: boolean;
  onViewOrder: () => void;
  onKeepShopping: () => void;
}

// Seller has 5 days to dispatch (set by the set_dispatch_deadline trigger the
// moment the webhook flips the order to 'paid'). Hardcoded rather than read off
// the order: this screen renders before the webhook lands, so the row's
// dispatch_deadline_at is still null here.
const DISPATCH_DAYS = 5;

export function PaymentSuccessView({
  orderId,
  itemTitle,
  imageUrl,
  sellerUsername,
  protectionFee,
  totalPaid,
  paidWith,
  processing = false,
  onViewOrder,
  onKeepShopping,
}: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const orderRef = orderId.slice(0, 8).toUpperCase();
  const title = processing ? 'Payment processing' : 'Payment successful';
  const subtitle = processing
    ? "Your payment is going through. We'll confirm your order in a moment."
    : 'Your order is confirmed and paid.';

  const checkScale = useSharedValue(0);
  const bodyOpacity = useSharedValue(0);
  const bodyY = useSharedValue(24);
  const actionsOpacity = useSharedValue(0);


  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Success is carried by an icon + colour, neither of which a screen reader
    // announces on its own — say it out loud.
    AccessibilityInfo.announceForAccessibility(`${title}. ${subtitle}`);

    checkScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    bodyOpacity.value = withDelay(180, withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) }));
    bodyY.value = withDelay(180, withSpring(0, { damping: 18, stiffness: 120 }));
    actionsOpacity.value = withDelay(420, withTiming(1, { duration: 300 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: bodyOpacity.value,
    transform: [{ translateY: bodyY.value }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actionsOpacity.value }));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Animated.View
            style={[
              styles.checkCircle,
              { backgroundColor: processing ? colors.textSecondary : colors.success },
              checkStyle,
            ]}
          >
            <Ionicons name={processing ? 'time' : 'checkmark'} size={26} color="#fff" />
          </Animated.View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>

        <Animated.View style={[styles.body, bodyStyle]}>
          {/* Receipt */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.itemRow}>
              <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceAlt }]}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.thumb} contentFit="cover" />
                ) : null}
              </View>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {itemTitle}
                </Text>
                {sellerUsername ? (
                  <Text style={[styles.seller, { color: colors.textSecondary }]} numberOfLines={1}>
                    @{sellerUsername}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Total is the biggest thing on the card — it's what people check */}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total paid</Text>
              <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatGBP(totalPaid)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Paid with</Text>
              <PaidWithMark paidWith={paidWith} colors={colors} />
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Order</Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>#{orderRef}</Text>
            </View>
          </View>

          {/* What the protection fee actually bought */}
          <View style={[styles.protectionCard, { backgroundColor: colors.primary + '14' }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <View style={styles.protectionText}>
              <Text style={[styles.protectionTitle, { color: colors.textPrimary }]}>
                We're holding your {formatGBP(totalPaid)}
              </Text>
              <Text style={[styles.protectionBody, { color: colors.textSecondary }]}>
                The seller only gets paid once you've confirmed the item arrived as described. That's
                what your {formatGBP(protectionFee)} Safe Checkout fee covers.
              </Text>
            </View>
          </View>

          <Text style={[styles.next, { color: colors.textSecondary }]}>
            {sellerUsername ? `@${sellerUsername} has` : 'The seller has'} {DISPATCH_DAYS} days to
            post it. We'll let you know the moment it's on its way.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Actions pinned below the scroll so they're always reachable */}
      <Animated.View
        style={[styles.actions, { paddingBottom: insets.bottom + Spacing.md }, actionsStyle]}
      >
        <Button label="View order" onPress={onViewOrder} />
        <TouchableOpacity
          onPress={onKeepShopping}
          style={styles.linkWrap}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={[styles.link, { color: colors.textSecondary }]}>Keep shopping</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function PaidWithMark({ paidWith, colors }: { paidWith: PaidWith; colors: ColorTokens }) {
  if (paidWith === 'card') {
    return (
      <View style={markStyles.row}>
        <Ionicons name="card-outline" size={16} color={colors.textPrimary} />
        <Text style={[markStyles.label, { color: colors.textPrimary }]}>Card</Text>
      </View>
    );
  }
  // Both networks require their own acceptance mark rather than plain text or a
  // generic logo. The marks are drawn on white, so they keep a light pill in
  // dark mode instead of being tinted.
  const isGoogle = paidWith === 'google_pay';
  return (
    <View style={[markStyles.pill, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}>
      <SvgXml
        xml={isGoogle ? GOOGLE_PAY_MARK : APPLE_PAY_MARK}
        width={isGoogle ? 54 : 44}
        height={isGoogle ? 26 : 26}
      />
    </View>
  );
}

const markStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  label: {
    ...FontFamily.medium,
    fontSize: Typography.body.fontSize,
  },
  pill: {
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const getStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      gap: Spacing.lg,
      paddingTop: Spacing.xl,
    },
    header: {
      alignItems: 'center',
      gap: Spacing.xs,
    },
    checkCircle: {
      width: 52,
      height: 52,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.sm,
    },
    title: {
      ...FontFamily.bold,
      fontSize: Typography.subheading.fontSize,
      textAlign: 'center',
    },
    subtitle: {
      ...FontFamily.regular,
      fontSize: Typography.body.fontSize,
      textAlign: 'center',
    },
    body: {
      gap: Spacing.md,
    },
    card: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.sm,
    },
    itemRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'center',
    },
    thumbWrap: {
      width: 56,
      height: 70,
      borderRadius: BorderRadius.small,
      overflow: 'hidden',
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    itemInfo: {
      flex: 1,
      gap: 2,
    },
    itemTitle: {
      ...FontFamily.semibold,
      fontSize: Typography.body.fontSize,
    },
    seller: {
      ...FontFamily.regular,
      fontSize: Typography.caption.fontSize,
    },
    divider: {
      height: 1,
      marginVertical: Spacing.xs,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalLabel: {
      ...FontFamily.regular,
      fontSize: Typography.body.fontSize,
    },
    totalValue: {
      ...FontFamily.bold,
      fontSize: 24,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 30,
    },
    metaLabel: {
      ...FontFamily.regular,
      fontSize: Typography.body.fontSize,
    },
    metaValue: {
      ...FontFamily.medium,
      fontSize: Typography.body.fontSize,
    },
    protectionCard: {
      flexDirection: 'row',
      gap: Spacing.md,
      padding: Spacing.base,
      borderRadius: BorderRadius.large,
    },
    protectionText: {
      flex: 1,
      gap: 2,
    },
    protectionTitle: {
      ...FontFamily.semibold,
      fontSize: Typography.body.fontSize,
    },
    protectionBody: {
      ...FontFamily.regular,
      fontSize: Typography.caption.fontSize,
      lineHeight: 18,
    },
    next: {
      ...FontFamily.regular,
      fontSize: Typography.caption.fontSize,
      lineHeight: 18,
      textAlign: 'center',
      paddingHorizontal: Spacing.md,
    },
    actions: {
      gap: Spacing.sm,
      paddingTop: Spacing.md,
    },
    linkWrap: {
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    link: {
      ...FontFamily.medium,
      fontSize: Typography.body.fontSize,
    },
  });
