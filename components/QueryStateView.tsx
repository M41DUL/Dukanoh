import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';

interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface EmptyConfig {
  icon?: React.ReactNode;
  heading: string;
  subtext?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

interface QueryStateViewProps {
  query: QueryLike;
  isEmpty: boolean;
  empty: EmptyConfig;
  errorHeading?: string;
  errorSubtext?: string;
  errorCtaLabel?: string;
  children: React.ReactNode;
}

// Renders the four data-area states for a useQuery / useInfiniteQuery result:
// loading → error (with Retry) → empty → success (children). `isEmpty` is
// computed by the caller because each screen filters/derives data differently.
export function QueryStateView({
  query,
  isEmpty,
  empty,
  errorHeading = 'Something went wrong',
  errorSubtext = 'Check your connection and try again.',
  errorCtaLabel = 'Retry',
  children,
}: QueryStateViewProps) {
  const colors = useThemeColors();

  if (query.isLoading) return <LoadingSpinner />;

  if (query.isError) {
    return (
      <EmptyState
        icon={<Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />}
        heading={errorHeading}
        subtext={errorSubtext}
        ctaLabel={errorCtaLabel}
        onCta={() => query.refetch()}
      />
    );
  }

  if (isEmpty) return <EmptyState {...empty} />;

  return <>{children}</>;
}
