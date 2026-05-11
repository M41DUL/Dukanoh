import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { Spacing, BorderRadius, ColorTokens, FontFamily, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { edgeFetch } from '@/lib/edgeFetch';

type AudienceRole = 'all' | 'buyers' | 'sellers';
type AudienceTier = 'any' | 'free' | 'pro' | 'founder';
type AudienceActivity = 'any' | '14' | '30';
type Destination =
  | 'none' | 'home' | 'listings' | 'search' | 'sell' | 'saved' | 'dukanoh-fit' | 'boosts' | 'specific-listing';

const ROLES: { value: AudienceRole; label: string }[] = [
  { value: 'all',     label: 'Everyone' },
  { value: 'buyers',  label: 'Buyers' },
  { value: 'sellers', label: 'Sellers' },
];
const TIERS: { value: AudienceTier; label: string }[] = [
  { value: 'any',     label: 'Any tier' },
  { value: 'free',    label: 'Free' },
  { value: 'pro',     label: 'Pro' },
  { value: 'founder', label: 'Founder' },
];
const ACTIVITY: { value: AudienceActivity; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '14',  label: 'Active 14d' },
  { value: '30',  label: 'Active 30d' },
];
const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: 'none',             label: 'Open app' },
  { value: 'home',             label: 'Home feed' },
  { value: 'listings',         label: 'Browse listings' },
  { value: 'search',           label: 'Search' },
  { value: 'sell',             label: 'Sell' },
  { value: 'saved',            label: 'Saved' },
  { value: 'dukanoh-fit',      label: 'Dukanoh Fit' },
  { value: 'boosts',           label: 'Boosts' },
  { value: 'specific-listing', label: 'Specific listing' },
];

