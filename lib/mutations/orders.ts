// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { edgeFetch } from '../edgeFetch';
import { supabase } from '../supabase';
import { queryKeys } from '../queryKeys';

function invalidateOrders(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
}

// ─── Orders ───────────────────────────────────────────────────
//
// Single-call state-transition wrappers (mark shipped, confirm receipt,
// raise/withdraw dispute, appeal) plus the multi-step flows that compose
// edge-function calls with row writes (useCancelOrder, useResolveDispute,
// useCreateOrder). All invalidate `queryKeys.orders.all` and any other
// caches the underlying writes touch (listings.all, myListings.all,
// home.all where relevant).
//
// State-gated updates (status filters in the WHERE clause) attach `.select('id')`
// and assert a row came back — otherwise Supabase returns no error when the
// gate matches nothing, and the UI silently advances over a stale state.

// Thrown when a state-gated order update matched zero rows, i.e. the order's
// status moved between the screen rendering and the user tapping the button.
// Callers can catch this to show a "this order was already updated, refresh"
// alert instead of a generic error.
export class OrderStateChangedError extends Error {
  constructor() {
    super('Order state changed — please refresh and try again');
    this.name = 'OrderStateChangedError';
  }
}

interface MarkOrderShippedArgs {
  orderId: string;
  sellerId: string;
  trackingNumber: string;
  courier?: string;
}

export function useMarkOrderShipped() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, sellerId, trackingNumber, courier }: MarkOrderShippedArgs) => {
      const { error } = await supabase.rpc('mark_order_shipped', {
        p_order_id: orderId,
        p_seller_id: sellerId,
        p_tracking: trackingNumber,
        p_courier: courier,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

interface ConfirmOrderReceiptArgs {
  orderId: string;
  buyerId: string;
}

export function useConfirmOrderReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, buyerId }: ConfirmOrderReceiptArgs) => {
      const { error } = await supabase.rpc('confirm_order_receipt', {
        p_order_id: orderId,
        p_buyer_id: buyerId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

interface RaiseDisputeArgs {
  orderId: string;
  buyerId: string;
  reason: string;
  description: string;
}

export function useRaiseDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, buyerId, reason, description }: RaiseDisputeArgs) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'disputed',
          dispute_reason: reason,
          dispute_description: description,
          disputed_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('buyer_id', buyerId)
        .in('status', ['shipped', 'delivered'])
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new OrderStateChangedError();
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

interface WithdrawDisputeArgs {
  orderId: string;
  buyerId: string;
}

export function useWithdrawDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, buyerId }: WithdrawDisputeArgs) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          delivered_at: now,
          completed_at: now,
        })
        .eq('id', orderId)
        .eq('buyer_id', buyerId)
        .eq('status', 'disputed')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new OrderStateChangedError();
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

// Discriminated on `cancelledBy` so the seller branch requires `sellerId` —
// otherwise the strike insert would silently skip with no compile error.
type CancelOrderArgs =
  | { orderId: string; listingId: string | null; cancelledBy: 'buyer' }
  | { orderId: string; listingId: string | null; cancelledBy: 'seller'; sellerId: string };

// Statuses from which a cancel-and-refund is valid. Anything later (delivered,
// disputed, resolved, cancelled, completed) goes through the dispute path or
// is already terminal — issuing a refund again would be a noop at best and a
// double-refund attempt at worst.
const CANCELLABLE_ORDER_STATUSES = ['paid', 'shipped'] as const;

/**
 * Cancels an order: pre-checks the order is in a cancellable state, refunds
 * the buyer via the stripe-refund edge function, marks the order cancelled,
 * returns the listing to `available`, and (for seller-cancelled orders)
 * inserts a row into `cancellation_strikes`.
 *
 * The pre-check + status-gated update prevents a double-tap from issuing two
 * refunds: the second tap reads `status = 'cancelled'` and short-circuits
 * before hitting the edge function. The pre-check + post-update gate doesn't
 * fully close the TOCTOU window (admin-resolves-and-this-tap race), but it
 * eliminates the common case (user double-tapping the cancel button).
 *
 * The mutation is not transactional across the edge function and the
 * Supabase writes, so a refund could still succeed while a later step fails;
 * that's the same shape the inline flow had pre-migration.
 *
 * Invalidates orders.all (refreshing both list + detail under the hierarchical
 * key) and myListings.all (so the listing returns to the seller's Selling tab).
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: CancelOrderArgs) => {
      const { orderId, listingId, cancelledBy } = args;

      const { data: current, error: readErr } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      if (readErr) throw readErr;
      if (!current || !CANCELLABLE_ORDER_STATUSES.includes(current.status as (typeof CANCELLABLE_ORDER_STATUSES)[number])) {
        throw new OrderStateChangedError();
      }

      const refundRes = await edgeFetch('stripe-refund', { order_id: orderId });
      if (!refundRes.ok) {
        const err = await refundRes.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Refund failed');
      }
      const { data: updated, error: orderErr } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: cancelledBy,
        })
        .eq('id', orderId)
        .in('status', [...CANCELLABLE_ORDER_STATUSES])
        .select('id');
      if (orderErr) throw orderErr;
      if (!updated || updated.length === 0) throw new OrderStateChangedError();
      if (listingId) {
        const { error: listingErr } = await supabase
          .from('listings')
          .update({ status: 'available', buyer_id: null, sold_at: null })
          .eq('id', listingId);
        if (listingErr) throw listingErr;
      }
      if (args.cancelledBy === 'seller') {
        const { error: strikeErr } = await supabase
          .from('cancellation_strikes')
          .insert({ seller_id: args.sellerId, order_id: orderId });
        if (strikeErr) throw strikeErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      // Cancelled listing returns to Suggested / New arrivals on home and to
      // browse/search caches.
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface ResolveDisputeArgs {
  orderId: string;
  listingId: string | null;
  outcome: 'release_seller' | 'refund_buyer';
  note: string;
}

/**
 * Admin resolution of a disputed order.
 *
 * For `refund_buyer`, fires the Stripe refund edge function first and
 * relists the item (status → available, buyer_id null, sold_at null) so
 * it returns to the home feed. For `release_seller`, only writes the
 * resolution fields — the wallet credit is deferred until the 7-day
 * appeal window closes (handled by the auto_release_orders job).
 *
 * Both branches stamp `appeal_deadline_at` 7 days out. The orders update
 * is gated on `status = 'disputed'` and asserts a row came back; the
 * refund branch also pre-checks the order's status before issuing the
 * Stripe refund so we don't refund a buyer whose dispute was already
 * resolved on another admin's screen. (TOCTOU still possible across the
 * read → refund window, but the post-update assertion bounds the damage
 * to the rare race rather than the routine double-click case.)
 *
 * Invalidates adminDisputes.all (this screen), orders.all (buyer + seller
 * order lists, order detail), listings.all + home.all + myListings.all
 * (refunded path relists the item).
 */
