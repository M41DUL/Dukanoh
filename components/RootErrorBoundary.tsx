import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportError } from '@/lib/errorReporting';
import { Spacing, Typography, FontFamily, lightColors } from '@/constants/theme';

interface State {
  error: Error | null;
}

/**
 * Top-of-tree error boundary. Catches any render-time error thrown
 * below `<RootNavigator />` (provider tree, screen render, mutation
 * callbacks invoked during render) so a single bad query or
 * provider doesn't white-screen the whole app.
 *
 * Errors are reported via reportError so they surface in
 * lib/errorReporting's app_errors table. The fallback UI is
 * intentionally theme-agnostic (uses lightColors directly) because a
 * crash in `ThemeProvider` itself would land here, with no theme
 * context available.
 *
 * Class component because React requires componentDidCatch /
 * getDerivedStateFromError, which are class-only APIs.
 */
export class RootErrorBoundary extends React.Component<
  React.PropsWithChildren<unknown>,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    reportError(error, 'RootErrorBoundary');
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <Ionicons name="alert-circle-outline" size={48} color={lightColors.error} />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          {__DEV__
            ? this.state.error.message
            : 'An unexpected error occurred. Please try again.'}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={this.reset} activeOpacity={0.8}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.md,
  },
  title: {
    ...Typography.subheading,
    color: lightColors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...Typography.body,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    backgroundColor: lightColors.primary,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: 100,
  },
  retryText: {
    ...Typography.body,
    ...FontFamily.semibold,
    color: '#FFFFFF',
  },
});
