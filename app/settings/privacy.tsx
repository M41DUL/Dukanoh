import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// Route kept at /settings/privacy so nothing else changes; the screen is the
// Notifications screen described in Privacy §6. Three groups:
//   • Orders and messages — always on in the app (device settings to silence)
//   • Activity — saves, reviews, price drops on saved pieces (activity_push_enabled)
//   • Marketing — Dukanoh announcements (marketing_push_consent, admin-broadcast)

interface Prefs {
  activity_push_enabled: boolean;
  marketing_push_consent: boolean;
}

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [prefs, setPrefs] = useState<Prefs>({ activity_push_enabled: true, marketing_push_consent: false });
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('activity_push_enabled, marketing_push_consent')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            activity_push_enabled: data.activity_push_enabled ?? true,
            marketing_push_consent: data.marketing_push_consent ?? false,
          });
        }
        setLoading(false);
      });
  }, [user]));

  const handleToggle = async (field: keyof Prefs, value: boolean) => {
    if (!user) return;
    setPrefs(prev => ({ ...prev, [field]: value }));
    await supabase.from('users').update({ [field]: value }).eq('id', user.id);
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Notifications" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Notifications" showBack />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Choose what Dukanoh sends you. You can change this at any time.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Orders and messages</Text>
              <Text style={[styles.rowDescription, { color: colors.textSecondary }]}>
                New messages, order updates, disputes, reminders and notices about your selling. To silence these, use your phone&apos;s notification settings.
              </Text>
              <TouchableOpacity onPress={() => Linking.openSettings()} activeOpacity={0.7} style={styles.linkRow}>
                <Text style={[styles.link, { color: colors.primary }]}>Open phone settings</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.alwaysOn, { color: colors.textSecondary }]}>Always on</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ToggleRow
            label="Activity"
            description="Someone saved your listing, a new review, a price drop on a piece you saved."
            value={prefs.activity_push_enabled}
            onValueChange={v => handleToggle('activity_push_enabled', v)}
            colors={colors}
            styles={styles}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ToggleRow
            label="Marketing from Dukanoh"
            description="Announcements and new features. Never affects the two groups above."
            value={prefs.marketing_push_consent}
            onValueChange={v => handleToggle('marketing_push_consent', v)}
            colors={colors}
            styles={styles}
          />
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  colors,
  styles,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  colors: ColorTokens;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    content: { paddingTop: Spacing.base, paddingBottom: Spacing['3xl'], gap: Spacing.lg },
    intro: { fontSize: 13, ...FontFamily.regular, lineHeight: 19 },
    card: { borderRadius: BorderRadius.large, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, gap: Spacing.md },
    rowText: { flex: 1, gap: 3 },
    rowLabel: { fontSize: 14, ...FontFamily.medium },
    rowDescription: { fontSize: 12, ...FontFamily.regular, lineHeight: 17 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
    link: { fontSize: 12, ...FontFamily.semibold },
    alwaysOn: { fontSize: 12, ...FontFamily.medium },
    divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.base },
  });
}
