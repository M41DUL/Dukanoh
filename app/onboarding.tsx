import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import {
  Typography,
  Spacing,
  FontFamily,
  Categories,
  ColorTokens,
} from '@/constants/theme';
import {
  LOGO_FINAL_W,
  LOGO_FINAL_H,
  LOGO_TRANSLATE_X,
  LOGO_TRANSLATE_Y,
} from '@/constants/logoLayout';
import { useThemeColors } from '@/hooks/useThemeColors';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';

const { width: SCREEN_W } = Dimensions.get('window');

const ONBOARDING_CATEGORIES = Categories.filter((c) => c !== 'All');

// ─── Bubble layout data ─────────────────────────────────────
type BubbleLayout = { left: number; top: number; size: number };

const CATEGORY_LAYOUT: BubbleLayout[] = [
  { left: 0.02, top: 0.00, size: 84 },
  { left: 0.30, top: 0.02, size: 88 },
  { left: 0.60, top: 0.00, size: 82 },
  { left: 0.08, top: 0.18, size: 86 },
  { left: 0.40, top: 0.16, size: 90 },
  { left: 0.72, top: 0.18, size: 80 },
  { left: 0.02, top: 0.36, size: 88 },
  { left: 0.34, top: 0.34, size: 84 },
  { left: 0.12, top: 0.52, size: 86 },
  { left: 0.48, top: 0.54, size: 82 },
];

// ─── Animated bubble ────────────────────────────────────────

function Bubble({
  label,
  active,
  onPress,
  layout,
  index,
  animate,
  colors,
  areaHeight,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  layout: BubbleLayout;
  index: number;
  animate: boolean;
  colors: ColorTokens;
  areaHeight: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: 400,
      delay: index * 60,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePress = async () => {
    await Haptics.selectionAsync();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 20,
        bounciness: 14,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  const containerWidth = SCREEN_W - Spacing.base * 2;
  const bubbleSize = active ? layout.size * 1.12 : layout.size;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: layout.left * containerWidth,
        top: layout.top * areaHeight,
        opacity: entrance,
        transform: [{ scale: Animated.multiply(entrance, scale) }],
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          bubbleStyles.bubble,
          {
            width: bubbleSize,
            height: bubbleSize,
            borderRadius: bubbleSize / 2,
            backgroundColor: active ? colors.secondary : 'rgba(0,0,0,0.06)',
            borderColor: active ? colors.secondary : 'rgba(0,0,0,0.12)',
          },
        ]}
      >
        <Text
          style={[
            bubbleStyles.label,
            {
              color: active ? '#0D0D0D' : colors.textPrimary,
              fontSize: label.length > 8 ? 11 : 13,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  label: {
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
});

// ─── Main screen ────────────────────────────────────────────

export default function OnboardingScreen() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [animateBubbles, setAnimateBubbles] = useState(false);
  const [bubbleAreaHeight, setBubbleAreaHeight] = useState(0);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Start bubble animation immediately, show welcome sheet after a short delay
  useEffect(() => {
    requestAnimationFrame(() => setAnimateBubbles(true));
    const timer = setTimeout(() => setShowWelcome(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }, []);

  const saveAndNavigate = async () => {
    if (saving) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({
          preferred_categories: selectedCategories,
          onboarding_completed: true,
        })
        .eq('id', user.id);
    }
    router.replace('/(tabs)/');
  };

  const categoryCount = selectedCategories.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Big watermark logo at bottom */}
      <View style={styles.logoContainer}>
        <View
          style={{
            transform: [
              { translateX: LOGO_TRANSLATE_X },
              { translateY: LOGO_TRANSLATE_Y },
            ],
          }}
        >
          <DukanohLogo width={LOGO_FINAL_W} height={LOGO_FINAL_H} />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>What are you into?</Text>
        <Text style={styles.subtitle}>Pick at least one</Text>

        <View style={styles.heroCard}>
          <View
            style={styles.bubbleArea}
            onLayout={(e) => setBubbleAreaHeight(e.nativeEvent.layout.height)}
          >
            {bubbleAreaHeight > 0 && ONBOARDING_CATEGORIES.map((cat, i) => (
              <Bubble
                key={cat}
                label={cat}
                active={selectedCategories.includes(cat)}
                onPress={() => toggleCategory(cat)}
                layout={CATEGORY_LAYOUT[i]}
                index={i}
                animate={animateBubbles}
                colors={colors}
                areaHeight={bubbleAreaHeight}
              />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            label="Finish"
            onPress={saveAndNavigate}
            variant="primary"
            disabled={categoryCount === 0}
            loading={saving}
          />
        </View>

        <View style={styles.logoSpacer} />
      </View>

      {/* Welcome bottom sheet */}
      <BottomSheet visible={showWelcome} onClose={() => setShowWelcome(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetHeading}>{"Let\u2019s personalise\nyour feed"}</Text>
          <Text style={styles.sheetSubtitle}>
            {"Dukanoh is built around what you love. Tell us what catches your eye and we\u2019ll curate a feed that feels like it was made for you."}
          </Text>
          <Text style={styles.sheetStep}>
            <Text style={styles.sheetStepBold}>Pick your categories</Text>
            {" \u2014 tap the bubbles behind this sheet to select the styles you\u2019re into. Casualwear, festive, wedding \u2014 whatever you\u2019re looking for."}
          </Text>
          <Text style={styles.sheetStep}>
            <Text style={styles.sheetStepBold}>{"We\u2019ll do the rest"}</Text>
            {" \u2014 your home feed, search results and recommendations will all be shaped by what you choose. You can always update this later in your profile."}
          </Text>
          <Button
            label="Get started"
            onPress={() => setShowWelcome(false)}
            variant="primary"
            style={styles.sheetButton}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    logoContainer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    content: {
      flex: 1,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.xl,
    },

    heading: {
      ...Typography.heading,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    subtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },

    // Hero card
    heroCard: {
      flex: 1,
      borderRadius: 24,
      backgroundColor: colors.primaryLight,
      marginTop: Spacing.base,
      marginBottom: Spacing.base,
      overflow: 'hidden',
    },
    bubbleArea: {
      flex: 1,
      margin: Spacing.base,
    },

    // Footer
    footer: {
      gap: Spacing.base,
    },
    logoSpacer: {
      height: LOGO_FINAL_H - 60,
    },

    // Welcome sheet
    sheetContent: {
      paddingHorizontal: Spacing.xs,
    },
    sheetHeading: {
      ...Typography.heading,
      color: colors.textPrimary,
      marginBottom: Spacing.sm,
    },
    sheetSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: Spacing.base,
    },
    sheetStep: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: Spacing.sm,
    },
    sheetStepBold: {
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    sheetButton: {
      marginTop: Spacing.base,
      width: '100%',
    },
  });
}
