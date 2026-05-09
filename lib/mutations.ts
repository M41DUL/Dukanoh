// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { Listing } from '@/components/ListingCard';
import { compressImage, extractStoragePath } from './imageUtils';
import { edgeFetch } from './edgeFetch';
import { buildMeasurements, type ListingForm } from './sellHelpers';
import { supabase } from './supabase';
import { queryKeys } from './queryKeys';

function invalidateOrders(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
}

interface ToggleSavedItemArgs {
  userId: string;
  listingId: string;
  isCurrentlySaved: boolean;
  price?: number;
}

/**
 * Toggles a saved_items row for (userId, listingId).
 *
 * Updates two caches optimistically: the lightweight ID set
 * (queryKeys.savedItems.ids) used by SavedContext to drive heart UI on every
 * card across the app, and the full saved-items list (queryKeys.savedItems.list)
 * used by the saved tab. Both roll back on error. After success, both
 * variants are invalidated via savedItems.all so they refetch fresh.
 */
export function useToggleSavedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, listingId, isCurrentlySaved, price }: ToggleSavedItemArgs) => {
      if (isCurrentlySaved) {
        const { error } = await supabase
          .from('saved_items')
          .delete()
          .eq('user_id', userId)
          .eq('listing_id', listingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_items')
          .insert({
            user_id: userId,
            listing_id: listingId,
            price_at_save: price ?? null,
          });
        if (error) throw error;
      }
    },
    onMutate: async ({ userId, listingId, isCurrentlySaved }) => {
      const listKey = queryKeys.savedItems.list(userId);
      const idsKey = queryKeys.savedItems.ids(userId);
      await queryClient.cancelQueries({ queryKey: queryKeys.savedItems.all });

      const previousList = queryClient.getQueryData<Listing[]>(listKey);
      const previousIds = queryClient.getQueryData<string[]>(idsKey);

      // Optimistic update for the IDs set — both add & remove, since we
      // know the listingId regardless of which direction the toggle goes.
      // Dedupe on add: a fast double-tap can run two onMutate calls before
      // the first mutationFn resolves, and the second sees the first's
      // optimistic update as its "previous". Without the includes() guard
      // the listingId would land in the array twice until the post-success
      // invalidation refetched it.
      if (previousIds) {
        queryClient.setQueryData<string[]>(
          idsKey,
          isCurrentlySaved
            ? previousIds.filter(id => id !== listingId)
            : previousIds.includes(listingId)
              ? previousIds
              : [...previousIds, listingId],
        );
      }

      // Optimistic update for the full list — only the un-save direction,
      // because for save → un-save we don't have the full Listing row to
      // insert. The post-success invalidation refetches it.
      if (isCurrentlySaved && previousList) {
        queryClient.setQueryData<Listing[]>(
          listKey,
          previousList.filter(item => item.id !== listingId),
        );
      }

      return { previousList, previousIds, listKey, idsKey };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      if (context.previousList !== undefined) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context.previousIds !== undefined) {
        queryClient.setQueryData(context.idsKey, context.previousIds);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems.all });
      // Save activity feeds Suggested-for-you, Trending categories, and
      // price-drop tracking on home, so the feed needs to refresh too.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
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
        .in('status', CANCELLABLE_ORDER_STATUSES as unknown as string[])
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

// ─── Conversations ────────────────────────────────────────────

interface CreateConversationArgs {
  listingId: string;
  buyerId: string;
  sellerId: string;
}

