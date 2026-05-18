// Pure helpers for the account-deletion flow. Kept here (rather than inline
// in the screen files) so they can be unit-tested without pulling in
// React Native or expo-router.

export type BlockerKind =
  | 'official_account'
  | 'active_pro_subscription'
  | 'active_order_buyer'
  | 'active_order_seller'
  | 'wallet_balance_pending'
  | 'wallet_balance_available'
  | 'stripe_payout_pending'
  | 'stripe_payout_in_transit'
  | 'stripe_balance';

export interface Blocker {
  kind:        BlockerKind;
  message:     string;
  order_id?:   string;
  status?:     string;
  amount?:     number;
  resolve_at?: string;
  expires_at?: string;
}

// Ionicons name string. We keep this loose (string) rather than importing
// the @expo/vector-icons type so this module stays renderer-agnostic.
export type BlockerIconName =
  | 'bag-outline'
  | 'card-outline'
  | 'star-outline'
  | 'shield-checkmark-outline';

export function blockerIcon(kind: BlockerKind): BlockerIconName {
  switch (kind) {
    case 'active_order_buyer':
    case 'active_order_seller':
      return 'bag-outline';
    case 'wallet_balance_pending':
    case 'wallet_balance_available':
    case 'stripe_payout_pending':
    case 'stripe_payout_in_transit':
    case 'stripe_balance':
      return 'card-outline';
    case 'active_pro_subscription':
      return 'star-outline';
    case 'official_account':
      return 'shield-checkmark-outline';
  }
}

// A descriptor of what action button (if any) to show under a blocker.
// The screen turns this into the actual navigation / deeplink call.
// Modelling it this way keeps the mapping pure and testable; the screen
// owns the side effects (router.push / Linking.openURL).
export type BlockerAction =
  | { kind: 'view_order';                 label: string; orderId: string }
  | { kind: 'open_wallet';                label: string }
  | { kind: 'open_subscription_settings'; label: string };

export function blockerActionDescriptor(blocker: Blocker): BlockerAction | null {
  switch (blocker.kind) {
    case 'active_order_buyer':
    case 'active_order_seller':
      if (blocker.order_id) {
        return { kind: 'view_order', label: 'View order', orderId: blocker.order_id };
      }
      return null;
    case 'wallet_balance_available':
    case 'wallet_balance_pending':
    case 'stripe_balance':
    case 'stripe_payout_pending':
    case 'stripe_payout_in_transit':
      return { kind: 'open_wallet', label: 'Go to wallet' };
    case 'active_pro_subscription':
      return { kind: 'open_subscription_settings', label: 'Open subscription settings' };
    case 'official_account':
      return null;
  }
}

export function formatGbp(amount?: number | null): string {
  if (amount == null) return '';
  return `£${amount.toFixed(2)}`;
}

// Formats an ISO date as "1 Apr" in en-GB. Returns null if the input is
// missing or unparseable.
export function formatResolveAt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Deletion reasons surfaced on the confirm screen. The codes must stay in
// sync with the CHECK constraint on public.deletion_feedback.reason_code.
export type ReasonCode =
  | 'not_finding'
  | 'bad_experience'
  | 'privacy'
  | 'notifications'
  | 'other';

export const DELETION_REASONS: readonly { code: ReasonCode; label: string }[] = [
  { code: 'not_finding',    label: 'Not finding what I want' },
  { code: 'bad_experience', label: 'Bad experience' },
  { code: 'privacy',        label: 'Privacy concerns' },
  { code: 'notifications',  label: 'Too many notifications' },
  { code: 'other',          label: 'Other reason' },
];
