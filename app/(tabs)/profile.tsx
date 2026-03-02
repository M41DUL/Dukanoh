import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Image, FlatList, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import type { ThemePreference } from '@/context/ThemeContext';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function ProfileScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const { preference, setPreference } = useTheme();
  const [listings, setListings] = useState<Listing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { items: recentItems, reload: reloadRecent } = useRecentlyViewed(user?.id);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const fetchListings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('listings')
      .select('*, seller:users(username, avatar_url)')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });
    setListings((data ?? []) as unknown as Listing[]);
  }, [user]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useFocusEffect(useCallback(() => { reloadRecent(); }, [reloadRecent]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchListings(), reloadRecent()]);
    setRefreshing(false);
  }, [fetchListings, reloadRecent]);

  const handleResetPreferences = () => {
    Alert.alert(
      'Reset preferences',
      'This will take you back through the discovery flow.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await supabase
              .from('users')
              .update({ preferred_categories: [], onboarding_completed: false })
              .eq('id', user.id);
            await refreshProfile();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const username = user?.user_metadata?.username ?? 'username';
  const fullName = user?.user_metadata?.full_name ?? 'Your Name';
  const bio = user?.user_metadata?.bio ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <ScreenWrapper>
      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            variant="grid"
            onPress={() => router.push(`/listing/${item.id}`)}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.profileHeader}>
              <Avatar uri={avatarUrl} initials={fullName[0]?.toUpperCase()} size="large" />
              <View style={styles.info}>
                <Text style={styles.name}>{fullName}</Text>
                <Text style={styles.username}>@{username}</Text>
                {bio ? <Text style={styles.bio}>{bio}</Text> : null}
              </View>
            </View>
            <Divider />
            {recentItems.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.sectionLabel}>Recently viewed</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.recentScroll}
                  contentContainerStyle={styles.recentContent}
                >
                  {recentItems.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.recentCard}
                      onPress={() => router.push(`/listing/${item.id}`)}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: item.images?.[0] }}
                        style={styles.recentImage}
                        resizeMode="cover"
                      />
                      <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.recentPrice}>£{item.price?.toFixed(2)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Divider />
              </View>
            )}
            <Text style={styles.sectionLabel}>Listings</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            heading="No listings yet"
            subtext="List your first item to start selling."
            ctaLabel="Start selling"
            onCta={() => router.push('/(tabs)/sell')}
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {/* Theme picker */}
            <View style={styles.themeRow}>
              {THEME_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.themeBtn,
                    preference === opt.value && styles.themeBtnActive,
                  ]}
                  onPress={() => setPreference(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.themeBtnText,
                      preference === opt.value && styles.themeBtnTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button
              label="Reset feed preferences"
              variant="ghost"
              onPress={handleResetPreferences}
            />
            <Button
              label="Sign out"
              variant="outline"
              onPress={signOut}
              style={styles.signOut}
            />
          </View>
        }
      />
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingBottom: Spacing['3xl'],
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.base,
      paddingVertical: Spacing.xl,
    },
    info: { flex: 1, gap: Spacing.xs },
    name: { ...Typography.subheading, color: colors.textPrimary },
    username: { ...Typography.body, color: colors.textSecondary },
    bio: { ...Typography.body, color: colors.textSecondary, marginTop: Spacing.xs },
    sectionLabel: {
      ...Typography.label,
      color: colors.textPrimary,
      marginBottom: Spacing.md,
    },
    recentSection: { marginBottom: Spacing.xs },
    recentScroll: { marginHorizontal: -Spacing.base },
    recentContent: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.base },
    recentCard: { width: 120 },
    recentImage: {
      width: 120,
      height: 150,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      marginBottom: Spacing.xs,
    },
    recentTitle: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    recentPrice: {
      ...Typography.caption,
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
    footer: { gap: Spacing.sm, marginTop: Spacing.xl },
    signOut: {},
    // Theme picker
    themeRow: {
      flexDirection: 'row',
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    themeBtn: {
      flex: 1,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themeBtnActive: {
      backgroundColor: colors.primary,
    },
    themeBtnText: {
      ...Typography.label,
      color: colors.textSecondary,
    },
    themeBtnTextActive: {
      color: colors.background,
    },
  });
}
