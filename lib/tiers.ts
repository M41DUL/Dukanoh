/**
 * Seller tier predicates.
 *
 * `founder` is a PAID tier — the discounted early-adopter price for Dukanoh
 * Pro, not a lesser plan. It must receive every Pro benefit. Comparing
 * `seller_tier === 'pro'` directly is always a bug: it silently excludes
 * founders from ranking, badges, collections and free boosts.
 *
 * Always route tier checks through `isProTier`.
 */

export type SellerTier = 'free' | 'pro' | 'founder';

/** Every tier that carries Dukanoh Pro entitlements. */
export const PRO_TIERS = ['pro', 'founder'] as const;

/**
 * True when the tier carries Pro entitlements (`pro` or `founder`).
 *
 * Accepts the loose `string | null | undefined` that Supabase rows return,
 * so callers don't have to cast. Narrows to the paid union on success.
 */
export function isProTier(tier?: string | null): tier is 'pro' | 'founder' {
  return tier === 'pro' || tier === 'founder';
}

/**
 * Normalises an arbitrary DB value into a known tier, defaulting to 'free'.
 * Use when a value flows into state that is typed as SellerTier.
 */
export function toSellerTier(tier?: string | null): SellerTier {
  return isProTier(tier) ? tier : 'free';
}

/**
 * Display label for a tier. Founders keep their own name — it's the reason
 * they subscribed early.
 */
export function tierLabel(tier?: string | null): string | null {
  if (tier === 'founder') return 'Founder';
  if (tier === 'pro') return 'Dukanoh Pro';
  return null;
}
