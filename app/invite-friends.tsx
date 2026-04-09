import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { lightColors, Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface InvitedUser {
  id: string;
  username: string;
  avatar_url?: string;
  created_at: string;
}

interface Perk {
  icon: IoniconsName;
  title: string;
  description: string;
}

const PERKS: Perk[] = [
  {
    icon: 'storefront-outline',
    title: 'Your own shop',
    description: 'List your pieces, manage orders, and build your profile.',
  },
  {
    icon: 'people-outline',
    title: 'Trusted community',
    description: 'Sell to members who appreciate great fashion.',
  },
  {
    icon: 'star-outline',
    title: 'Build your reputation',
    description: 'Earn reviews and grow your presence in the community.',
  },
];

export default function InviteFriendsScreen() {
  const { user, isSeller } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [inviteCode, setInviteCode] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<InvitedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const { data: profile } = await supabase
        .from('users')
        .select('seller_invite_code')
        .eq('id', user.id)
        .maybeSingle();

      const code = profile?.seller_invite_code ?? '';
      setInviteCode(code);

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

  if (loading) return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LoadingSpinner />
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero */}
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>
            {isSeller ? 'Invite Friends\nto Sell' : 'Become a Seller'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isSeller
              ? 'Share your code to let friends start selling on Dukanoh.'
              : 'Get a seller invite code from a friend to start listing your pieces.'}
          </Text>
        </View>

        {/* Code card + share (sellers) */}
        {isSeller && inviteCode ? (
          <View style={styles.codeSection}>
            <View style={styles.codeCard}>
              <Text style={styles.codeText}>{inviteCode}</Text>
              <TouchableOpacity onPress={handleCopy} hitSlop={8}>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={22}
                  color={copied ? lightColors.secondary : 'rgba(255,255,255,0.6)'}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={20} color={lightColors.primary} />
              <Text style={styles.shareBtnText}>Share invite code</Text>
            </TouchableOpacity>
          </View>
        ) : !isSeller ? (
          <View style={styles.codeSection}>
            <View style={styles.noSellerCard}>
              <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.noSellerText}>
                You need a seller invite to unlock this feature.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Why sell on Dukanoh */}
        <View style={styles.perksSection}>
          <Text style={styles.perksSectionTitle}>Why sell on Dukanoh?</Text>
          {PERKS.map((perk) => (
            <View key={perk.title} style={styles.perkRow}>
              <View style={styles.perkIconCircle}>
                <Ionicons name={perk.icon} size={22} color={lightColors.secondary} />
              </View>
              <View style={styles.perkContent}>
                <Text style={styles.perkTitle}>{perk.title}</Text>
                <Text style={styles.perkDescription}>{perk.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* How it works mini steps */}
        <View style={styles.stepsSection}>
          <Text style={styles.stepsSectionTitle}>How inviting works</Text>
          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={styles.stepText}>Share your code</Text>
            </View>
            <View style={styles.stepDot} />
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={styles.stepText}>Friend signs up</Text>
            </View>
            <View style={styles.stepDot} />
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.stepText}>They start selling</Text>
            </View>
          </View>
        </View>

        {/* Invited users list */}
        {isSeller && (
          <View style={styles.invitedSection}>
            <View style={styles.divider} />
            {invitedUsers.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>
                  Invited members ({invitedUsers.length})
                </Text>
                {invitedUsers.map(item => (
                  <View key={item.id} style={styles.invitedRow}>
                    <Avatar uri={item.avatar_url} initials={item.username[0]?.toUpperCase()} size="medium" />
                    <View style={styles.invitedInfo}>
                      <Text style={styles.invitedUsername}>@{item.username}</Text>
                      <Text style={styles.invitedDate}>Joined {formatDate(item.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.emptyInvites}>
                <Ionicons name="people-outline" size={32} color="rgba(255,255,255,0.4)" />
                <Text style={styles.emptyInvitesText}>
                  No one has used your code yet.{'\n'}Share it with friends!
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: lightColors.primary,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: Spacing.sm,
      marginTop: Spacing.xs,
    },
    scrollContent: {
      paddingBottom: Spacing['3xl'],
    },

    // Hero
    heroContent: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      gap: Spacing.md,
      marginBottom: Spacing['2xl'],
    },
    heroTitle: {
      fontSize: 32,
      fontFamily: FontFamily.bold,
      color: '#FFFFFF',
      lineHeight: 38,
    },
    heroSubtitle: {
      fontSize: 16,
      fontFamily: FontFamily.regular,
      color: 'rgba(255,255,255,0.7)',
      lineHeight: 24,
    },

    // Code section
    codeSection: {
      paddingHorizontal: Spacing.xl,
      gap: Spacing.md,
      marginBottom: Spacing['2xl'],
    },
    codeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    codeText: {
      fontSize: 20,
      fontFamily: FontFamily.bold,
      color: '#FFFFFF',
      letterSpacing: 3,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: lightColors.secondary,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
    },
    shareBtnText: {
      fontSize: 16,
      fontFamily: FontFamily.semibold,
      color: lightColors.primary,
    },
    noSellerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    noSellerText: {
      flex: 1,
      fontSize: 14,
      fontFamily: FontFamily.regular,
      color: 'rgba(255,255,255,0.6)',
      lineHeight: 20,
    },

    // Perks
    perksSection: {
      paddingHorizontal: Spacing.xl,
      marginBottom: Spacing['2xl'],
    },
    perksSectionTitle: {
      fontSize: 18,
      fontFamily: FontFamily.semibold,
      color: '#FFFFFF',
      marginBottom: Spacing.lg,
    },
    perkRow: {
      flexDirection: 'row',
      gap: Spacing.base,
      marginBottom: Spacing.lg,
    },
    perkIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    perkContent: {
      flex: 1,
      gap: 4,
    },
    perkTitle: {
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      color: '#FFFFFF',
    },
    perkDescription: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      color: 'rgba(255,255,255,0.6)',
      lineHeight: 20,
    },

    // Steps
    stepsSection: {
      paddingHorizontal: Spacing.xl,
      marginBottom: Spacing['2xl'],
    },
    stepsSectionTitle: {
      fontSize: 18,
      fontFamily: FontFamily.semibold,
      color: '#FFFFFF',
      marginBottom: Spacing.lg,
    },
    stepsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: BorderRadius.large,
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.base,
    },
    stepItem: {
      flex: 1,
      alignItems: 'center',
      gap: Spacing.sm,
    },
    stepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: lightColors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberText: {
      fontSize: 14,
      fontFamily: FontFamily.bold,
      color: lightColors.primary,
    },
    stepText: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: 'rgba(255,255,255,0.7)',
      textAlign: 'center',
    },
    stepDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.3)',
    },

    // Divider
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255,255,255,0.15)',
      marginBottom: Spacing.xl,
    },

    // Invited list
    invitedSection: {
      paddingHorizontal: Spacing.xl,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      color: 'rgba(255,255,255,0.5)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
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
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      color: '#FFFFFF',
    },
    invitedDate: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: 'rgba(255,255,255,0.5)',
    },
    emptyInvites: {
      paddingVertical: Spacing['2xl'],
      alignItems: 'center',
      gap: Spacing.md,
    },
    emptyInvitesText: {
      fontSize: 15,
      fontFamily: FontFamily.regular,
      color: 'rgba(255,255,255,0.5)',
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}
