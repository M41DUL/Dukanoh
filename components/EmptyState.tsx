import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  subtext?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, heading, subtext, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.heading}>{heading}</Text>
      {subtext ? <Text style={styles.subtext}>{subtext}</Text> : null}
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} style={styles.cta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    gap: Spacing.sm,
  },
  icon: { marginBottom: Spacing.sm },
  heading: {
    ...Typography.subheading,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtext: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: { marginTop: Spacing.base, width: '100%' },
});
