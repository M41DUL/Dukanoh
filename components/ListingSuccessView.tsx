import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Share, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Typography, Spacing, FontFamily, BorderRadius } from '@/constants/theme';

interface Props {
  listing: Listing;
  onViewListing: () => void;
  onViewProfile: () => void;
  onListAnother: () => void;
}

export function ListingSuccessView({ listing, onViewListing, onViewProfile, onListAnother }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const cardY       = useSharedValue(100);
  const cardScale   = useSharedValue(0.92);
  const cardOpacity = useSharedValue(0);
  const actionsOpacity = useSharedValue(0);
  const checkScale  = useSharedValue(0);

   
  useEffect(() => {
    // Celebratory "ta-da" the moment the success screen lands
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Card slides up and fades in
    cardY.value       = withSpring(0, { damping: 18, stiffness: 110 });
    cardScale.value   = withSpring(1, { damping: 18, stiffness: 110 });
    cardOpacity.value = withTiming(1, { duration: 250 });

    // Heartbeat pulse once the card settles
    cardScale.value = withSequence(
      withSpring(1, { damping: 18, stiffness: 110 }),
      withDelay(420, withSpring(1.03, { damping: 12, stiffness: 180 })),
      withSpring(1, { damping: 14, stiffness: 160 }),
    );

    // Check icon pops in
    checkScale.value = withDelay(200, withSpring(1, { damping: 14, stiffness: 200 }));

    // Actions fade in after card lands
    actionsOpacity.value = withDelay(500, withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }, { scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out "${listing.title}" for £${listing.price.toFixed(2)} on Dukanoh 🛍`,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>

      {/* Header */}
      <Animated.View style={[styles.header, checkStyle]}>
        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={22} color="#fff" />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>You're live!</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your piece is now visible to members.
        </Text>
      </Animated.View>

      {/* Listing card preview */}
      <Animated.View style={[styles.cardWrapper, cardStyle]}>
        <ListingCard
          listing={listing}
          variant="featured"
          onPress={onViewListing}
        />
      </Animated.View>

      {/* Actions */}
      <Animated.View style={[styles.actions, actionsStyle]}>
        <TouchableOpacity
          style={[styles.shareRow, { borderColor: colors.border }]}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
          <Text style={[styles.shareLabel, { color: colors.textPrimary }]}>Share listing</Text>
        </TouchableOpacity>

        <View style={styles.buttons}>
          <Button
            label="View profile"
            variant="outline"
            onPress={onViewProfile}
            style={styles.btnFlex}
          />
          <Button
            label="List another"
            onPress={onListAnother}
            style={styles.btnFlex}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...FontFamily.bold,
    fontSize: Typography.subheading.fontSize,
  },
  subtitle: {
    ...FontFamily.regular,
    fontSize: Typography.body.fontSize,
    textAlign: 'center',
  },
  cardWrapper: {
    width: '72%',
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.large,
  },
  shareLabel: {
    ...FontFamily.medium,
    fontSize: Typography.body.fontSize,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  btnFlex: {
    flex: 1,
  },
});