export default function BroadcastComposerScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [role, setRole] = useState<AudienceRole>('all');
  const [tier, setTier] = useState<AudienceTier>('any');
  const [activity, setActivity] = useState<AudienceActivity>('any');
  const [destination, setDestination] = useState<Destination>('none');
  const [listingId, setListingId] = useState('');

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Recompute the audience count when filters change. Debounced lightly so
  // chip-mash doesn't fire one RPC per tap.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setCountLoading(true);
      const { data, error } = await supabase.rpc('admin_count_broadcast_audience', {
        filters: {
          audience_role: role === 'all' ? null : role,
          audience_tier: tier === 'any' ? null : tier,
          audience_active_days: activity === 'any' ? null : parseInt(activity, 10),
        },
      });
      if (!cancelled) {
        setAudienceCount(error ? null : (data ?? 0));
        setCountLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [role, tier, activity]);

  const onSend = useCallback(async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing fields', 'Title and body are required.');
      return;
    }
    if (destination === 'specific-listing' && !listingId.trim()) {
      Alert.alert('Listing required', 'Paste a listing ID or pick a different destination.');
      return;
    }
    if (audienceCount === 0) {
      Alert.alert('No recipients', 'No one matches this audience. Adjust the filters or check that users have opted into marketing pushes.');
      return;
    }

    Alert.alert(
      'Send broadcast?',
      `This will push "${title.trim()}" to ${audienceCount?.toLocaleString() ?? '?'} user${audienceCount === 1 ? '' : 's'} right now. It cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            try {
              const response = await edgeFetch('admin-broadcast', {
                title: title.trim(),
                body: body.trim(),
                deep_link_destination: destination === 'none' ? null : destination,
                deep_link_listing_id: destination === 'specific-listing' ? listingId.trim() : null,
                audience_role: role === 'all' ? null : role,
                audience_tier: tier === 'any' ? null : tier,
                audience_active_days: activity === 'any' ? null : parseInt(activity, 10),
              });
              const result = await response.json();
              if (!response.ok) {
                Alert.alert('Send failed', result?.error ?? 'Unknown error');
                setSending(false);
                return;
              }
              router.back();
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Unknown error';
              Alert.alert('Send failed', message);
              setSending(false);
            }
          },
        },
      ],
    );
  }, [title, body, role, tier, activity, destination, listingId, audienceCount]);

  return (
    <ScreenWrapper>
      <Header title="New broadcast" showBack />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Content */}
          <Text style={styles.sectionLabel}>Notification</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.fieldInner}>
              <Input
                label="Title"
                value={title}
                onChangeText={setTitle}
                placeholder="New feature drop"
                maxLength={60}
                hint={`${title.length}/60`}
              />
              <Input
                label="Body"
                value={body}
                onChangeText={setBody}
                placeholder="Open the app to see what's new."
                maxLength={178}
                multiline
                numberOfLines={3}
                hint={`${body.length}/178`}
              />
            </View>
          </View>

          {/* Destination */}
          <Text style={styles.sectionLabel}>When tapped</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, padding: Spacing.base }]}>
            <View style={styles.chipRow}>
              {DESTINATIONS.map(opt => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={destination === opt.value}
                  onPress={() => setDestination(opt.value)}
                  colors={colors}
                />
              ))}
            </View>
            {destination === 'specific-listing' && (
              <Input
                value={listingId}
                onChangeText={setListingId}
                placeholder="Paste listing UUID"
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={{ marginTop: Spacing.base }}
              />
            )}
          </View>

          {/* Audience */}
          <Text style={styles.sectionLabel}>Audience</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, padding: Spacing.base, gap: Spacing.base }]}>
            <View>
              <Text style={styles.subLabel}>Role</Text>
              <View style={styles.chipRow}>
                {ROLES.map(opt => (
                  <Chip key={opt.value} label={opt.label} active={role === opt.value} onPress={() => setRole(opt.value)} colors={colors} />
                ))}
              </View>
            </View>

            {role === 'sellers' && (
              <View>
                <Text style={styles.subLabel}>Tier</Text>
                <View style={styles.chipRow}>
                  {TIERS.map(opt => (
                    <Chip key={opt.value} label={opt.label} active={tier === opt.value} onPress={() => setTier(opt.value)} colors={colors} />
                  ))}
                </View>
              </View>
            )}

            <View>
              <Text style={styles.subLabel}>Activity</Text>
              <View style={styles.chipRow}>
                {ACTIVITY.map(opt => (
                  <Chip key={opt.value} label={opt.label} active={activity === opt.value} onPress={() => setActivity(opt.value)} colors={colors} />
                ))}
              </View>
            </View>

            <Divider />

            <Text style={[styles.previewText, { color: colors.textPrimary }]}>
              {countLoading
                ? 'Counting…'
                : audienceCount === null
                  ? 'Could not count audience.'
                  : `${audienceCount.toLocaleString()} user${audienceCount === 1 ? '' : 's'} will receive this`}
            </Text>
            <Text style={styles.previewSub}>
              Only users who've opted into marketing pushes are counted.
            </Text>
          </View>

          <Button
            label={sending ? 'Sending…' : 'Send broadcast'}
            onPress={onSend}
            disabled={sending}
            style={styles.sendBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function Chip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: ColorTokens }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        chipStyles.chip,
        { borderColor: colors.border },
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
    >
      <Text style={[
        chipStyles.text,
        { color: colors.textPrimary },
        active && { color: '#FFFFFF' },
      ]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    ...FontFamily.medium,
  },
});

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    sectionLabel: {
      fontSize: 11,
      ...FontFamily.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: -Spacing.sm,
    },
    subLabel: {
      fontSize: 12,
      ...FontFamily.medium,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    card: {
      borderRadius: BorderRadius.large,
    },
    fieldInner: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    previewText: {
      ...Typography.body,
      ...FontFamily.semibold,
    },
    previewSub: {
      fontSize: 12,
      ...FontFamily.regular,
      color: colors.textSecondary,
    },
    sendBtn: {
      marginTop: Spacing.sm,
    },
  });
}
