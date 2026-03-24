import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  UIManager,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SearchBar, SearchBarHandle } from '@/components/SearchBar';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { Divider } from '@/components/Divider';
import {
  Typography,
  Spacing,
  BorderRadius,
  ColorTokens,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ─── Constants ──────────────────────────────────────────────

const HERO_BANNER_1 = require('@/assets/images/hero-banner-1.png');
const HERO_BANNER_2 = require('@/assets/images/hero-banner-2.png');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Tab system ─────────────────────────────────────────────

type BrowseTab = 'Women' | 'Men' | 'All';
const BROWSE_TABS: BrowseTab[] = ['Women', 'Men', 'All'];

const TAB_CONFIG: Record<BrowseTab, { categories: string[]; occasions: string[] }> = {
  Women: {
    categories: ['Lehenga', 'Saree', 'Anarkali', 'Kurta', 'Casualwear', 'Shoes'],
    occasions: ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'],
  },
  Men: {
    categories: ['Sherwani', 'Kurta', 'Achkan', 'Pathani Suit', 'Casualwear', 'Shoes'],
    occasions: ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'],
  },
  All: {
    categories: ['Lehenga', 'Saree', 'Sherwani', 'Anarkali', 'Kurta', 'Achkan', 'Pathani Suit', 'Casualwear', 'Shoes'],
    occasions: ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'],
  },
};

// ─── Browse row component ───────────────────────────────────

function BrowseRow({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <TouchableOpacity
      style={browseRowStyles.row}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[browseRowStyles.label, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const browseRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: (Spacing.md + 2) * 2,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
});

// ─── Hero banner component ──────────────────────────────────

function HeroBanner({ source, onPress }: { source: number; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={heroBannerStyles.container}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <Image
        source={source}
        style={heroBannerStyles.image}
        contentFit="cover"
        transition={300}
      />
    </TouchableOpacity>
  );
}

const heroBannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    height: 180,
    marginVertical: Spacing.base,
  },
  image: {
    flex: 1,
  },
});

// ─── Main screen ────────────────────────────────────────────

export default function SearchScreen() {
  const { q: incomingQuery, focus: incomingFocus } = useLocalSearchParams<{ q?: string; focus?: string }>();
  const searchBarRef = useRef<SearchBarHandle>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<BrowseTab>('Women');
  const tabFade = useRef(new Animated.Value(1)).current;
  const { saveSearch } = useSearchHistory();
  const { user } = useAuth();

  // Set default tab from user's onboarding preferences
  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('preferred_categories')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const cats: string[] = data?.preferred_categories ?? [];
        if (cats.includes('Men') && !cats.includes('Women')) setActiveTab('Men');
        else if (cats.includes('Women')) setActiveTab('Women');
        else setActiveTab('All');
      });
  }, [user]);

  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ─── Navigation helpers ────────────────────────────────
  const openCategory = useCallback((cat: string) => {
    router.push({
      pathname: '/listings',
      params: { title: cat, categories: cat },
    });
  }, []);

  const openOccasion = useCallback((occ: string) => {
    router.push({
      pathname: '/listings',
      params: { title: occ, occasion: occ },
    });
  }, []);

  const openSearch = useCallback((term: string) => {
    saveSearch(term);
    router.push({
      pathname: '/listings',
      params: { title: `\u201C${term}\u201D`, query: term },
    });
  }, [saveSearch]);

  // Handle incoming search from home tab
  useEffect(() => {
    if (incomingQuery?.trim()) {
      openSearch(incomingQuery.trim());
      router.setParams({ q: '' });
    }
  }, [incomingQuery, openSearch]);

  // Handle incoming focus request from home tab
  useEffect(() => {
    if (incomingFocus === '1') {
      setTimeout(() => searchBarRef.current?.focus(), 100);
      router.setParams({ focus: '' });
    }
  }, [incomingFocus]);

  // ─── Render ─────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <View style={styles.searchBarWrapper}>
        <SearchBar
          ref={searchBarRef}
          value={query}
          onChangeText={setQuery}
          showHistory
          onFocusChange={setSearchFocused}
          onSubmit={(term) => {
            if (term.trim()) openSearch(term);
          }}
        />
      </View>

      {/* ── Tab bar + Browse directory ────────────────────── */}
      {!searchFocused && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.browseContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.browseScroll}>
          <View style={styles.tabBar}>
            {BROWSE_TABS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => {
                  if (tab === activeTab) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Animated.timing(tabFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
                    setActiveTab(tab);
                    Animated.timing(tabFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Animated.View style={{ opacity: tabFade }}>
            {TAB_CONFIG[activeTab].categories.map((cat, i) => (
              <React.Fragment key={cat}>
                <BrowseRow label={cat} onPress={() => openCategory(cat)} colors={colors} />
                {i < TAB_CONFIG[activeTab].categories.length - 1 && <Divider style={styles.rowDivider} />}
              </React.Fragment>
            ))}

            <HeroBanner
              source={activeTab === 'Men' ? HERO_BANNER_2 : HERO_BANNER_1}
              onPress={() => openCategory(activeTab === 'All' ? 'Women' : activeTab)}
            />

            {TAB_CONFIG[activeTab].occasions.map((occ, i) => (
              <React.Fragment key={occ}>
                <BrowseRow label={occ} onPress={() => openOccasion(occ)} colors={colors} />
                {i < TAB_CONFIG[activeTab].occasions.length - 1 && <Divider style={styles.rowDivider} />}
              </React.Fragment>
            ))}

            <HeroBanner
              source={activeTab === 'Men' ? HERO_BANNER_1 : HERO_BANNER_2}
              onPress={() => openOccasion('Wedding')}
            />
          </Animated.View>
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Search bar
    searchBarWrapper: {
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      zIndex: 10,
    },

    // Tab bar
    tabBar: {
      flexDirection: 'row',
      gap: Spacing.lg,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
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
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textSecondary,
    },
    tabLabelActive: {
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },

    // Browse directory
    browseScroll: {
      zIndex: 1,
    },
    browseContent: {
      paddingBottom: Spacing['3xl'],
    },
    rowDivider: {
      marginVertical: 0,
    },
  });
}
