import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { edgeFetch } from '@/lib/edgeFetch';
import { ReasonCode, DELETION_REASONS } from '@/lib/deletion';

const CONFIRM_PHRASE = 'DELETE';
const REASON_MAX_LENGTH = 500;

type Status = 'idle' | 'deleting' | 'success';

export default function DeleteAccountConfirmScreen() {
  const { signOut } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [confirmInput, setConfirm]  = useState('');
  const [status, setStatus]         = useState<Status>('idle');

  const canConfirm = confirmInput.trim() === CONFIRM_PHRASE && status === 'idle';

  const handleDelete = useCallback(async () => {
    setStatus('deleting');
    try {
      const res = await edgeFetch('delete-account', {
        reason_code: reasonCode ?? undefined,
        reason_text: reasonCode === 'other' ? reasonText.trim() || undefined : undefined,
      });

      if (res.status === 409) {
        // State changed between preview and confirm (race). Send them back
        // so the index screen refetches blockers via useFocusEffect.
        setStatus('idle');
        Alert.alert(
          'Something changed',
          "Your account state changed since you opened this screen. We'll take you back to review.",
          [{ text: 'OK', onPress: () => router.back() }],
        );
        return;
      }

      if (!res.ok) {
        setStatus('idle');
        Alert.alert(
          'We hit a problem',
          "We couldn't close your account just now. Nothing has been changed. Try again in a moment.",
        );
        return;
      }

      setStatus('success');
    } catch {
      setStatus('idle');
      Alert.alert(
        'No connection',
        "We couldn't reach Dukanoh. Your account hasn't been changed. Check your connection and try again.",
      );
    }
  }, [reasonCode, reasonText]);

  const handleDone = useCallback(async () => {
    await signOut();
    router.replace('/(auth)/intro');
  }, [signOut]);

  return (
    <ScreenWrapper>
      <Header title="Confirm deletion" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Why are you leaving? (optional)</Text>
        <Text style={styles.sectionHint}>
          A quick note helps us improve Dukanoh. Skip if you'd rather not.
        </Text>

        <View
          style={styles.reasonList}
          accessibilityRole="radiogroup"
        >
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
          <View style={styles.reasonInputWrap}>
            <TextInput
              value={reasonText}
              onChangeText={setReasonText}
              placeholder="Anything else? (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              maxLength={REASON_MAX_LENGTH}
              style={styles.reasonInput}
              accessibilityLabel="Additional feedback"
            />
            <Text style={styles.charCount}>
              {reasonText.length} / {REASON_MAX_LENGTH}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Type {CONFIRM_PHRASE} to confirm</Text>
        <Text style={styles.sectionHint}>Letters must be uppercase.</Text>
        <TextInput
          value={confirmInput}
          onChangeText={setConfirm}
          placeholder={CONFIRM_PHRASE}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`Type ${CONFIRM_PHRASE} to confirm deletion`}
          style={[
            styles.confirmInput,
            canConfirm && { borderColor: colors.error },
          ]}
        />

        <Button
          label="Permanently delete account"
          onPress={handleDelete}
          variant="primary"
          size="lg"
          disabled={!canConfirm}
          backgroundColor={colors.error}
          textColor="#FFFFFF"
          style={styles.deleteBtn}
        />

        <Button
          label="Cancel"
          onPress={() => router.back()}
          variant="ghost"
          size="md"
          style={styles.cancelBtn}
        />
      </ScrollView>

      {/* Full-screen overlay during deletion + success. Covers the Header
          so the back arrow is unreachable; onRequestClose is a no-op during
          deletion so Android hardware back is also blocked. */}
      <Modal
        visible={status === 'deleting' || status === 'success'}
        animationType="fade"
        transparent={false}
        onRequestClose={() => {
          if (status === 'success') handleDone();
        }}
      >
        <View style={[styles.overlay, { backgroundColor: colors.background }]}>
          {status === 'deleting' && (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.overlayHeading}>Closing your account</Text>
              <Text style={styles.overlayBody}>
                Removing your data, revoking your sessions, and closing your Stripe account. This takes a few seconds.
              </Text>
            </>
          )}

          {status === 'success' && (
            <>
              <View style={[styles.successIconWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name="checkmark-circle-outline" size={48} color={colors.textPrimary} />
              </View>
              <Text style={styles.overlayHeading}>Your account has been deleted</Text>
              <Text style={styles.overlayBody}>
                Thanks for your time on Dukanoh. We've kept the records required for tax and finance only.
              </Text>
              <Button
                label="Done"
                onPress={handleDone}
                variant="primary"
                size="lg"
                style={styles.doneBtn}
              />
            </>
          )}
        </View>
      </Modal>
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
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
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
    flexDirection:     'row',
    alignItems:        'center',
    gap:               Spacing.md,
    paddingVertical:   Spacing.md,
    paddingHorizontal: Spacing.base,
    borderWidth:       BorderWidth.standard,
    borderColor:       colors.border,
    borderRadius:      BorderRadius.medium,
    backgroundColor:   colors.background,
  },
  radio: {
    width:          20,
    height:         20,
    borderRadius:   10,
    borderWidth:    BorderWidth.standard,
    alignItems:     'center',
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
  reasonInputWrap: {
    marginTop: Spacing.md,
  },
  reasonInput: {
    ...FontFamily.regular,
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
  charCount: {
    ...FontFamily.regular,
    fontSize:  12,
    color:     colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'right',
  },
  divider: {
    height:          1,
    backgroundColor: colors.border,
    marginVertical:  Spacing.xl,
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
  cancelBtn: {
    marginTop: Spacing.sm,
  },

  // Modal overlay
  overlay: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: Spacing.xl,
    gap:               Spacing.md,
  },
  overlayHeading: {
    ...FontFamily.semibold,
    fontSize:   20,
    color:      colors.textPrimary,
    textAlign:  'center',
    marginTop:  Spacing.md,
  },
  overlayBody: {
    ...FontFamily.regular,
    fontSize:   14,
    color:      colors.textSecondary,
    lineHeight: 20,
    textAlign:  'center',
    maxWidth:   320,
  },
  successIconWrap: {
    width:          88,
    height:         88,
    borderRadius:   44,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   Spacing.sm,
  },
  doneBtn: {
    marginTop:    Spacing.xl,
    alignSelf:    'stretch',
    maxWidth:     360,
  },
});
