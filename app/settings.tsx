import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { Divider } from '@/components/Divider';
import { BottomSheet } from '@/components/BottomSheet';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { supabase } from '@/lib/supabase';
import type { ComponentProps } from 'react';
import Constants from 'expo-constants';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface MenuRow {
  icon: IoniconsName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  badge?: number;
}

export default function SettingsScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const { blockedIds, unblockUser } = useBlocked();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [blockedSheetVisible, setBlockedSheetVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; username: string; avatar_url?: string }[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

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

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently remove your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const { error } = await supabase.rpc('delete_user_account');
            if (error) {
              Alert.alert('Error', 'Could not delete account. Please try again.');
              return;
            }
            signOut();
          },
        },
      ]
    );
  };

  const accountRows: MenuRow[] = [
    {
      icon: 'color-palette-outline',
      title: 'Appearance',
      onPress: () => router.push('/appearance'),
    },
    {
      icon: 'ban-outline',
      title: 'Blocked Users',
      onPress: openBlockedSheet,
      badge: blockedIds.length > 0 ? blockedIds.length : undefined,
    },
    {
      icon: 'options-outline',
      title: 'Feed Preferences',
      onPress: handleResetPreferences,
    },
  ];

  const supportRows: MenuRow[] = [
    {
      icon: 'help-circle-outline',
      title: 'Help & Support',
      onPress: () => router.push('/help'),
    },
    {
      icon: 'information-circle-outline',
      title: 'How Dukanoh Works',
      subtitle: 'Learn the basics',
      onPress: () => router.push('/how-it-works'),
    },
  ];

  const legalRows: MenuRow[] = [
    {
      icon: 'document-text-outline',
      title: 'Terms & Conditions',
      onPress: () => {},
    },
    {
      icon: 'shield-outline',
      title: 'Privacy Policy',
      onPress: () => {},
    },
  ];

  const actionRows: MenuRow[] = [
    {
      icon: 'log-out-outline',
      title: 'Sign Out',
      onPress: handleSignOut,
    },
    {
      icon: 'trash-outline',
      title: 'Delete Account',
      subtitle: 'Permanently remove your data',
      onPress: handleDeleteAccount,
      destructive: true,
    },
  ];

  const renderRow = (row: MenuRow) => (
    <View key={row.title}>
      <TouchableOpacity style={styles.menuRow} onPress={row.onPress} activeOpacity={0.7}>
        <Ionicons
          name={row.icon}
          size={22}
          color={row.destructive ? colors.error : colors.textPrimary}
        />
        <Text style={[styles.menuRowTitle, row.destructive && { color: colors.error }]}>
          {row.title}
        </Text>
        {row.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{row.badge}</Text>
          </View>
        ) : null}
        <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      <Divider style={{ marginVertical: 0 }} />
    </View>
  );

  const renderSection = (rows: MenuRow[]) => (
    <View style={styles.section}>
      {rows.map(row => renderRow(row))}
    </View>
  );

  return (
    <ScreenWrapper>
      <Header title="Settings" showBack />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {renderSection(accountRows)}
        {renderSection(supportRows)}
        {renderSection(legalRows)}
        {renderSection(actionRows)}

        {/* Footer */}
        <Text style={styles.footer}>Dukanoh v{appVersion}</Text>
      </ScrollView>

      {/* Blocked users sheet */}
      <BottomSheet visible={blockedSheetVisible} onClose={() => setBlockedSheetVisible(false)}>
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
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['3xl'],
    },

    // Sections
    section: {},
    // Menu rows
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: (Spacing.md + 2) * 2,
    },
    menuRowTitle: {
      flex: 1,
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textPrimary,
    },
    badge: {
      backgroundColor: colors.error,
      borderRadius: BorderRadius.full,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      ...Typography.caption,
      color: '#FFFFFF',
      fontFamily: FontFamily.bold,
      fontSize: 11,
    },

    // Footer
    footer: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.lg,
    },

    // Blocked sheet
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
