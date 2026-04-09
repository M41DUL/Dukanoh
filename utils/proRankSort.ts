/**
 * Pro ranking boost — applied post-fetch in JS.
 *
 * Rules:
 * - Pro sellers' listings appear higher in feed / search results
 * - Guardrails:
 *   1. Max 25% of results can be Pro-boosted (dilution cap)
 *   2. Listing must be < 60 days old to qualify for boost (recency floor)
 *   3. Max 1 listing per Pro seller in the promoted slots (seller diversity cap)
 *      — since results arrive newest-first, the first listing seen per seller
 *        is always their most recent eligible one.
 *
 * Overflow Pro listings (beyond cap or seller already represented) drop back
 * to their original position relative to the rest.
 */
export function proRankSort<T extends {
  seller_id?: string;
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
  const seenProSellers = new Set<string>();

  for (const l of listings) {
    if (isEligible(l)) {
      const sid = l.seller_id;
      if (sid && !seenProSellers.has(sid)) {
        // First eligible listing for this Pro seller — promote it
        seenProSellers.add(sid);
        eligible.push(l);
      } else {
        // Pro seller already has a promoted slot — drop back to rest
        rest.push(l);
      }
    } else {
      rest.push(l);
    }
  }

  const cap = Math.floor(listings.length * maxProFraction);
  const promoted = eligible.slice(0, cap);
  const overflow = eligible.slice(cap);

  // Overflow Pro listings go back into rest in their relative order
  return [...promoted, ...rest, ...overflow];
}