export function useResolveDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, listingId, outcome, note }: ResolveDisputeArgs) => {
      const now = new Date().toISOString();
      const appealDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (outcome === 'refund_buyer') {
        const { data: current, error: readErr } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .single();
        if (readErr) throw readErr;
        if (current?.status !== 'disputed') throw new OrderStateChangedError();

        const refundRes = await edgeFetch('stripe-refund', { order_id: orderId });
        if (!refundRes.ok) {
          const err = await refundRes.json().catch(() => ({}));
          throw new Error(err?.error ?? 'Could not process refund. Please try again.');
        }
      }

      const { data: updated, error: orderErr } = await supabase
        .from('orders')
        .update({
          status: 'resolved',
          resolution_outcome: outcome,
          resolution_note: note,
          resolved_at: now,
          appeal_deadline_at: appealDeadline,
        })
        .eq('id', orderId)
        .eq('status', 'disputed')
        .select('id');
      if (orderErr) throw orderErr;
      if (!updated || updated.length === 0) throw new OrderStateChangedError();

      if (outcome === 'refund_buyer' && listingId) {
        const { error: listingErr } = await supabase
          .from('listings')
          .update({ status: 'available', buyer_id: null, sold_at: null })
          .eq('id', listingId);
        if (listingErr) throw listingErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminDisputes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface CreateOrderArgs {
  listingId: string;
  buyerId: string;
  sellerId: string;
  itemPrice: number;
  protectionFee: number;
  totalPaid: number;
  stripePaymentId: string;
  // Far-future sentinel ('2099-01-01...') for unverified-seller payouts so
  // stripe-connect-status can sweep them once onboarding completes; null when
  // the seller is already verified.
  sellerVerifyDeadline: string | null;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string | null;
  deliveryCity: string;
  deliveryPostcode: string;
  deliveryCountry: string;
}

/**
 * Post-payment write for the checkout flow. Stripe (PaymentIntent +
 * presentPaymentSheet) STAYS imperative — this hook owns only what happens
 * AFTER the payment succeeds: insert the `orders` row, then flip the listing
 * to `sold` (mirroring the inline pre-migration sequence — sequential, not
 * transactional, so a partial failure leaves the listing as `available` until
 * a refund + cleanup runs).
 *
 * The mutationFn rejects with the raw Supabase error so callers can inspect
 * `error.code === '23505'` to recover the existing order id when the
 * listing_id unique constraint fires (the buyer double-tapped Pay).
 *
 * Invalidates orders.all (buyer + seller order lists, order detail), listings.all
 * (browse / search / detail caches see the new `sold` status) and myListings.all
 * (listing leaves seller's Selling tab; appears in buyer's Bought tab).
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: CreateOrderArgs): Promise<{ id: string }> => {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          listing_id: args.listingId,
          buyer_id: args.buyerId,
          seller_id: args.sellerId,
          status: 'paid',
          item_price: args.itemPrice,
          protection_fee: args.protectionFee,
          total_paid: args.totalPaid,
          stripe_payment_id: args.stripePaymentId,
          seller_verify_deadline: args.sellerVerifyDeadline,
          delivery_address_line1: args.deliveryAddressLine1,
          delivery_address_line2: args.deliveryAddressLine2,
          delivery_city: args.deliveryCity,
          delivery_postcode: args.deliveryPostcode,
          delivery_country: args.deliveryCountry,
        })
        .select('id')
        .single();
      if (orderError || !order) throw orderError ?? new Error('Order insert returned no row');

      // Mirror the inline flow: best-effort listing flip — its error was not
      // surfaced pre-migration. Cancellation / refund paths reset this back
      // to `available`. Status is gated so two concurrent paying buyers can't
      // both clobber the row's buyer_id; only the first transition lands.
      await supabase
        .from('listings')
        .update({ status: 'sold', buyer_id: args.buyerId, sold_at: new Date().toISOString() })
        .eq('id', args.listingId)
        .eq('status', 'available');

      return { id: order.id as string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      // Sold listing should drop out of Suggested / New arrivals on home.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface AppealDisputeArgs {
  orderId: string;
  appealedBy: 'buyer' | 'seller';
  reason: string;
}

export function useAppealDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, appealedBy, reason }: AppealDisputeArgs) => {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'disputed',
          appealed_at: new Date().toISOString(),
          appeal_by: appealedBy,
          appeal_reason: reason,
        })
        .eq('id', orderId)
        .eq('status', 'resolved')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new OrderStateChangedError();
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}
