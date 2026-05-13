import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Animated,
  Easing,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import {
  lightColors,
  Spacing,
  BorderRadius,
  FontFamily,
} from '@/constants/theme';
import {
  ONBOARDING_CATEGORIES,
  getSubtitleText,
  toggleCategory as toggleCat,
} from '@/constants/onboardingHelpers';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';

// ─── Pill selector ──────────────────────────────────────────

function PillSelector({
  label,
  selected,
  onPress,
  index,
  animate,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  index: number;
  animate: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: 350,
      delay: 80 + index * 55,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-time entrance — entrance is a stable Animated.Value ref

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 10, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [{ scale: Animated.multiply(entrance, scale) }],
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <View style={[pillStyles.pill, selected ? pillStyles.pillSelected : pillStyles.pillMuted]}>
          <Text style={[pillStyles.label, { color: selected ? '#0D0D0D' : '#FFFFFF' }]}>
            {label}
          </Text>
          <View style={[pillStyles.indicator, selected ? pillStyles.indicatorSelected : pillStyles.indicatorMuted]}>
            {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main screen ────────────────────────────────────────────

export default function OnboardingScreen() {
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const isReset = reset === 'true';

  const [showWelcome, setShowWelcome] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [animatePills, setAnimatePills] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    requestAnimationFrame(() => setAnimatePills(true));
    if (!isReset) {
      const timer = setTimeout(() => setShowWelcome(true), 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional mount-only — isReset is a prop that doesn't change after mount

  // Android hardware back — consume the event to prevent app exit
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => handler.remove();
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => toggleCat(prev, cat));
  }, []);

  const saveAndNavigate = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000),
    );
    try {
      await Promise.race([
        (async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { error: updateError } = await supabase
              .from('users')
              .update({
                preferred_categories: selectedCategories,
                onboarding_completed: true,
              })
              .eq('id', user.id);
            if (updateError) throw updateError;
          }
          router.replace('/(tabs)');
        })(),
        timeout,
      ]);
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'timeout'
          ? 'Taking too long. Check your connection and try again.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const categoryCount = selectedCategories.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Small wordmark top-left — matches intro */}
      <View style={styles.header}>
        <DukanohLogo width={80} height={14} color={lightColors.secondary} />
      </View>

      {/* Hero card — heading + pills all scroll together inside */}
      <View style={styles.heroCard}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headingBlock}>
            <Text style={styles.counter}>{getSubtitleText(categoryCount)}</Text>
          </View>

          {ONBOARDING_CATEGORIES.map((cat, i) => (
            <PillSelector
              key={cat}
              label={cat}
              selected={selectedCategories.includes(cat)}
              onPress={() => toggleCategory(cat)}
              index={i}
              animate={animatePills}
            />
          ))}
        </ScrollView>
      </View>

      {/* CTA */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.base) }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Show me my feed"
          onPress={saveAndNavigate}
          variant="secondary"
          disabled={categoryCount === 0}
          loading={saving}
        />
      </View>

      {/* Welcome bottom sheet — only on first signup, not profile reset */}
      <BottomSheet
        visible={showWelcome}
        onClose={() => setShowWelcome(false)}
        backgroundColor={lightColors.primary}
        handleColor="rgba(255,255,255,0.3)"
        bottomPadding={0}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetHeading} numberOfLines={1} adjustsFontSizeToFit>
            Your feed, your vibe.
          </Text>
          <Text style={styles.sheetSubtitle}>
            Pick the categories you love. Your home feed reshapes around them. Change it up any time in Settings.
          </Text>
          <Button
            label="Let's pick"
            onPress={() => setShowWelcome(false)}
            variant="secondary"
            style={styles.sheetButton}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.primary,
  },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.base,
  },
  heroCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#1E1C8A',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  headingBlock: {
    paddingTop: Spacing.lg,
    // Compensate for the scroll container's gap (Spacing.sm) so the visual
    // whitespace above and below the counter matches.
    paddingBottom: Spacing.lg - Spacing.sm,
    alignItems: 'center',
  },
  counter: {
    fontSize: 14,
    ...FontFamily.medium,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    gap: Spacing.sm,
  },
  error: {
    fontSize: 12,
    ...FontFamily.regular,
    color: '#FF8888',
    textAlign: 'center',
  },

  // Welcome sheet — centered copy, indigo bg, flush CTA
  sheetContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  sheetHeading: {
    fontSize: 32,
    ...FontFamily.black,
    fontWeight: Platform.OS === 'android' ? 'normal' : FontFamily.black.fontWeight,
    color: '#FFFFFF',
    lineHeight: 38,
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontSize: 15,
    ...FontFamily.regular,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  sheetButton: {
    marginTop: Spacing.xl,
    alignSelf: 'stretch',
  },
});

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    height: 64,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  pillMuted: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.20)',
  },
  pillSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  label: {
    fontSize: 18,
    ...FontFamily.bold,
    letterSpacing: 0.2,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorMuted: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  indicatorSelected: {
    backgroundColor: '#0D0D0D',
  },
});
