/**
 * Pro ranking boost — applied post-fetch in JS.
 *
 * Rules (from spec):
 * - Pro sellers' listings appear higher in feed / search results
 * - Guardrails:
 *   1. Max 25% of results can be Pro-boosted (dilution cap)
 *   2. Listing must be < 60 days old to qualify for boost (recency floor)
 *
 * Implementation: eligible Pro listings are moved to the front, capped at
 * floor(n * 0.25). Overflow Pro listings drop back to their original position
 * relative to the rest.
 */
export function proRankSort<T extends {
  seller?: { seller_tier?: string } | null;
  created_at?: string;
}>(listings: T[], maxProFraction = 0.25): T[] {
  if (listings.length === 0) return listings;

  const now = Date.now();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  const isEligible = (l: T) =>
    l.seller?.seller_tier === 'pro' &&
    !!l.created_at &&
    now - new Date(l.created_at).getTime() < sixtyDaysMs;

  const eligible: T[] = [];
  const rest: T[] = [];

  for (const l of listings) {
    if (isEligible(l)) eligible.push(l);
    else rest.push(l);
  }

  const cap = Math.floor(listings.length * maxProFraction);
  const promoted = eligible.slice(0, cap);
  const overflow = eligible.slice(cap);

  // Overflow Pro listings go back into rest in their relative order
  return [...promoted, ...rest, ...overflow];
}
