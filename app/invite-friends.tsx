import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { Divider } from '@/components/Divider';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface InvitedUser {
  id: string;
  username: string;
  avatar_url?: string;
  created_at: string;
}

export default function InviteFriendsScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [inviteCode, setInviteCode] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<InvitedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Get user's seller invite code
      const { data: profile } = await supabase
        .from('users')
        .select('seller_invite_code')
        .eq('id', user.id)
        .maybeSingle();

      const code = profile?.seller_invite_code ?? '';
      setInviteCode(code);

      // Get people invited via this code
      if (code) {
        const { data: invites } = await supabase
          .from('invites')
          .select('used_by, used_at')
          .eq('code', code)
          .eq('is_used', true)
          .order('used_at', { ascending: false });

        if (invites && invites.length > 0) {
          const userIds = invites.map(i => i.used_by).filter(Boolean);
          const { data: users } = await supabase
            .from('users')
            .select('id, username, avatar_url, created_at')
            .in('id', userIds);
          setInvitedUsers((users ?? []) as InvitedUser[]);
        } else {
          setInvitedUsers([]);
        }
      }

      setLoading(false);
    })();
  }, [user]));

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteCode]);

  const handleShare = useCallback(() => {
    Share.share({
      message: `Join me as a seller on Dukanoh! Use my invite code: ${inviteCode}`,
    });
  }, [inviteCode]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Friends</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={invitedUsers}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View>
              <Text style={styles.heroTitle}>Help grow the community</Text>
              <Text style={styles.heroSubtitle}>
                Share your code to let friends start selling on Dukanoh.
              </Text>

              {inviteCode ? (
                <>
                  <View style={styles.codeCard}>
                    <Text style={styles.codeText}>{inviteCode}</Text>
                    <TouchableOpacity onPress={handleCopy} hitSlop={8}>
                      <Ionicons
                        name={copied ? 'checkmark-circle' : 'copy-outline'}
                        size={22}
                        color={copied ? colors.primary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.7}>
                    <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.shareBtnText}>Share seller invite</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.noCode}>
                  <Text style={styles.noCodeText}>
                    You need to be a seller to invite others.
                  </Text>
                </View>
              )}

              {invitedUsers.length > 0 && (
                <>
                  <Divider style={styles.divider} />
                  <Text style={styles.sectionLabel}>
                    Invited sellers ({invitedUsers.length})
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.invitedRow}>
              <Avatar uri={item.avatar_url} initials={item.username[0]?.toUpperCase()} size="medium" />
              <View style={styles.invitedInfo}>
                <Text style={styles.invitedUsername}>@{item.username}</Text>
                <Text style={styles.invitedDate}>Joined {formatDate(item.created_at)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            inviteCode ? (
              <View style={styles.emptyInvites}>
                <Text style={styles.emptyInvitesText}>
                  No one has used your code yet. Share it with friends!
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    backBtn: { padding: Spacing.xs, width: 40 },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    content: {
      paddingTop: Spacing.xl,
      paddingBottom: Spacing['3xl'],
    },
    heroTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    heroSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      marginBottom: Spacing.xl,
    },
    codeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      marginBottom: Spacing.md,
    },
    codeText: {
      ...Typography.subheading,
      color: colors.textPrimary,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 2,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
    },
    shareBtnText: {
      ...Typography.label,
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
    },
    noCode: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.xl,
      alignItems: 'center',
    },
    noCodeText: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    divider: {
      marginVertical: Spacing.xl,
    },
    sectionLabel: {
      ...Typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontFamily: 'Inter_600SemiBold',
      marginBottom: Spacing.md,
    },
    invitedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    invitedInfo: {
      flex: 1,
      gap: 2,
    },
    invitedUsername: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    invitedDate: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    emptyInvites: {
      paddingVertical: Spacing.xl,
      alignItems: 'center',
    },
    emptyInvitesText: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
