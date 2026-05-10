import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens, FontFamily, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface StoryRow {
  id: string;
  image_url: string;
  headline: string | null;
  cta_label: string | null;
  published_at: string;
  expires_at: string | null;
}

function isExpired(expires_at: string | null): boolean {
  if (!expires_at) return false;
  return new Date(expires_at).getTime() < Date.now();
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function AdminStoriesScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<StoryRow[]>([]);
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

    const { data, error } = await supabase
      .from('app_stories')
      .select('id, image_url, headline, cta_label, published_at, expires_at')
      .order('published_at', { ascending: false });

    if (!error) setRows((data ?? []) as StoryRow[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (story: StoryRow) => {
    Alert.alert(
      'Delete story?',
      'It will disappear from everyone\'s home feed straight away. The image stays in storage.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('admin_delete_app_story', { p_id: story.id });
            if (error) {
              Alert.alert('Could not delete', error.message);
              return;
            }
            setRows(prev => prev.filter(r => r.id !== story.id));
          },
        },
      ]
    );
  };

  if (isAdmin === false) {
    return (
      <ScreenWrapper>
        <Header title="Stories" showBack />
        <EmptyState icon="lock-closed-outline" heading="Admins only" subtext="You do not have permission to view this page." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Stories" showBack />

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
                Stories appear under the Dukanoh bubble at the top of the home feed. Up to one image, headline, body and CTA per card.
              </Text>
              <Button
                label="Create new story"
                onPress={() => router.push('/admin/stories/new')}
                style={styles.createBtn}
              />
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon="newspaper-outline"
              heading="No stories yet"
              subtext="Tap the button above to publish your first one."
            />
          }
          renderItem={({ item }) => {
            const expired = isExpired(item.expires_at);
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.surface }]}
                onPress={() => router.push(`/admin/stories/${item.id}`)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.headline ?? <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>Image only</Text>}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {expired
                      ? `Expired ${item.expires_at ? formatDate(item.expires_at) : ''}`
                      : item.expires_at
                        ? `Expires ${formatDate(item.expires_at)}`
                        : 'No expiry'}
                    {item.cta_label ? ` · ${item.cta_label}` : ''}
                  </Text>
                </View>
                {expired && <View style={[styles.expiredPill, { backgroundColor: colors.border }]}><Text style={styles.expiredText}>Expired</Text></View>}
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={12} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      padding: Spacing.base,
      borderRadius: BorderRadius.large,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.border,
    },
    rowBody: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      fontSize: 15,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    rowMeta: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    expiredPill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.small,
    },
    expiredText: {
      fontSize: 10,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    deleteBtn: {
      paddingHorizontal: Spacing.xs,
    },
  });
}
