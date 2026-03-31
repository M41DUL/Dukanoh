import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { StarRating } from '@/components/StarRating';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface QuickAction {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
}

const STALE_MS = 30_000;

const quickActions: QuickAction[] = [
  { icon: 'bag-outline', label: 'My Listings', onPress: () => router.push('/orders') },
  { icon: 'gift-outline', label: 'Invite', onPress: () => router.push('/invite-friends') },
  { icon: 'heart-outline', label: 'Saved', onPress: () => router.push('/saved') },
  { icon: 'settings-outline', label: 'Settings', onPress: () => router.push('/settings') },
];

export default function ProfileScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const username = user?.user_metadata?.username ?? 'username';
  const lastFetchedRef = useRef<number>(0);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('users')
      .select('full_name, avatar_url, rating_avg, rating_count')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('fetchProfile failed:', error.message);
      return;
    }
    if (data) {
      const name = data.full_name === 'New User' ? '' : (data.full_name ?? '');
      setProfileName(name);
      setProfileAvatar(data.avatar_url ?? undefined);
      setRatingAvg(data.rating_avg ?? 0);
      setRatingCount(data.rating_count ?? 0);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastFetchedRef.current > STALE_MS) {
      fetchProfile();
      lastFetchedRef.current = now;
    }
  }, [fetchProfile]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchedRef.current = 0;
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  return (
    <ScreenWrapper contentStyle={{ paddingHorizontal: 0 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Centered profile header ── */}
        <View style={styles.profileHeader}>
          <Avatar
            uri={profileAvatar}
            initials={(profileName || username)[0]?.toUpperCase()}
            size="xlarge"
          />
          {profileName ? (
            <Text style={styles.name}>{profileName}</Text>
          ) : null}
          <Text style={styles.username}>@{username}</Text>
          {ratingCount > 0 ? (
            <View style={styles.ratingRow}>
              <StarRating rating={ratingAvg} size={14} />
              <Text style={styles.ratingText}>
                {ratingAvg.toFixed(1)} ({ratingCount})
              </Text>
            </View>
          ) : (
            <Text style={styles.noReviews}>No reviews yet</Text>
          )}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/edit-profile')}
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick action icons ── */}
        <View style={styles.quickActions}>
          {quickActions.map(action => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickAction}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name={action.icon} size={24} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Recently viewed ── */}

      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingBottom: Spacing['3xl'],
    },
    padded: {
      paddingHorizontal: Spacing.base,
    },

    // Profile header
    profileHeader: {
      alignItems: 'center',
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing.xl,
      gap: Spacing.xs,
    },
    name: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginTop: Spacing.lg,
    },
    username: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    ratingText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    noReviews: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    editBtn: {
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
    },
    editBtnText: {
      ...Typography.label,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },

    // Quick actions
    quickActions: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['2xl'],
      paddingHorizontal: Spacing.base,
    },
    quickAction: {
      alignItems: 'center',
      gap: Spacing.xs,
      flex: 1,
    },
    quickActionIcon: {
      width: 52,
      height: 52,
      borderRadius: 52 / 2,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_500Medium',
    },



  });
}