/**
 * Find-or-create the (listing_id, buyer_id) conversation. Returns the
 * conversation id either way. The 23505 retry guards against a race where
 * two near-simultaneous taps both miss the initial select and try to insert;
 * only one wins and the other re-selects the row that just landed.
 *
 * Callers (handleMessage / handleOffer on the listing detail screen) chain
 * navigation or useSendMessage on the returned id.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, buyerId, sellerId }: CreateConversationArgs): Promise<string> => {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', buyerId)
        .maybeSingle();
      if (existing) return existing.id as string;

      const { data: created, error } = await supabase
        .from('conversations')
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select('id')
        .single();

      if (error?.code === '23505') {
        // 23505 means the parallel-tap inserted while we were mid-flight, so
        // the row should now exist for our (listing_id, buyer_id) — but use
        // maybeSingle in case the unique violation came from somewhere
        // unexpected. .single() would throw "no rows" instead of letting us
        // surface a clearer error.
        const { data: retry, error: retryErr } = await supabase
          .from('conversations')
          .select('id')
          .eq('listing_id', listingId)
          .eq('buyer_id', buyerId)
          .maybeSingle();
        if (retryErr) throw retryErr;
        if (!retry) throw new Error('Could not open conversation. Please try again.');
        return retry.id as string;
      }
      if (error) throw error;
      return created.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

interface SendMessageArgs {
  conversationId: string;
  listingId: string | null;
  senderId: string;
  receiverId: string;
  content: string;
}

/**
 * Inserts a row into `messages`. The DB trigger updates
 * `conversations.last_message`, so the inbox realtime subscription picks the
 * change up; this hook also explicitly invalidates the per-conversation
 * messages cache + inbox.all so the canonical row replaces any optimistic
 * stub once the round trip completes.
 *
 * The `__OFFER__:` / `__OFFER_ACCEPTED__:offerId:amount` /
 * `__OFFER_DECLINED__:offerId:amount` payload format is part of the content
 * string, not the hook signature — callers compose it themselves.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, listingId, senderId, receiverId, content }: SendMessageArgs) => {
      const { error } = await supabase.from('messages').insert({
        id: Crypto.randomUUID(),
        conversation_id: conversationId,
        listing_id: listingId,
        sender_id: senderId,
        receiver_id: receiverId,
        content,
      });
      // 23505 = unique constraint violation. Treat as success because the
      // realtime echo + retry path can race a successful insert; surfacing
      // it as an error would show a spurious "Failed to send" alert for a
      // message that did, in fact, land.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.messages(vars.conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
    },
  });
}

interface MarkConversationReadArgs {
  conversationId: string;
}

/**
 * Clears `last_message_sender_id` on a conversation row, which is how the
 * inbox computes the unread dot (unread = last_message_sender_id is set and
 * != current user). Invalidates both inbox.all (so unread badges update) and
 * conversations.all (so the open thread's metadata reflects the cleared
 * state if the user backs out and returns).
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId }: MarkConversationReadArgs) => {
      const { error } = await supabase
        .from('conversations')
        .update({ last_message_sender_id: null })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

interface DeleteConversationArgs {
  conversationId: string;
  isBuyer: boolean;
  userId: string;
}

/**
 * Soft-deletes a conversation for the current user (sets either
 * `deleted_by_buyer` or `deleted_by_seller` to true depending on role).
 *
 * Optimistically removes the row from the cached inbox list, rolls back on
 * error, and invalidates `inbox.all` on success. The other party still sees
 * the conversation — this is a per-side hide, not a true delete.
 *
 * NOTE: app/listing/[id].tsx still does its own conversation insert + offer
 * message insert and carries TODO(tanstack-migrate) breadcrumbs that point at
 * useSendMessage. Those write paths fire DB triggers + realtime that this
 * screen relies on, so any migration of listing/[id].tsx must keep that wiring.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, isBuyer }: DeleteConversationArgs) => {
      const field = isBuyer ? 'deleted_by_buyer' : 'deleted_by_seller';
      const { error } = await supabase
        .from('conversations')
        .update({ [field]: true })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async ({ conversationId, userId }) => {
      const listKey = queryKeys.inbox.list(userId);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<{ id: string }[]>(listKey);
      if (previous) {
        queryClient.setQueryData(
          listKey,
          previous.filter(c => c.id !== conversationId),
        );
      }
      return { previous, listKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
    },
  });
}

// ─── Listings ─────────────────────────────────────────────────

interface CreateListingArgs {
  userId: string;
  form: ListingForm;
  measurementsNote: string;
  images: string[];
  newStatus: 'available' | 'draft';
  // Per-image upload progress so the sell screen can render the
  // "Uploading photos… 2/8" text. Called once with (0, total) up-front
  // and once per successful upload with the running done count.
  onUploadProgress?: (done: number, total: number) => void;
}

// Compress + upload one local image URI; returns { path, publicUrl } so
// callers can both store the URL on the row and remove the blob if a later
// step (e.g. the row insert) fails. Throws on upload failure.
async function uploadOneListingImage(uri: string, userId: string): Promise<{ path: string; publicUrl: string }> {
  const compressed = await compressImage(uri);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const response = await fetch(compressed);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from('listings')
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    });
  if (error) throw new Error(`Failed to upload photo: ${error.message}`);
  const { data } = supabase.storage.from('listings').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

// Best-effort cleanup of orphaned uploads. Used when a later step in a multi-
// step flow fails — we don't want to leave dead blobs in the bucket. Errors
// are swallowed: by the time we're here the user is already getting a failure
// alert, and a failed cleanup on top of that helps no one.
async function removeListingBlobs(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from('listings').remove(paths);
  } catch {
    // Swallow — see comment above.
  }
}

/**
 * Creates a new listing: uploads images concurrently to the `listings` storage
 * bucket, then inserts the row with status set to either 'available' (publish)
 * or 'draft' (save for later). Returns the new listing's id along with the
 * uploaded public image URLs so the caller can render the success view
 * without re-fetching.
 *
 * If any upload fails (so Promise.all rejects with some siblings already
 * landed) or the row insert fails after all uploads succeeded, we best-effort
 * remove the uploaded blobs so the bucket doesn't accumulate orphans.
 *
 * Invalidates myListings.all (Selling/Drafts tabs), listings.all (browse,
 * search, detail caches), and home.all (Suggested / New arrivals) so the new
 * listing surfaces everywhere it should without a manual refresh.
 */
