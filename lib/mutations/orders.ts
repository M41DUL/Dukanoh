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
// edge-function calls with row writes (useCancelOrder). Order CREATION lives
// server-side in the create-payment-intent edge function, which inserts the
// row as a 'pending' reservation before charging; checkout never writes one.
// All invalidate `queryKeys.orders.all` and any other caches the
// underlying writes touch (listings.all, myListings.all, home.all where
// relevant).
//
// Dispute resolution is admin-only and lives in dukanoh-web (uses
// service-role to bypass RLS). The mobile app no longer ships an admin
// resolution screen.
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
    mutationFn: async ({ orderId, reason, description }: RaiseDisputeArgs) => {
      // SECURITY DEFINER RPC enforces buyer = auth.uid() and status in shipped/delivered.
      const { error } = await supabase.rpc('raise_dispute', {
        p_order_id: orderId,
        p_reason: reason,
        p_description: description,
      });
      if (error) throw new OrderStateChangedError();
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
    mutationFn: async ({ orderId }: WithdrawDisputeArgs) => {
      // SECURITY DEFINER RPC enforces buyer = auth.uid() and status = disputed.
      const { error } = await supabase.rpc('withdraw_dispute', { p_order_id: orderId });
      if (error) throw new OrderStateChangedError();
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
      const { orderId, cancelledBy } = args;

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
      // SECURITY DEFINER RPC enforces caller = buyer/seller + cancellable state,
      // and atomically flips status, relists the item, and (seller) records the
      // cancellation strike — replacing the previous direct UPDATEs.
      const { error: cancelErr } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
        p_cancelled_by: cancelledBy,
      });
      if (cancelErr) throw new OrderStateChangedError();
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

interface AppealDisputeArgs {
  orderId: string;
  reason: string;
}

// Calls the submit_order_appeal SECURITY DEFINER RPC, which derives
// appeal_by from auth.uid() (so a buyer can't impersonate a seller appeal)
// and bypasses RLS (so a seller can actually appeal, which their direct
// UPDATE policy doesn't permit).
export function useAppealDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, reason }: AppealDisputeArgs) => {
      const { error } = await supabase.rpc('submit_order_appeal', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}
