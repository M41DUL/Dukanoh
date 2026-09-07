import { isProTier } from '@/lib/tiers';

/**
 * Pro ranking boost — applied post-fetch in JS.
 *
 * Rules:
 * - Pro sellers' listings appear higher in feed / search results
 *   (both paid tiers — `pro` and `founder` — qualify)
 * - Guardrails:
 *   1. Max 25% of results can be Pro-boosted (dilution cap)
 *   2. Listing must be < 30 days old to qualify for boost (recency floor)
 *   3. Max 1 listing per Pro seller near the top (seller diversity cap)
 *      — since results arrive newest-first, the first listing seen per seller
 *        is always their most recent eligible one. Their remaining listings
 *        are deferred to the tail so one seller can't dominate the feed.
 *
 * Overflow Pro listings (beyond the cap) sit after the rest; a seller's
 * second and subsequent listings sit after those.
 */
export function proRankSort<T extends {
  seller_id?: string;
  seller?: { seller_tier?: string | null } | null;
  created_at?: string | null;
}>(listings: T[], maxProFraction = 0.25): T[] {
  if (listings.length === 0) return listings;

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const isEligible = (l: T) =>
    isProTier(l.seller?.seller_tier) &&
    !!l.created_at &&
    now - new Date(l.created_at).getTime() < thirtyDaysMs;

  const eligible: T[] = [];
  const rest: T[] = [];
  const deferred: T[] = [];
  const seenProSellers = new Set<string>();

  for (const l of listings) {
    if (isEligible(l)) {
      const sid = l.seller_id;
      if (sid && !seenProSellers.has(sid)) {
        // First eligible listing for this Pro seller — promote it
        seenProSellers.add(sid);
        eligible.push(l);
      } else {
        // This seller already holds a promoted slot. Defer their remaining
        // listings past everyone else's rather than returning them to their
        // original position — results arrive newest-first, so a seller who
        // lists several pieces in one sitting would otherwise take the whole
        // top of the feed: one promoted, the rest clustered right behind it.
        deferred.push(l);
      }
    } else {
      rest.push(l);
    }
  }

  const cap = Math.floor(listings.length * maxProFraction);
  const promoted = eligible.slice(0, cap);
  const overflow = eligible.slice(cap);

  // Tail order: Pro sellers who didn't fit the cap still rank above a seller's
  // second and subsequent listings.
  return [...promoted, ...rest, ...overflow, ...deferred];
}
