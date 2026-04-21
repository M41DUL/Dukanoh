import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Divider } from '@/components/Divider';
import { Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface ConsentState {
  analytics_consent: boolean;
  marketing_consent: boolean;
  marketing_push_consent: boolean;
}

export default function PrivacySettingsScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [consent, setConsent] = useState<ConsentState>({
    analytics_consent: true,
    marketing_consent: false,
    marketing_push_consent: false,
  });
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('analytics_consent, marketing_consent, marketing_push_consent')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConsent({
            analytics_consent: data.analytics_consent ?? true,
            marketing_consent: data.marketing_consent ?? false,
            marketing_push_consent: data.marketing_push_consent ?? false,
          });
        }
        setLoading(false);
      });
  }, [user]));

  const handleToggle = async (field: keyof ConsentState, value: boolean) => {
    if (!user) return;
    setConsent(prev => ({ ...prev, [field]: value }));
    await supabase.from('users').update({ [field]: value }).eq('id', user.id);
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Privacy" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Privacy" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Manage how Dukanoh uses your data. Strictly necessary cookies cannot be disabled as they are required for the app to function.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ToggleRow
            label="Analytics"
            description="Usage patterns and crash reports. Helps us improve the app."
            value={consent.analytics_consent}
            onValueChange={v => handleToggle('analytics_consent', v)}
            colors={colors}
            styles={styles}
          />
          <Divider />
          <ToggleRow
            label="Marketing & personalisation"
            description="Personalised recommendations and retargeting on third-party platforms."
            value={consent.marketing_consent}
            onValueChange={v => handleToggle('marketing_consent', v)}
            colors={colors}
            styles={styles}
          />
          <Divider />
          <ToggleRow
            label="Marketing notifications"
            description="Promotions, new features, and personalised offers from Dukanoh."
            value={consent.marketing_push_consent}
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
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    intro: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 19,
    },
    card: {
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.base,
      gap: Spacing.md,
    },
    rowText: {
      flex: 1,
      gap: 3,
    },
    rowLabel: {
      fontSize: 14,
      fontFamily: FontFamily.medium,
    },
    rowDescription: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      lineHeight: 17,
    },
  });
}
