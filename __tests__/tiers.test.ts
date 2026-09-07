// Seller tier predicates.
//
// Regression guard for the class of bug that shipped in listing/[id].tsx:
// `seller_tier === 'pro'` silently excluded founders — a PAID tier — from
// ranking, badges, collections and free boosts. Founder must behave as Pro
// everywhere.

import { isProTier, toSellerTier, tierLabel, PRO_TIERS } from '../lib/tiers';

describe('isProTier', () => {
  test('pro is a Pro tier', () => {
    expect(isProTier('pro')).toBe(true);
  });

  test('founder is a Pro tier — it is the discounted Pro price, not a lesser plan', () => {
    expect(isProTier('founder')).toBe(true);
  });

  test('free is not', () => {
    expect(isProTier('free')).toBe(false);
  });

  test.each([undefined, null, '', 'PRO', 'Founder', 'premium', 'pro '])(
    'rejects %p',
    value => {
      expect(isProTier(value as string | null | undefined)).toBe(false);
    },
  );

  test('every tier in PRO_TIERS passes', () => {
    for (const tier of PRO_TIERS) {
      expect(isProTier(tier)).toBe(true);
    }
  });
});

describe('toSellerTier', () => {
  test('preserves paid tiers', () => {
    expect(toSellerTier('pro')).toBe('pro');
    expect(toSellerTier('founder')).toBe('founder');
  });

  test.each([undefined, null, 'free', 'nonsense'])('normalises %p to free', value => {
    expect(toSellerTier(value as string | null | undefined)).toBe('free');
  });

  test('never widens founder into pro — the tiers stay distinguishable', () => {
    // Billing and the founder slot cap depend on telling these apart, even
    // though they carry identical entitlements.
    expect(toSellerTier('founder')).not.toBe('pro');
  });
});

describe('tierLabel', () => {
  test('founders keep their own name', () => {
    expect(tierLabel('founder')).toBe('Founder');
  });

  test('pro reads as the product name', () => {
    expect(tierLabel('pro')).toBe('Dukanoh Pro');
  });

  test.each([undefined, null, 'free'])('%p has no label', value => {
    expect(tierLabel(value as string | null | undefined)).toBeNull();
  });
});
