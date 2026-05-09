// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabase';
import { queryKeys } from '../queryKeys';

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