export function useCreateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      form,
      measurementsNote,
      images,
      newStatus,
      onUploadProgress,
    }: CreateListingArgs): Promise<{ id: string; images: string[] }> => {
      onUploadProgress?.(0, images.length);
      // Collect succeeded paths as they land so we can clean up if a sibling
      // upload — or the row insert below — fails.
      const succeeded: string[] = [];
      let completed = 0;
      let uploaded: { path: string; publicUrl: string }[];
      try {
        uploaded = await Promise.all(
          images.map(async uri => {
            const result = await uploadOneListingImage(uri, userId);
            succeeded.push(result.path);
            completed += 1;
            onUploadProgress?.(completed, images.length);
            return result;
          }),
        );
      } catch (err) {
        await removeListingBlobs(succeeded);
        throw err;
      }
      const imageUrls = uploaded.map(u => u.publicUrl);

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: userId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          price: parseFloat(form.price),
          gender: form.gender,
          category: form.category,
          condition: form.condition,
          size: form.size || null,
          occasion: form.occasion || null,
          colour: form.colour || null,
          fabric: form.fabric || null,
          measurements: buildMeasurements(measurementsNote),
          worn_at: form.worn_at.trim() || null,
          images: imageUrls,
          status: newStatus,
          published_at: newStatus === 'available' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (error) {
        await removeListingBlobs(succeeded);
        throw error;
      }
      return { id: data.id as string, images: imageUrls };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface DeleteListingArgs {
  listingId: string;
  status: Listing['status'];
  images: string[] | null | undefined;
}

// Sentinel error so callers can show a specific alert instead of a generic one
// when a published listing still has an in-flight order.
export class ActiveOrderExistsError extends Error {
  constructor() {
    super('Listing has an active order in progress');
    this.name = 'ActiveOrderExistsError';
  }
}

/**
 * Deletes a listing: checks for active orders (only for published listings),
 * removes storage files, then deletes the row. Invalidates `myListings.all`
 * and `listings.all` on success so the My items lists and any cached detail
 * view refetch.
 */
export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, status, images }: DeleteListingArgs) => {
      if (status === 'available') {
        const { count, error: countError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', listingId)
          .not('status', 'in', '(cancelled,completed,resolved)');
        if (countError) throw countError;
        if (count && count > 0) throw new ActiveOrderExistsError();
      }
      const storagePaths = (images ?? [])
        .map(url => extractStoragePath(url, 'listings'))
        .filter((p): p is string => p !== null);
      if (storagePaths.length > 0) {
        // Best-effort: a storage failure shouldn't block the row delete (the
        // user already confirmed and is waiting on a response). The codebase
        // has a `no-console` rule, so the error is intentionally not logged
        // — orphans are accepted as the failure mode here.
        await supabase.storage.from('listings').remove(storagePaths);
      }
      const { error } = await supabase.from('listings').delete().eq('id', listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      // Deletion can drop a row from Suggested / New arrivals on home.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface UpdateListingPatch {
  title: string;
  description: string | null;
  price: number;
  gender: string | undefined;
  category: string;
  condition: string;
  size: string | null;
  occasion: string | null;
  colour: string | null;
  fabric: string | null;
  measurements: { note: string } | null;
  worn_at: string | null;
}

interface UpdateListingArgs {
  listingId: string;
  userId: string;
  patch: UpdateListingPatch;
  // The final ordered list of image URIs the user wants on the listing.
  // Mix of existing `https://…/storage/v1/object/public/listings/…` URLs
  // (carry through unchanged) and local `file://` URIs from the picker
  // (uploaded fresh).
  images: string[];
  // The listing's previously-saved image URLs, used to compute which storage
  // blobs to remove after a successful update — anything in `previousImages`
  // that isn't in the final URL list is dropped from the bucket.
  previousImages: string[];
  newStatus: 'draft' | 'available';
}

// Compress + upload any local image URIs in `images` in parallel; pass through
// existing http(s) URLs unchanged. Returns the final ordered list of public
// URLs along with the storage paths of the newly-uploaded blobs (so callers
// can clean them up if a later step fails). Preserves caller-supplied order.
async function uploadListingImages(
  images: string[],
  userId: string,
): Promise<{ urls: string[]; uploadedPaths: string[] }> {
  const uploadedPaths: string[] = [];
  const slots: (string | null)[] = images.map(uri => (uri.startsWith('http') ? uri : null));
  const localIndexes = images
    .map((uri, i) => (uri.startsWith('http') ? -1 : i))
    .filter(i => i !== -1);

  try {
    await Promise.all(
      localIndexes.map(async i => {
        const result = await uploadOneListingImage(images[i], userId);
        uploadedPaths.push(result.path);
        slots[i] = result.publicUrl;
      }),
    );
  } catch (err) {
    await removeListingBlobs(uploadedPaths);
    throw err;
  }

  return { urls: slots as string[], uploadedPaths };
}

/**
 * Saves an edited listing: uploads any newly-added local images in parallel,
 * writes the patch + status (and bumps `published_at` when publishing), then
 * removes any storage blobs the seller dropped from the photo list so the
 * bucket doesn't accumulate orphans.
 *
 * If the row update fails after uploads succeeded, the new uploads are best-
 * effort removed so a retry doesn't multiply orphans. The post-update cleanup
 * of dropped photos is also best-effort — its failure doesn't roll the row
 * change back, since by that point the listing is already saved.
 *
 * Invalidates `listings.all`, `myListings.all`, and `home.all` on success.
 */
export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      userId,
      patch,
      images,
      previousImages,
      newStatus,
    }: UpdateListingArgs) => {
      const { urls: imageUrls, uploadedPaths } = await uploadListingImages(images, userId);

      const { error } = await supabase
        .from('listings')
        .update({
          ...patch,
          images: imageUrls,
          status: newStatus,
          ...(newStatus === 'available' ? { published_at: new Date().toISOString() } : {}),
        })
        .eq('id', listingId);
      if (error) {
        await removeListingBlobs(uploadedPaths);
        throw error;
      }

      // Remove blobs for images the seller dropped from the photo list. Diff
      // is on the final ordered URL list; anything in previousImages not in
      // imageUrls is no longer referenced by this listing.
      const finalUrlSet = new Set(imageUrls);
      const droppedPaths = previousImages
        .filter(url => !finalUrlSet.has(url))
        .map(url => extractStoragePath(url, 'listings'))
        .filter((p): p is string => p !== null);
      await removeListingBlobs(droppedPaths);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      // Edits / publishing affect Suggested / New arrivals on home.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

type UpdateListingStatusArgs =
  | { listingId: string; status: 'sold' }
  | { listingId: string; status: 'available' };

/**
 * Status-only flip from the listing detail screen (seller-side).
 *   draft     → available  ("Publish")
 *   available → sold        ("Mark as sold")
 * The sold branch also stamps `sold_at`.
 *
 * Kept separate from useUpdateListing because that hook requires a heavy
 * patch (title, description, price, etc.) and runs an image-upload step.
 *
 * Invalidates listings.all (browse / search / detail caches), myListings.all
 * (the seller's Selling and Drafts tabs), and home.all (Suggested / New
 * arrivals).
 */
export function useUpdateListingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: UpdateListingStatusArgs) => {
      const patch = args.status === 'sold'
        ? { status: 'sold', sold_at: new Date().toISOString() }
        : { status: 'available' };
      const { error } = await supabase
        .from('listings')
        .update(patch)
        .eq('id', args.listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface DuplicateListingArgs {
  sellerId: string;
  source: {
    title: string;
    description: string | null;
    price: number;
    category: string;
    condition: string;
    size: string | null;
    occasion: string | null;
    measurements: { note?: string; chest?: string; waist?: string; length?: string } | null;
    images: string[] | null;
    worn_at: string | null;
  };
}

// Copy each source image to a fresh path under the new seller's folder so the
// duplicate doesn't share storage objects with the source. If the source ever
// gets deleted, useDeleteListing.remove(...) won't take the duplicate's images
// down with it. Non-Supabase URLs (shouldn't happen for our listings, but be
// safe) pass through unchanged.
async function copyListingImages(sourceUrls: string[], sellerId: string): Promise<string[]> {
  const result: string[] = [];
  for (const url of sourceUrls) {
    const srcPath = extractStoragePath(url, 'listings');
    if (!srcPath) {
      result.push(url);
      continue;
    }
    const destPath = `${sellerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabase.storage.from('listings').copy(srcPath, destPath);
    if (error) throw new Error(`Failed to copy photo: ${error.message}`);
    const { data } = supabase.storage.from('listings').getPublicUrl(destPath);
    result.push(data.publicUrl);
  }
  return result;
}

/**
 * Inserts a new draft listing seeded from the source listing's fields.
 * Returns the new listing id so the caller can navigate to its edit screen.
 * Source images are copied to fresh storage paths so the duplicate is
 * independent — deleting the source listing won't 404 the duplicate's photos.
 * Invalidates myListings.all so the new draft appears in the Drafts tab.
 */
export function useDuplicateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sellerId, source }: DuplicateListingArgs): Promise<string> => {
      const copiedImages = source.images?.length
        ? await copyListingImages(source.images, sellerId)
        : source.images;

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: sellerId,
          title: source.title,
          description: source.description,
          price: source.price,
          category: source.category,
          condition: source.condition,
          size: source.size,
          occasion: source.occasion,
          measurements: source.measurements,
          images: copiedImages,
          worn_at: source.worn_at,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data) throw new Error('Could not duplicate listing.');
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
    },
  });
}

interface ReportListingArgs {
  reporterId: string;
  listingId: string;
  sellerId: string;
  reason: string;
}

/**
 * Inserts a row into `reports`. No invalidation — the reports table isn't
 * surfaced anywhere in the user-facing app, so no cached query depends on it.
 */
export function useReportListing() {
  return useMutation({
    mutationFn: async ({ reporterId, listingId, sellerId, reason }: ReportListingArgs) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: reporterId,
        listing_id: listingId,
        seller_id: sellerId,
        reason,
      });
      if (error) throw error;
    },
  });
}

interface RecordListingViewArgs {
  listingId: string;
  userId: string;
}

/**
 * Records that a logged-in user viewed a listing. Drives the Recently viewed
 * row on home (queryKeys.home.recentlyViewed). Backed by an upsert on
 * (listing_id, user_id) so repeat views just bump `viewed_at`.
 *
 * Analytics is non-fatal — errors are logged, not thrown, so a failed write
 * never breaks the screen the user is actually trying to read.
 *
 * Invalidation is scoped to `home.recentlyViewed` (the only home query that
 * actually depends on listing_views). Browsing N listings in a minute used
 * to fire N invalidations of the entire `home.all` subtree, refetching the
 * feed + stories on every detail view.
 */
export function useRecordListingView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, userId }: RecordListingViewArgs) => {
      // Errors are intentionally swallowed — analytics shouldn't surface as
      // user-visible failures, and there's no retry value here.
      await supabase.from('listing_views').upsert(
        { listing_id: listingId, user_id: userId, viewed_at: new Date().toISOString() },
        { onConflict: 'listing_id,user_id' },
      );
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.home.recentlyViewed(userId) });
    },
  });
}

interface AssignListingCollectionArgs {
  listingId: string;
  collectionId: string | null;
}

/**
 * Assigns (or un-assigns) a listing to a Pro collection. Only invalidates
 * `myListings.all` because the collection_id field is consumed exclusively
 * by the seller's Pro dashboard — browse, search, listing detail, and home
 * don't surface it.
 */
export function useAssignListingCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, collectionId }: AssignListingCollectionArgs) => {
      const { error } = await supabase
        .from('listings')
        .update({ collection_id: collectionId })
        .eq('id', listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
    },
  });
}

interface BulkUpdatePricesArgs {
  // One entry per listing whose price actually changed. The hook recomputes
  // isPriceDrop server-side from currentPrice → newPrice so the price-drop
  // badge fields (`original_price`, `price_dropped_at`) stay in lockstep with
  // the price write.
  updates: {
    listingId: string;
    currentPrice: number;
    newPrice: number;
  }[];
}

// Thrown when at least one row in a bulk price update failed but others
// succeeded. Carries counts so the caller can render a "X of N updated" toast
// instead of all-or-nothing — important because Promise.all would short-circuit
// on the first reject while leaving the other in-flight writes to land
// silently in the background.
export class BulkUpdatePartialFailureError extends Error {
  constructor(
    public readonly succeededCount: number,
    public readonly failedCount: number,
    public readonly total: number,
  ) {
    super(`Updated ${succeededCount} of ${total} listings`);
    this.name = 'BulkUpdatePartialFailureError';
  }
}

/**
 * Bulk price update from the Pro BulkEditSheet. Runs N independent updates
 * in parallel (`Promise.allSettled`), one per listing, so each row's price-
 * drop fields can diverge based on its own old vs new price. allSettled (vs
 * the previous `Promise.all`) means an early failure doesn't short-circuit
 * the others, so the user sees an accurate partial-success count instead of
 * "all failed" while half the prices already changed in the background.
 *
 * For drops, sets `original_price` to the previous price and stamps
 * `price_dropped_at = now` so cards can render the strikethrough + "Reduced"
 * badge. For increases or restores, clears both fields.
 *
 * If every update succeeds, resolves normally. If at least one failed, throws
 * `BulkUpdatePartialFailureError` carrying the counts so callers can show a
 * specific toast (and the cache is still invalidated to reflect partial
 * progress).
 *
 * Invalidates myListings.all (seller's Selling tab), listings.all (browse +
 * search caches show prices, including price-asc/desc sort variants), and
 * home.all (Suggested / New arrivals price tags).
 */
export function useBulkUpdatePrices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updates }: BulkUpdatePricesArgs) => {
      const now = new Date().toISOString();
      const results = await Promise.allSettled(
        updates.map(async ({ listingId, currentPrice, newPrice }) => {
          const isPriceDrop = newPrice < currentPrice;
          const patch = isPriceDrop
            ? { price: newPrice, original_price: currentPrice, price_dropped_at: now }
            : { price: newPrice, original_price: null, price_dropped_at: null };
          const { error } = await supabase
            .from('listings')
            .update(patch)
            .eq('id', listingId);
          if (error) throw error;
        }),
      );
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        throw new BulkUpdatePartialFailureError(
          results.length - failedCount,
          failedCount,
          results.length,
        );
      }
    },
    onSettled: () => {
      // Use onSettled (not onSuccess) so partial-failure paths still refresh
      // caches — some rows did update and the UI should reflect that.
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

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
