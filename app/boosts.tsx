import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProColors } from '@/hooks/useProColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { FontFamily, Spacing, BorderRadius, Typography } from '@/constants/theme';

// Pro users get 3 story boosts per calendar month (matches HUB_FEATURES copy)
const MONTHLY_BOOST_LIMIT = 3;
// Each boost lasts 7 days
const BOOST_DURATION_DAYS = 7;

interface BoostListing {
  id: string;
  title: string;
  price: number;
  images: string[];
  is_boosted: boolean;
  boost_expires_at: string | null;
}

interface UserBoostMeta {
  boosts_used: number;
  boosts_reset_at: string | null;
}

export default function BoostsScreen() {
  const P = useProColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [listings, setListings] = useState<BoostListing[]>([]);
  const [meta, setMeta] = useState<UserBoostMeta>({ boosts_used: 0, boosts_reset_at: null });
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const styles = useMemo(() => getStyles(P), [P]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [{ data: userData }, { data: listingsData }] = await Promise.all([
      supabase
        .from('users')
        .select('boosts_used, boosts_reset_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('listings')
        .select('id, title, price, images, is_boosted, boost_expires_at')
        .eq('seller_id', user.id)
        .eq('status', 'available')
        .order('created_at', { ascending: false }),
    ]);
    if (userData) {
      // Reset counter if we've passed the reset date (server-side cron may lag)
      const resetAt = userData.boosts_reset_at ? new Date(userData.boosts_reset_at) : null;
      const used = resetAt && resetAt < new Date() ? 0 : (userData.boosts_used ?? 0);
      setMeta({ boosts_used: used, boosts_reset_at: userData.boosts_reset_at });
    }
    setListings((listingsData ?? []) as BoostListing[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const boostsRemaining = Math.max(0, MONTHLY_BOOST_LIMIT - meta.boosts_used);
  const resetDate = meta.boosts_reset_at
    ? new Date(meta.boosts_reset_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  const handleToggleBoost = useCallback(async (listing: BoostListing) => {
    if (!user) return;

    if (listing.is_boosted) {
      // Cancel boost
      Alert.alert(
        'Remove boost?',
        `"${listing.title}" will no longer be shown in Stories.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setTogglingId(listing.id);
              const { error } = await supabase
                .from('boosts')
                .delete()
                .eq('listing_id', listing.id)
                .eq('seller_id', user.id);
              if (error) {
                Alert.alert('Something went wrong', 'Please try again.');
              } else {
                await supabase
                  .from('listings')
                  .update({ is_boosted: false, boost_expires_at: null })
                  .eq('id', listing.id);
                await supabase
                  .from('users')
                  .update({ boosts_used: Math.max(0, meta.boosts_used - 1) })
                  .eq('id', user.id);
                fetchData();
              }
              setTogglingId(null);
            },
          },
        ]
      );
      return;
    }

    // Add boost
    if (boostsRemaining <= 0) {
      Alert.alert(
        'No boosts remaining',
        resetDate
          ? `Your 3 monthly boosts reset on ${resetDate}.`
          : 'Your monthly boosts will reset at the start of next month.',
      );
      return;
    }

    setTogglingId(listing.id);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + BOOST_DURATION_DAYS);

    const { error } = await supabase.from('boosts').insert({
      listing_id: listing.id,
      seller_id: user.id,
      expires_at: expiresAt.toISOString(),
      amount_paid: 0,
    });

    if (error) {
      Alert.alert('Something went wrong', 'Please try again.');
    } else {
      await supabase
        .from('listings')
        .update({ is_boosted: true, boost_expires_at: expiresAt.toISOString() })
        .eq('id', listing.id);
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1, 1);
      nextReset.setHours(0, 0, 0, 0);
      await supabase
        .from('users')
        .update({
          boosts_used: meta.boosts_used + 1,
          boosts_reset_at: meta.boosts_reset_at ?? nextReset.toISOString(),
        })
        .eq('id', user.id);
      fetchData();
    }
    setTogglingId(null);
  }, [user, meta, boostsRemaining, resetDate, fetchData]);

  const activeBoosted = listings.filter(l => l.is_boosted);
  const unboosted = listings.filter(l => !l.is_boosted);

  return (
    <LinearGradient
      colors={[P.gradientTop, P.gradientBottom]}
      style={styles.root}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={16}>
          <Ionicons name="chevron-back" size={22} color={P.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: P.textPrimary }]}>Story Boosts</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator color={P.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing['3xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Quota card */}
          <View style={[styles.card, { borderColor: P.primary + '30', borderWidth: 1 }]}>
            <View style={styles.quotaRow}>
              <View style={styles.quotaCircle}>
                <Text style={[styles.quotaNum, { color: P.primary }]}>{boostsRemaining}</Text>
                <Text style={[styles.quotaOf, { color: P.textSecondary }]}>left</Text>
              </View>
              <View style={styles.quotaInfo}>
                <Text style={[styles.quotaTitle, { color: P.textPrimary }]}>
                  {boostsRemaining} of {MONTHLY_BOOST_LIMIT} boosts remaining
                </Text>
                <Text style={[styles.quotaNote, { color: P.textSecondary }]}>
                  Boosted listings are featured in Stories for {BOOST_DURATION_DAYS} days.
                  {resetDate ? ` Resets ${resetDate}.` : ' Resets at the start of each month.'}
                </Text>
              </View>
            </View>
          </View>

          {/* Active boosts */}
          {activeBoosted.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: P.textSecondary }]}>Active boosts</Text>
              {activeBoosted.map(listing => (
                <BoostRow
                  key={listing.id}
                  listing={listing}
                  onToggle={() => handleToggleBoost(listing)}
                  toggling={togglingId === listing.id}
                  P={P}
                />
              ))}
            </>
          )}

          {/* Available listings */}
          {unboosted.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: P.textSecondary }]}>
                {activeBoosted.length > 0 ? 'Other listings' : 'Your listings'}
              </Text>
              {unboosted.map(listing => (
                <BoostRow
                  key={listing.id}
                  listing={listing}
                  onToggle={() => handleToggleBoost(listing)}
                  toggling={togglingId === listing.id}
                  P={P}
                  disabled={boostsRemaining <= 0}
                />
              ))}
            </>
          )}

          {listings.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="flash-outline" size={32} color={P.textSecondary} />
              <Text style={[styles.emptyText, { color: P.textSecondary }]}>
                You have no active listings to boost yet.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

// ── Listing row ────────────────────────────────────────────────

interface BoostRowProps {
  listing: BoostListing;
  onToggle: () => void;
  toggling: boolean;
  P: ReturnType<typeof useProColors>;
  disabled?: boolean;
}

function BoostRow({ listing, onToggle, toggling, P, disabled }: BoostRowProps) {
  const imageUri = listing.images?.[0];
  const expiresDate = listing.boost_expires_at
    ? new Date(listing.boost_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  return (
    <View style={[rowStyles.row, { backgroundColor: P.surface, borderColor: listing.is_boosted ? P.primary + '40' : P.border }]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={rowStyles.thumb} />
      ) : (
        <View style={[rowStyles.thumb, { backgroundColor: P.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="image-outline" size={16} color={P.textSecondary} />
        </View>
      )}

      <View style={rowStyles.info}>
        <Text style={[rowStyles.title, { color: P.textPrimary }]} numberOfLines={1}>{listing.title}</Text>
        <Text style={[rowStyles.price, { color: P.primary }]}>£{listing.price.toFixed(0)}</Text>
        {listing.is_boosted && expiresDate && (
          <Text style={[rowStyles.expires, { color: P.textSecondary }]}>Boosted · expires {expiresDate}</Text>
        )}
      </View>

      {toggling ? (
        <ActivityIndicator size="small" color={P.primary} />
      ) : listing.is_boosted ? (
        <TouchableOpacity style={[rowStyles.badge, { backgroundColor: P.primary }]} onPress={onToggle} hitSlop={8}>
          <Ionicons name="flash" size={12} color={P.gradientBottom} />
          <Text style={[rowStyles.badgeText, { color: P.gradientBottom }]}>Boosted</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[rowStyles.boostBtn, { borderColor: disabled ? P.border : P.primary, opacity: disabled ? 0.4 : 1 }]}
          onPress={onToggle}
          disabled={disabled}
          hitSlop={8}
        >
          <Ionicons name="flash-outline" size={12} color={P.primary} />
          <Text style={[rowStyles.boostBtnText, { color: P.primary }]}>Boost</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.medium,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.body,
    fontFamily: FontFamily.medium,
  },
  price: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
  },
  expires: {
    ...Typography.caption,
    marginTop: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
  },
  boostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    minWidth: 64,
    justifyContent: 'center',
  },
  boostBtnText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
  },
});

function getStyles(P: ReturnType<typeof useProColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.md,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: P.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: FontFamily.semibold,
    },
    scroll: {
      paddingHorizontal: Spacing.xl,
      gap: Spacing.md,
    },
    card: {
      backgroundColor: P.surface,
      borderRadius: BorderRadius.large,
      padding: Spacing.xl,
    },
    quotaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.lg,
    },
    quotaCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: P.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    quotaNum: {
      fontSize: 22,
      fontFamily: FontFamily.black,
      lineHeight: 26,
    },
    quotaOf: {
      fontSize: 10,
      fontFamily: FontFamily.medium,
    },
    quotaInfo: {
      flex: 1,
      gap: 4,
    },
    quotaTitle: {
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      lineHeight: 20,
    },
    quotaNote: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: Spacing.xs,
    },
    empty: {
      alignItems: 'center',
      gap: Spacing.md,
      paddingTop: Spacing['3xl'],
    },
    emptyText: {
      fontSize: 15,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}
