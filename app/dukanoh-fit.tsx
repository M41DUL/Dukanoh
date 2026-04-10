import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { BottomBar } from '@/components/BottomBar';
import { Select } from '@/components/Select';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BorderRadius, Categories, ColorTokens, Colours, FontFamily, Occasions, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { supabase } from '@/lib/supabase';
import { proRankSort } from '@/utils/proRankSort';
import {
  getComplementaryCategories,
  getCompatibleColours,
  scoreMatch,
  type MatchInput,
} from '@/utils/styleMatch';

// ─── Constants ───────────────────────────────────────────────────────────────

const RATE_LIMIT_KEY = '@dukanoh/fit_searches_today';
const MAX_SEARCHES_PER_DAY = 10;

// Derive from theme — exclude meta/non-garment entries
const CATEGORIES = Categories.filter(c => !['All', 'Casualwear', 'Shoes'].includes(c));
const FABRIC_WEIGHTS = ['Light', 'Structured', 'Heavy'] as const;

type FabricWeight = typeof FABRIC_WEIGHTS[number];
type Step = 'form' | 'results';

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DukanohFitScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { user } = useAuth();
  const { blockedIds } = useBlocked();

  const {
    photoUri: paramPhotoUri,
    detectedCategory,
    detectedColour,
  } = useLocalSearchParams<{
    photoUri?: string;
    detectedCategory?: string;
    detectedColour?: string;
  }>();

  const [step, setStep] = useState<Step>('form');

  const [category, setCategory] = useState(detectedCategory ?? '');
  const [colour, setColour] = useState(detectedColour ?? '');
  const [occasion, setOccasion] = useState('');
  const [fabricWeight, setFabricWeight] = useState('');

  const [detectedFields] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (detectedCategory) s.add('category');
    if (detectedColour) s.add('colour');
    return s;
  });

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Listing[]>([]);

  // ─── Rate limit ────────────────────────────────────────────────────────────
  const checkRateLimit = useCallback(async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const today = new Date().toDateString();
      const data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      if (data.date !== today) return true;
      return data.count < MAX_SEARCHES_PER_DAY;
    } catch { return true; }
  }, []);

  const incrementRateLimit = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const today = new Date().toDateString();
      const data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      const newData = data.date === today
        ? { date: today, count: data.count + 1 }
        : { date: today, count: 1 };
      await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newData));
    } catch {}
  }, []);

  // ─── Run match ─────────────────────────────────────────────────────────────
  const runMatch = useCallback(async (input: MatchInput) => {
    if (!user) return;

    const allowed = await checkRateLimit();
    if (!allowed) {
      Alert.alert('Daily limit reached', 'You\'ve used all 10 Dukanoh Fit searches for today. Come back tomorrow.');
      return;
    }

    setLoading(true);
    setStep('results');

    const complementary = getComplementaryCategories(input.category);
    if (complementary.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const compat = getCompatibleColours(input.colour);
    const allCompatibleColours = [...compat.primary, ...compat.secondary];

    let q = supabase
      .from('listings')
      .select('*, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified)')
      .eq('status', 'available')
      .in('category', complementary)
      .neq('seller_id', user.id);

    if (blockedIds.length > 0) q = q.not('seller_id', 'in', `(${blockedIds.join(',')})`);

    if (allCompatibleColours.length > 0 && !['Beige', 'White', 'Other'].includes(input.colour)) {
      q = q.in('colour', allCompatibleColours);
    }

    const { data } = await q.order('save_count', { ascending: false }).limit(100);

    const listings = (data ?? []) as unknown as Listing[];

    const scored = listings
      .map(l => ({
        listing: l,
        score: scoreMatch(input, {
          category: (l as any).category,
          colour: (l as any).colour,
          occasion: (l as any).occasion,
          fabricWeight: (l as any).fabric_weight,
          save_count: (l as any).save_count,
        }),
        save_count: (l as any).save_count ?? 0,
      }))
      .sort((a, b) => b.score - a.score || b.save_count - a.save_count)
      .map(s => s.listing);

    const sellerCount = new Map<string, number>();
    const diverse = scored.filter(l => {
      const sid = (l as any).seller_id as string;
      const count = sellerCount.get(sid) ?? 0;
      if (count >= 2) return false;
      sellerCount.set(sid, count + 1);
      return true;
    });

    setResults(proRankSort(diverse));
    await incrementRateLimit();
    setLoading(false);
  }, [user, blockedIds, checkRateLimit, incrementRateLimit]);

  // ─── Training image (silent, background) ──────────────────────────────────
  const storeTrainingImage = useCallback((photoUri: string, confirmedCategory: string) => {
    ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    ).then(compressed => {
      if (!compressed.base64) return;
      const raw = compressed.base64;
      const imageBase64 = raw.includes(',') ? raw.split(',')[1] : raw;
      return supabase.functions.invoke('store-training-image', {
        body: { imageBase64, category: confirmedCategory },
      });
    }).catch(() => {});
  }, []);

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!category || !colour) {
      Alert.alert('Almost there', 'Please select a category and colour to continue.');
      return;
    }
    await runMatch({
      category,
      colour,
      occasion: occasion || undefined,
      fabricWeight: (fabricWeight as FabricWeight) || undefined,
    });
    // Fire training image upload in background — user never waits for this
    if (paramPhotoUri && category) {
      storeTrainingImage(paramPhotoUri, category);
    }
  }, [category, colour, occasion, fabricWeight, runMatch, paramPhotoUri, storeTrainingImage]);

  // ─── Results ───────────────────────────────────────────────────────────────
  if (step === 'results') {
    return (
      <ScreenWrapper>
        <Header title="Dukanoh Fit" showBack />
        {loading ? (
          <LoadingSpinner />
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => router.push(`/listing/${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                heading="No matches found"
                subtext="Try a different colour or occasion and we'll find the right pieces."
                ctaLabel="Try again"
                onCta={() => { setStep('form'); setResults([]); }}
              />
            }
          />
        )}
      </ScreenWrapper>
    );
  }

  // ─── Form ──────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <Header title="Dukanoh Fit" showBack />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {paramPhotoUri ? (
          <Image source={{ uri: paramPhotoUri }} style={styles.photo} contentFit="cover" />
        ) : null}

        {/* Category */}
        <View style={styles.section}>
          {detectedFields.has('category') && (
            <View style={styles.labelRow}>
              <Text style={styles.sectionLabel}>Category <Text style={styles.required}>*</Text></Text>
              <Text style={styles.detectedTag}>Detected</Text>
            </View>
          )}
          <Select
            label={detectedFields.has('category') ? undefined : 'Category *'}
            placeholder="Select category"
            value={category}
            options={CATEGORIES}
            onSelect={v => setCategory(v)}
          />
        </View>

        {/* Colour */}
        <View style={styles.section}>
          {detectedFields.has('colour') && (
            <View style={styles.labelRow}>
              <Text style={styles.sectionLabel}>Colour <Text style={styles.required}>*</Text></Text>
              <Text style={styles.detectedTag}>Detected</Text>
            </View>
          )}
          <Select
            label={detectedFields.has('colour') ? undefined : 'Colour *'}
            placeholder="Select colour"
            value={colour}
            options={Colours}
            onSelect={v => setColour(v)}
          />
        </View>

        {/* Occasion */}
        <View style={styles.section}>
          <Select
            label="Occasion (optional)"
            placeholder="Select occasion"
            value={occasion}
            options={Occasions}
            onSelect={v => setOccasion(v)}
          />
        </View>

        {/* Fabric weight */}
        <View style={styles.section}>
          <Select
            label="Fabric weight (optional)"
            placeholder="Select fabric weight"
            value={fabricWeight}
            options={FABRIC_WEIGHTS}
            onSelect={v => setFabricWeight(v)}
          />
        </View>
      </ScrollView>

      <BottomBar>
        <Button
          label="Find my fit"
          variant="primary"
          onPress={handleSubmit}
          disabled={!category || !colour}
          style={{ flex: 1 }}
        />
      </BottomBar>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scroll: {
      paddingBottom: Spacing['4xl'],
    },
    photo: {
      width: '100%',
      height: 320,
      borderRadius: BorderRadius.large,
      marginBottom: Spacing.lg,
    },
    section: { marginBottom: Spacing.lg },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    sectionLabel: {
      ...Typography.label,
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
    },
    detectedTag: {
      ...Typography.micro,
      color: colors.primary,
      fontFamily: FontFamily.semibold,
      backgroundColor: `${colors.primary}18`,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    required: { color: colors.error },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },
    gridContent: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['4xl'] },
  });
}
