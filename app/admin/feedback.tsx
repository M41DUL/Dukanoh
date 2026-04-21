import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { Divider } from '@/components/Divider';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface FeedbackRow {
  id: string;
  type: 'bug' | 'feature' | 'general' | 'support';
  message: string;
  source: 'app' | 'website';
  name: string | null;
  email: string | null;
  created_at: string;
  user: {
    username: string;
    email: string;
    is_seller: boolean;
    is_verified: boolean;
    seller_tier: string;
    created_at: string;
  } | null;
}

const TYPE_LABELS: Record<string, string> = {
  bug:     'Bug report',
  feature: 'Feature request',
  general: 'General',
  support: 'Support',
};

const TYPE_COLORS: Record<string, string> = {
  bug:     '#FF4444',
  feature: '#3735C5',
  general: '#6B6B6B',
  support: '#E6A817',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminFeedbackScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  const checkAdminAndLoad = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'admin_user_ids')
      .single();

    const adminIds: string[] = JSON.parse(setting?.value ?? '[]');
    if (!adminIds.includes(user.id)) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setIsAdmin(true);

    const { data } = await supabase
      .from('feedback')
      .select(`
        id, type, message, source, name, email, created_at,
        user:users!feedback_user_id_fkey(username, email, is_seller, is_verified, seller_tier, created_at)
      `)
      .order('created_at', { ascending: false });

    setRows((data ?? []) as unknown as FeedbackRow[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { checkAdminAndLoad(); }, [checkAdminAndLoad]));

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Feedback" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (isAdmin === false) {
    return (
      <ScreenWrapper>
        <Header title="Feedback" showBack />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.accessDenied, { color: colors.textSecondary }]}>Admin access required</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title={`Feedback (${rows.length})`} showBack />
      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <Divider style={styles.divider} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.pillRow}>
                <View style={[styles.typePill, { backgroundColor: `${TYPE_COLORS[item.type]}18` }]}>
                  <Text style={[styles.typeText, { color: TYPE_COLORS[item.type] }]}>
                    {TYPE_LABELS[item.type]}
                  </Text>
                </View>
                {item.source === 'website' && (
                  <View style={[styles.typePill, { backgroundColor: '#F2F2F2' }]}>
                    <Text style={[styles.typeText, { color: '#6B6B6B' }]}>Website</Text>
                  </View>
                )}
              </View>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
            <Text style={styles.message}>{item.message}</Text>
            {item.source === 'website' && item.name ? (
              <View style={styles.userBlock}>
                <View style={styles.userRow}>
                  <Ionicons name="globe-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.userText}>
                    {item.name}{item.email ? `  ·  ${item.email}` : ''}
                  </Text>
                </View>
              </View>
            ) : item.user && (
              <View style={styles.userBlock}>
                <View style={styles.userRow}>
                  <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.userText}>
                    @{item.user.username}{item.user.email ? `  ·  ${item.user.email}` : ''}
                  </Text>
                </View>
                <View style={styles.trustRow}>
                  <View style={styles.trustPill}>
                    <Text style={styles.trustPillText}>
                      {item.user.is_seller ? 'Seller' : 'Buyer'}
                    </Text>
                  </View>
                  {item.user.is_verified && (
                    <View style={styles.trustPill}>
                      <Text style={styles.trustPillText}>✓ Verified</Text>
                    </View>
                  )}
                  {item.user.is_seller && item.user.seller_tier !== 'free' && (
                    <View style={styles.trustPill}>
                      <Text style={styles.trustPillText}>
                        {item.user.seller_tier.charAt(0).toUpperCase() + item.user.seller_tier.slice(1)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.joinDate}>
                    Joined {formatDate(item.user.created_at)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            heading="No feedback yet"
            subtext="Submissions from users will appear here."
          />
        }
      />
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    list: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
    },
    card: {
      paddingVertical: Spacing.base,
      gap: Spacing.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    typePill: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    typeText: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
    },
    date: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    message: {
      fontSize: 15,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    userBlock: {
      gap: Spacing.xs,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    userText: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    trustPill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    trustPillText: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
    },
    joinDate: {
      fontSize: 11,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    divider: {
      marginVertical: 0,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    accessDenied: {
      fontSize: 15,
      fontFamily: FontFamily.regular,
    },
  });
}
