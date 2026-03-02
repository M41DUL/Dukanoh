import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StarRating } from '@/components/StarRating';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface SellerProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  rating_avg: number;
  rating_count: number;
}

export default function SellerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase
        .from('users')
        .select('id, username, full_name, avatar_url, bio, rating_avg, rating_count')
        .eq('id', id)
        .single(),
      supabase
        .from('listings')
        .select('*, seller:users(username, avatar_url)')
        .eq('seller_id', id)
        .eq('status', 'available')
        .order('created_at', { ascending: false }),
    ]).then(([{ data: profileData }, { data: listingData }]) => {
      if (profileData) setProfile(profileData as SellerProfile);
      setListings((listingData ?? []) as unknown as Listing[]);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!profile) return null;

  const isOwnProfile = user?.id === id;

  return (
    <ScreenWrapper>
      <Header showBack title={`@${profile.username}`} />
      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            variant="grid"
            onPress={() => router.push(`/listing/${item.id}`)}
          />
        )}
        ListHeaderComponent={
          <View style={styles.profileHeader}>
            <Avatar
              uri={profile.avatar_url}
              initials={profile.full_name?.[0]?.toUpperCase() ?? profile.username[0]?.toUpperCase()}
              size="large"
            />
            <View style={styles.info}>
              <Text style={styles.name}>{profile.full_name || profile.username}</Text>
              <Text style={styles.username}>@{profile.username}</Text>
              {profile.rating_count > 0 ? (
                <View style={styles.ratingRow}>
                  <StarRating rating={profile.rating_avg} size={13} />
                  <Text style={styles.ratingText}>
                    {profile.rating_avg.toFixed(1)} ({profile.rating_count})
                  </Text>
                </View>
              ) : (
                <Text style={styles.noRating}>No reviews yet</Text>
              )}
            </View>
            {profile.bio ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : null}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{listings.length}</Text>
                <Text style={styles.statLabel}>listings</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="shirt-outline" size={48} color={colors.textSecondary} />}
            heading="No listings yet"
            subtext={isOwnProfile ? 'Your listings will appear here.' : 'This seller has no active listings.'}
          />
        }
      />
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
    profileHeader: {
      paddingVertical: Spacing.xl,
      gap: Spacing.sm,
    },
    info: { gap: 2 },
    name: {
      ...Typography.subheading,
      color: colors.textPrimary,
      fontFamily: 'Inter_700Bold',
    },
    username: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginTop: 2,
    },
    ratingText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    noRating: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    bio: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: Spacing.xs,
    },
    statsRow: {
      flexDirection: 'row',
      gap: Spacing.xl,
      marginTop: Spacing.sm,
    },
    stat: { alignItems: 'center' },
    statValue: {
      ...Typography.subheading,
      color: colors.textPrimary,
      fontFamily: 'Inter_700Bold',
    },
    statLabel: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
  });
}
