// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../queryKeys';

// ─── Boosts ───────────────────────────────────────────────────
//
// Pro Story Boosts. Each boost is a row in `boosts` (listing_id, seller_id,
// expires_at, amount_paid) plus mirror flags on the `listings` row
// (is_boosted, boost_expires_at) and a monthly counter on the user
// (boosts_used, boosts_reset_at). All three writes happen sequentially to
// match the inline flow on app/boosts.tsx — there is no transaction, but the
// caller can refetch and reconcile after a partial failure.
//
// Tier-gating (free vs Pro vs founder) is NOT enforced here — this hook is
// only called from the Pro-paywalled boosts screen and from places that have
// already checked the tier. Server-side RLS is the real gate. The simpler
// listing-detail boost flow at app/listing/[id].tsx mixes RevenueCat consumable
// purchases with the same writes and is intentionally NOT migrated here — its
// shape diverges enough that a single hook would balloon.

interface AddBoostArgs {
  listingId: string;
  sellerId: string;
}

const BOOST_DURATION_HOURS = 24;

/**
 * Thrown by useAddBoost when the user is already at the monthly free-boost
 * quota. Callers can use this to route to the IAP path instead.
 */
export class BoostQuotaExceededError extends Error {
  constructor() {
    super('Monthly free-boost quota exhausted.');
    this.name = 'BoostQuotaExceededError';
  }
}

/**
 * Adds a Pro story boost. Calls `increment_boosts_used` first — the RPC
 * takes a row lock, folds in monthly rollover, and returns BOOLEAN telling
 * us whether a free quota slot was actually granted. If the quota is
 * exhausted (FALSE) we throw BoostQuotaExceededError so callers can route
 * to IAP without writing any boost rows. Only on TRUE do we insert the
 * `boosts` row and mirror the flags onto `listings`; if either of those
 * later steps fails we decrement to roll the counter back.
 *
 * Invalidates boosts.all (this screen's combined list/meta query),
 * home.all (Stories row reads `boosts` to surface boosted listings), and
 * listings.all (listing detail extras reads the boost row + listing flags;
 * search/browse caches carry is_boosted on each row).
 */
export function useAddBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, sellerId }: AddBoostArgs) => {
      // 1. Atomic check-and-increment. FALSE = quota exhausted.
      const { data: granted, error: userErr } = await supabase.rpc('increment_boosts_used', {
        p_user_id: sellerId,
      });
      if (userErr) throw userErr;
      if (granted === false) throw new BoostQuotaExceededError();

      const expiresAt = new Date(
        Date.now() + BOOST_DURATION_HOURS * 60 * 60 * 1000,
      ).toISOString();

      // 2. Insert the boost record. Roll back the counter on failure.
      const { error: boostErr } = await supabase.from('boosts').insert({
        listing_id: listingId,
        seller_id: sellerId,
        expires_at: expiresAt,
        amount_paid: 0,
      });
      if (boostErr) {
        await supabase.rpc('decrement_boosts_used', { p_user_id: sellerId });
        throw boostErr;
      }

      // 3. Mirror flags onto the listing. Roll back boost row + counter on failure.
      const { error: listingErr } = await supabase
        .from('listings')
        .update({ is_boosted: true, boost_expires_at: expiresAt })
        .eq('id', listingId);
      if (listingErr) {
        await supabase
          .from('boosts')
          .delete()
          .eq('listing_id', listingId)
          .eq('seller_id', sellerId);
        await supabase.rpc('decrement_boosts_used', { p_user_id: sellerId });
        throw listingErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boosts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

interface RemoveBoostArgs {
  listingId: string;
  sellerId: string;
}

/**
 * Removes a Pro story boost: deletes the `boosts` row, clears the mirror
 * flags on `listings`, and decrements the monthly counter via the
 * `decrement_boosts_used` RPC (atomic -1, clamped at 0). Throws on any error.
 *
 * Invalidates boosts.all, home.all (so the listing drops out of the Stories
 * row), and listings.all (so listing detail / search caches see the cleared
 * is_boosted flag).
 */
export function useRemoveBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, sellerId }: RemoveBoostArgs) => {
      const { error: boostErr } = await supabase
        .from('boosts')
        .delete()
        .eq('listing_id', listingId)
        .eq('seller_id', sellerId);
      if (boostErr) throw boostErr;

      const { error: listingErr } = await supabase
        .from('listings')
        .update({ is_boosted: false, boost_expires_at: null })
        .eq('id', listingId);
      if (listingErr) throw listingErr;

      const { error: userErr } = await supabase.rpc('decrement_boosts_used', {
        p_user_id: sellerId,
      });
      if (userErr) throw userErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boosts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}
