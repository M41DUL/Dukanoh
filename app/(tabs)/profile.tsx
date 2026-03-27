import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, FlatList, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import { useBlocked } from '@/context/BlockedContext';
import { supabase } from '@/lib/supabase';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useSaved } from '@/context/SavedContext';
import { StarRating } from '@/components/StarRating';
import { BottomSheet } from '@/components/BottomSheet';
import type { ThemePreference } from '@/context/ThemeContext';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function ProfileScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const { preference, setPreference } = useTheme();
  const { savedIds } = useSaved();
  const { blockedIds, unblockUser } = useBlocked();
  const [listings, setListings] = useState<Listing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<TextInput>(null);
  const { items: recentItems, reload: reloadRecent } = useRecentlyViewed(user?.id);
  const [blockedSheetVisible, setBlockedSheetVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; username: string; avatar_url?: string }[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const fetchListings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('listings')
      .select('id, title, price, images, category, condition, size, status, created_at, seller_id, seller:users(username, avatar_url)')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });
    setListings((data ?? []) as unknown as Listing[]);
  }, [user]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('full_name, bio, avatar_url, rating_avg, rating_count')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      const name = data.full_name === 'New User' ? '' : (data.full_name ?? '');
      setProfileName(name);
      setProfileBio(data.bio ?? '');
      setProfileAvatar(data.avatar_url ?? undefined);
      setRatingAvg(data.rating_avg ?? 0);
      setRatingCount(data.rating_count ?? 0);
    }
  }, [user]);

  useEffect(() => {
    fetchListings();
    fetchProfile();
  }, [fetchListings, fetchProfile]);

  useFocusEffect(useCallback(() => { reloadRecent(); }, [reloadRecent]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchListings(), fetchProfile(), reloadRecent()]);
    setRefreshing(false);
  }, [fetchListings, fetchProfile, reloadRecent]);

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
            router.replace('/onboarding?reset=true');
          },
        },
      ]
    );
  };

  const username = user?.user_metadata?.username ?? 'username';

  const saveName = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (!user || !trimmed || trimmed === profileName) {
      setEditingName(false);
      return;
    }
    await supabase.from('users').update({ full_name: trimmed }).eq('id', user.id);
    setProfileName(trimmed);
    setEditingName(false);
  }, [user, nameDraft, profileName]);

  const startEditingName = useCallback(() => {
    setNameDraft(profileName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, [profileName]);

  const openBlockedSheet = useCallback(async () => {
    setBlockedSheetVisible(true);
    if (blockedIds.length === 0) { setBlockedUsers([]); return; }
    setBlockedLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', blockedIds);
    setBlockedUsers((data ?? []) as { id: string; username: string; avatar_url?: string }[]);
    setBlockedLoading(false);
  }, [blockedIds]);

  const handleUnblock = useCallback(async (userId: string, username: string) => {
    Alert.alert('Unblock user', `Unblock @${username}? Their listings will appear again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await unblockUser(userId);
          setBlockedUsers(prev => prev.filter(u => u.id !== userId));
        },
      },
    ]);
  }, [unblockUser]);

  const publishedListings = listings.filter(l => l.status !== 'draft');
  const draftListings = listings.filter(l => l.status === 'draft');

  return (
    <ScreenWrapper>
      <FlatList
        data={publishedListings}
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
              <Avatar uri={profileAvatar} initials={(profileName || username)[0]?.toUpperCase()} size="large" />
              <View style={styles.info}>
                {editingName ? (
                  <TextInput
                    ref={nameInputRef}
                    style={styles.nameInput}
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    onBlur={saveName}
                    onSubmitEditing={saveName}
                    returnKeyType="done"
                    placeholder="Your name"
                    placeholderTextColor={colors.textSecondary}
                    maxLength={50}
                  />
                ) : (
                  <TouchableOpacity onPress={startEditingName} activeOpacity={0.7}>
                    <Text style={styles.name}>
                      {profileName || 'Add your name'}
                    </Text>
                    {!profileName && (
                      <Text style={styles.nameHint}>Tap to add</Text>
                    )}
                  </TouchableOpacity>
                )}
                <Text style={styles.username}>@{username}</Text>
                {ratingCount > 0 && (
                  <View style={styles.ratingRow}>
                    <StarRating rating={ratingAvg} size={13} />
                    <Text style={styles.ratingText}>
                      {ratingAvg.toFixed(1)} ({ratingCount})
                    </Text>
                  </View>
                )}
                {profileBio ? <Text style={styles.bio}>{profileBio}</Text> : null}
              </View>
            </View>
            <Divider />
            <TouchableOpacity
              style={styles.savedRow}
              onPress={() => router.push('/saved')}
              activeOpacity={0.8}
            >
              <Ionicons name="heart-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.savedRowLabel}>Saved items</Text>
              {savedIds.size > 0 && (
                <View style={styles.savedBadge}>
                  <Text style={styles.savedBadgeText}>{savedIds.size}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} style={styles.savedChevron} />
            </TouchableOpacity>
            <Divider />
            <TouchableOpacity
              style={styles.savedRow}
              onPress={openBlockedSheet}
              activeOpacity={0.8}
            >
              <Ionicons name="ban-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.savedRowLabel}>Blocked users</Text>
              {blockedIds.length > 0 && (
                <View style={[styles.savedBadge, { backgroundColor: colors.error }]}>
                  <Text style={styles.savedBadgeText}>{blockedIds.length}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} style={styles.savedChevron} />
            </TouchableOpacity>
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
                        contentFit="cover"
                        transition={200}
                      />
                      <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.recentPrice}>£{item.price?.toFixed(2)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Divider />
              </View>
            )}
            {draftListings.length > 0 && (
              <View style={styles.draftsSection}>
                <Text style={styles.sectionLabel}>Drafts ({draftListings.length})</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.draftsScroll}
                  contentContainerStyle={styles.draftsContent}
                >
                  {draftListings.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.draftCard}
                      onPress={() => router.push(`/listing/${item.id}`)}
                      activeOpacity={0.8}
                    >
                      {item.images?.[0] ? (
                        <Image
                          source={{ uri: item.images[0] }}
                          style={styles.draftImage}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={styles.draftImagePlaceholder}>
                          <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
                        </View>
                      )}
                      <Text style={styles.draftTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.draftPrice}>
                        {item.price > 0 ? `£${item.price.toFixed(2)}` : 'No price set'}
                      </Text>
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
      <BottomSheet
        visible={blockedSheetVisible}
        onClose={() => setBlockedSheetVisible(false)}
      >
        <Text style={styles.blockedTitle}>Blocked users</Text>
        {blockedLoading ? (
          <View style={styles.blockedEmpty}>
            <Text style={styles.blockedEmptyText}>Loading...</Text>
          </View>
        ) : blockedUsers.length === 0 ? (
          <View style={styles.blockedEmpty}>
            <Text style={styles.blockedEmptyText}>No blocked users</Text>
          </View>
        ) : (
          <FlatList
            data={blockedUsers}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.blockedRow}>
                <Avatar uri={item.avatar_url} initials={item.username[0]?.toUpperCase()} size="small" />
                <Text style={styles.blockedUsername} numberOfLines={1}>@{item.username}</Text>
                <TouchableOpacity
                  style={styles.unblockBtn}
                  onPress={() => handleUnblock(item.id, item.username)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.unblockBtnText}>Unblock</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </BottomSheet>
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
    nameInput: {
      ...Typography.subheading,
      color: colors.textPrimary,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingVertical: 2,
      margin: 0,
    },
    nameHint: { ...Typography.caption, color: colors.textSecondary },
    username: { ...Typography.body, color: colors.textSecondary },
    bio: { ...Typography.body, color: colors.textSecondary, marginTop: Spacing.xs },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    ratingText: { ...Typography.caption, color: colors.textSecondary },
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
    draftsSection: { marginBottom: Spacing.xs },
    draftsScroll: { marginHorizontal: -Spacing.base },
    draftsContent: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.base },
    draftCard: { width: 120 },
    draftImage: {
      width: 120,
      height: 150,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      marginBottom: Spacing.xs,
    },
    draftImagePlaceholder: {
      width: 120,
      height: 150,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      marginBottom: Spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    draftTitle: { ...Typography.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    draftPrice: { ...Typography.caption, color: colors.textSecondary },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
    },
    savedRowLabel: {
      ...Typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    savedBadge: {
      backgroundColor: colors.primary,
      borderRadius: BorderRadius.full,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    savedBadgeText: {
      ...Typography.caption,
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
    },
    savedChevron: { marginLeft: Spacing.xs },
    footer: { gap: Spacing.sm, marginTop: Spacing.xl },
    signOut: {},
    // Theme picker
    themeRow: {
      flexDirection: 'row',
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
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
      color: '#FFFFFF',
    },
    // Blocked users sheet
    blockedTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginBottom: Spacing.base,
    },
    blockedEmpty: {
      paddingVertical: Spacing.xl,
      alignItems: 'center',
    },
    blockedEmptyText: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    blockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    blockedUsername: {
      ...Typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    unblockBtn: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
    },
    unblockBtnText: {
      ...Typography.label,
      color: colors.textPrimary,
    },
  });
}
