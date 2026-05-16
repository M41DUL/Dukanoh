import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { edgeFetch } from '@/lib/edgeFetch';
import { ReasonCode, DELETION_REASONS } from '@/lib/deletion';

const CONFIRM_PHRASE = 'DELETE';

export default function DeleteAccountConfirmScreen() {
  const { signOut } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [reasonCode, setReasonCode]   = useState<ReasonCode | null>(null);
  const [reasonText, setReasonText]   = useState('');
  const [confirmInput, setConfirm]    = useState('');
  const [deleting, setDeleting]       = useState(false);

  const canConfirm = confirmInput.trim() === CONFIRM_PHRASE && !deleting;

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await edgeFetch('delete-account', {
        reason_code: reasonCode ?? undefined,
        reason_text: reasonCode === 'other' ? reasonText.trim() || undefined : undefined,
      });

      if (res.status === 409) {
        Alert.alert(
          'Something changed',
          'Your account state changed since you opened this screen. Go back to review.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
        setDeleting(false);
        return;
      }
      if (!res.ok) {
        Alert.alert('Something went wrong', 'Could not delete your account. Try again in a moment.');
        setDeleting(false);
        return;
      }
      await signOut();
      router.replace('/(auth)/intro');
    } catch {
      Alert.alert('Something went wrong', 'Check your connection and try again.');
      setDeleting(false);
    }
  }, [reasonCode, reasonText, signOut]);

  return (
    <ScreenWrapper>
      <Header title="Confirm deletion" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Why are you leaving? (optional)</Text>
        <Text style={styles.sectionHint}>
          A quick note helps us make Dukanoh better. Skip if you'd rather not.
        </Text>

        <View style={styles.reasonList}>
          {DELETION_REASONS.map(r => (
            <ReasonRow
              key={r.code}
              label={r.label}
              selected={reasonCode === r.code}
              onPress={() => setReasonCode(prev => (prev === r.code ? null : r.code))}
            />
          ))}
        </View>

        {reasonCode === 'other' && (
          <TextInput
            value={reasonText}
            onChangeText={setReasonText}
            placeholder="Tell us more (optional)"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            maxLength={500}
            style={styles.reasonInput}
          />
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Type {CONFIRM_PHRASE} to confirm</Text>
        <TextInput
          value={confirmInput}
          onChangeText={setConfirm}
          placeholder={CONFIRM_PHRASE}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[
            styles.confirmInput,
            canConfirm && { borderColor: colors.error },
          ]}
        />

        <Button
          label="Delete my account"
          onPress={handleDelete}
          variant="primary"
          size="lg"
          loading={deleting}
          disabled={!canConfirm}
          backgroundColor={colors.error}
          textColor="#FFFFFF"
          style={styles.deleteBtn}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

function ReasonRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.reasonRow, selected && { borderColor: colors.primary }]}
    >
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.primary : colors.border },
        ]}
      >
        {selected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
      </View>
      <Text style={styles.reasonLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const getStyles = (colors: ColorTokens) => StyleSheet.create({
  scroll: {
    paddingTop:    Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  sectionLabel: {
    ...FontFamily.semibold,
    fontSize:     14,
    color:        colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    ...FontFamily.regular,
    fontSize:     13,
    color:        colors.textSecondary,
    lineHeight:   18,
    marginBottom: Spacing.md,
  },
  reasonList: {
    gap: Spacing.sm,
  },
  reasonRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderWidth:     BorderWidth.standard,
    borderColor:     colors.border,
    borderRadius:    BorderRadius.medium,
    backgroundColor: colors.background,
  },
  radio: {
    width:        20,
    height:       20,
    borderRadius: 10,
    borderWidth:  BorderWidth.standard,
    alignItems:   'center',
    justifyContent: 'center',
  },
  radioInner: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  reasonLabel: {
    ...FontFamily.medium,
    fontSize: 14,
    color:    colors.textPrimary,
    flex:     1,
  },
  reasonInput: {
    ...FontFamily.regular,
    marginTop:         Spacing.md,
    minHeight:         88,
    borderWidth:       BorderWidth.standard,
    borderColor:       colors.border,
    borderRadius:      BorderRadius.medium,
    paddingHorizontal: Spacing.base,
    paddingVertical:   Spacing.md,
    fontSize:          14,
    color:             colors.textPrimary,
    backgroundColor:   colors.background,
    textAlignVertical: 'top',
  },
  divider: {
    height:           1,
    backgroundColor:  colors.border,
    marginVertical:   Spacing.xl,
  },
  confirmInput: {
    ...FontFamily.medium,
    height:            48,
    borderWidth:       BorderWidth.standard,
    borderColor:       colors.border,
    borderRadius:      BorderRadius.medium,
    paddingHorizontal: Spacing.base,
    fontSize:          16,
    color:             colors.textPrimary,
    backgroundColor:   colors.background,
  },
  deleteBtn: {
    marginTop: Spacing.lg,
  },
});
