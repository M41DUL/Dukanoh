import {
  Blocker,
  BlockerKind,
  blockerIcon,
  blockerActionDescriptor,
  formatGbp,
  formatResolveAt,
  DELETION_REASONS,
  ReasonCode,
} from '../lib/deletion';

// ─── Test fixtures ─────────────────────────────────────────────

const ALL_KINDS: BlockerKind[] = [
  'official_account',
  'active_pro_subscription',
  'active_order_buyer',
  'active_order_seller',
  'wallet_balance_pending',
  'wallet_balance_available',
  'stripe_payout_pending',
  'stripe_payout_in_transit',
  'stripe_balance',
];

const blocker = (overrides: Partial<Blocker> & { kind: BlockerKind }): Blocker => ({
  message: 'test message',
  ...overrides,
});

// ─── blockerIcon ───────────────────────────────────────────────

describe('blockerIcon', () => {
  test('order blockers map to the bag icon', () => {
    expect(blockerIcon('active_order_buyer')).toBe('bag-outline');
    expect(blockerIcon('active_order_seller')).toBe('bag-outline');
  });

  test('all wallet- and Stripe-related blockers map to the card icon', () => {
    expect(blockerIcon('wallet_balance_pending')).toBe('card-outline');
    expect(blockerIcon('wallet_balance_available')).toBe('card-outline');
    expect(blockerIcon('stripe_payout_pending')).toBe('card-outline');
    expect(blockerIcon('stripe_payout_in_transit')).toBe('card-outline');
    expect(blockerIcon('stripe_balance')).toBe('card-outline');
  });

  test('Pro subscription maps to the star icon', () => {
    expect(blockerIcon('active_pro_subscription')).toBe('star-outline');
  });

  test('official account maps to the shield icon', () => {
    expect(blockerIcon('official_account')).toBe('shield-checkmark-outline');
  });

  test('every blocker kind resolves to a non-empty icon name', () => {
    // Guard against silently adding a new kind without updating the mapping.
    ALL_KINDS.forEach(kind => {
      const icon = blockerIcon(kind);
      expect(typeof icon).toBe('string');
      expect(icon.length).toBeGreaterThan(0);
    });
  });
});

// ─── blockerActionDescriptor ───────────────────────────────────

describe('blockerActionDescriptor', () => {
  test('returns a view_order action for a buyer-side order with an order_id', () => {
    const action = blockerActionDescriptor(blocker({
      kind: 'active_order_buyer',
      order_id: 'abc-123',
    }));
    expect(action).toEqual({ kind: 'view_order', label: 'View order', orderId: 'abc-123' });
  });

  test('returns a view_order action for a seller-side order with an order_id', () => {
    const action = blockerActionDescriptor(blocker({
      kind: 'active_order_seller',
      order_id: 'xyz-789',
    }));
    expect(action).toEqual({ kind: 'view_order', label: 'View order', orderId: 'xyz-789' });
  });

  test('returns null for an order blocker missing order_id', () => {
    expect(blockerActionDescriptor(blocker({ kind: 'active_order_buyer' }))).toBeNull();
    expect(blockerActionDescriptor(blocker({ kind: 'active_order_seller' }))).toBeNull();
  });

  test('returns an open_wallet action for every wallet- and Stripe-related blocker', () => {
    const walletLike: BlockerKind[] = [
      'wallet_balance_pending',
      'wallet_balance_available',
      'stripe_payout_pending',
      'stripe_payout_in_transit',
      'stripe_balance',
    ];
    walletLike.forEach(kind => {
      expect(blockerActionDescriptor(blocker({ kind }))).toEqual({
        kind:  'open_wallet',
        label: 'Go to wallet',
      });
    });
  });

  test('returns an open_subscription_settings action for active Pro', () => {
    expect(blockerActionDescriptor(blocker({ kind: 'active_pro_subscription' }))).toEqual({
      kind:  'open_subscription_settings',
      label: 'Open subscription settings',
    });
  });

  test('returns null for the official_account blocker — user cannot self-resolve', () => {
    expect(blockerActionDescriptor(blocker({ kind: 'official_account' }))).toBeNull();
  });

  test('every blocker kind returns a typed action descriptor or null (never undefined)', () => {
    ALL_KINDS.forEach(kind => {
      const result = blockerActionDescriptor(blocker({ kind, order_id: 'sample' }));
      // Strict null check — undefined would mean the switch missed a case.
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });
});

// ─── formatGbp ─────────────────────────────────────────────────

describe('formatGbp', () => {
  test('formats a whole number to two decimal places', () => {
    expect(formatGbp(50)).toBe('£50.00');
  });

  test('preserves two decimal places for fractional values', () => {
    expect(formatGbp(12.5)).toBe('£12.50');
    expect(formatGbp(0.99)).toBe('£0.99');
    expect(formatGbp(1234.56)).toBe('£1234.56');
  });

  test('returns an empty string for null / undefined', () => {
    expect(formatGbp(undefined)).toBe('');
    expect(formatGbp(null)).toBe('');
  });

  test('handles zero', () => {
    expect(formatGbp(0)).toBe('£0.00');
  });
});

// ─── formatResolveAt ───────────────────────────────────────────

describe('formatResolveAt', () => {
  test('formats a valid ISO string as "D MMM" in en-GB', () => {
    expect(formatResolveAt('2026-04-01T12:00:00Z')).toBe('1 Apr');
    expect(formatResolveAt('2026-12-25T00:00:00Z')).toBe('25 Dec');
  });

  test('returns null for null / undefined / empty', () => {
    expect(formatResolveAt(undefined)).toBeNull();
    expect(formatResolveAt(null)).toBeNull();
    expect(formatResolveAt('')).toBeNull();
  });

  test('returns null for unparseable input', () => {
    expect(formatResolveAt('not-a-date')).toBeNull();
    expect(formatResolveAt('2026-13-45')).toBeNull();
  });
});

// ─── DELETION_REASONS ──────────────────────────────────────────

describe('DELETION_REASONS', () => {
  test('exposes exactly the five codes accepted by the deletion_feedback CHECK constraint', () => {
    const codes = DELETION_REASONS.map(r => r.code).sort();
    expect(codes).toEqual([
      'bad_experience',
      'not_finding',
      'notifications',
      'other',
      'privacy',
    ]);
  });

  test('every reason has a non-empty user-facing label', () => {
    DELETION_REASONS.forEach(r => {
      expect(typeof r.label).toBe('string');
      expect(r.label.trim().length).toBeGreaterThan(0);
    });
  });

  test('reason codes are unique', () => {
    const codes = DELETION_REASONS.map(r => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('reason labels are unique', () => {
    const labels = DELETION_REASONS.map(r => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('"other" is included so the user always has a fallback', () => {
    const codes: ReasonCode[] = DELETION_REASONS.map(r => r.code);
    expect(codes).toContain('other');
  });
});
