import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens, FontFamily, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  audience_role: string | null;
  audience_tier: string | null;
  audience_active_days: number | null;
  status: string;
  recipient_count: number;
  sent_at: string | null;
  created_at: string;
  error_message: string | null;
}

function audienceLabel(row: BroadcastRow): string {
  const parts: string[] = [];
  if (row.audience_role === 'buyers')  parts.push('Buyers');
  else if (row.audience_role === 'sellers') parts.push('Sellers');
  else parts.push('Everyone');
  if (row.audience_tier) parts.push(row.audience_tier.charAt(0).toUpperCase() + row.audience_tier.slice(1));
  if (row.audience_active_days) parts.push(`active ${row.audience_active_days}d`);
  return parts.join(' · ');
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminBroadcastsScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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
      .from('broadcasts')
      .select('id, title, body, audience_role, audience_tier, audience_active_days, status, recipient_count, sent_at, created_at, error_message')
      .order('created_at', { ascending: false });

    setRows((data ?? []) as BroadcastRow[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (isAdmin === false) {
    return (
      <ScreenWrapper>
        <Header title="Broadcasts" showBack />
        <EmptyState icon="lock-closed-outline" heading="Admins only" subtext="You do not have permission to view this page." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Broadcasts" showBack />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <Text style={styles.intro}>
                Send a push notification to a cohort of users. Only users who have opted into marketing pushes will receive it.
              </Text>
              <Button
                label="New broadcast"
                onPress={() => router.push('/admin/broadcasts/new')}
                style={styles.createBtn}
              />
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              heading="No broadcasts yet"
              subtext="Tap the button above to send your first one."
            />
          }
          renderItem={({ item }) => {
            const statusColor =
              item.status === 'sent' ? colors.primary :
              item.status === 'failed' ? colors.error :
              colors.textSecondary;
            return (
              <View style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {audienceLabel(item)} · {item.recipient_count.toLocaleString()} sent · {formatDate(item.sent_at ?? item.created_at)}
                </Text>
                {item.error_message ? (
                  <Text style={[styles.rowMeta, { color: colors.error }]} numberOfLines={2}>{item.error_message}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    list: {
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['3xl'],
    },
    headerWrap: {
      gap: Spacing.base,
      marginBottom: Spacing.lg,
    },
    intro: {
      ...Typography.body,
      color: colors.textSecondary,
      fontSize: 13,
    },
    createBtn: {
      alignSelf: 'flex-start',
    },
    row: {
      padding: Spacing.base,
      borderRadius: BorderRadius.large,
      gap: Spacing.xs,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    rowTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    statusPill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.small,
    },
    statusText: {
      fontSize: 10,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    rowBody: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
    },
    rowMeta: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
  });
}
