/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Shared Expo push sender for the transactional (push-notification) and
// marketing (admin-broadcast) functions.
//
// The important behaviour: Expo returns a *ticket* the moment it accepts a
// message, before it has spoken to FCM/APNs. Delivery failures —
// DeviceNotRegistered above all — only surface later in the *receipt*. A sender
// that trusts tickets alone treats a dead token as a success and never removes
// it, which is how an Android token here kept silently swallowing every
// notification aimed at it for two months. So we read receipts too.

type SupabaseClient = ReturnType<typeof createClient>;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

const PUSH_CHUNK_SIZE = 100;      // Expo's documented per-request maximum
const RECEIPT_CHUNK_SIZE = 300;
const RECEIPT_DELAY_MS = 10_000;  // give Expo time to talk to FCM/APNs

export interface ExpoTicket {
  status: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface SendResult {
  tickets: ExpoTicket[];
  accepted: number;
  failed: number;
}

async function deleteTokens(supabase: SupabaseClient, tokens: string[], reason: string) {
  if (tokens.length === 0) return;
  const { error } = await supabase.from('push_tokens').delete().in('token', tokens);
  if (error) {
    console.error(`[push] failed to purge ${tokens.length} token(s) (${reason}): ${error.message}`);
    return;
  }
  console.log(`[push] purged ${tokens.length} token(s) (${reason})`);
}

// Second half of the send: ask Expo what actually happened to each accepted
// message. Runs after the response is returned (via waitUntil) because a calling
// DB trigger times out at 5s and receipts are not ready that quickly.
async function reconcileReceipts(receiptIdToToken: Map<string, string>, supabase: SupabaseClient) {
  await new Promise((resolve) => setTimeout(resolve, RECEIPT_DELAY_MS));

  const ids = [...receiptIdToToken.keys()];
  const stale: string[] = [];

  for (let i = 0; i < ids.length; i += RECEIPT_CHUNK_SIZE) {
    const batch = ids.slice(i, i + RECEIPT_CHUNK_SIZE);
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      });
      const json = await response.json();
      const receipts: Record<string, ExpoTicket> = json.data ?? {};

      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status !== 'error') continue;
        const token = receiptIdToToken.get(id);
        if (receipt.details?.error === 'DeviceNotRegistered' && token) {
          stale.push(token);
        } else {
          // MismatchSenderId, InvalidCredentials, MessageRateExceeded… Previously
          // discarded; these are the errors that explain an outage.
          console.error(`[push] receipt error (${receipt.details?.error ?? 'unknown'}): ${receipt.message ?? ''}`);
        }
      }
    } catch (e) {
      console.error(`[push] receipt fetch failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  await deleteTokens(supabase, stale, 'DeviceNotRegistered/receipt');
}

// Sends `messages` to Expo in chunks, purges tokens Expo rejects at the ticket
// stage, and schedules a receipt pass to purge the ones it rejects later.
// Returns per-message tickets plus accepted/failed counts.
export async function sendExpoPush(messages: object[], supabase: SupabaseClient): Promise<SendResult> {
  const tickets: ExpoTicket[] = [];
  const receiptIdToToken = new Map<string, string>();
  const staleFromTickets: string[] = [];
  let accepted = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + PUSH_CHUNK_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    const result = await response.json();
    const chunkTickets: ExpoTicket[] = result.data ?? [];

    if (!response.ok || result.errors) {
      console.error(`[push] Expo rejected a batch: ${JSON.stringify(result.errors ?? result)}`);
    }

    chunkTickets.forEach((ticket, j) => {
      const token = (chunk[j] as { to?: string })?.to;
      if (ticket.status === 'ok') {
        accepted++;
        if (ticket.id && token) receiptIdToToken.set(ticket.id, token);
      } else {
        failed++;
        if (ticket.details?.error === 'DeviceNotRegistered' && token) {
          staleFromTickets.push(token);
        } else {
          console.error(`[push] ticket error (${ticket.details?.error ?? 'unknown'}): ${ticket.message ?? ''}`);
        }
      }
    });

    tickets.push(...chunkTickets);
  }

  await deleteTokens(supabase, staleFromTickets, 'DeviceNotRegistered/ticket');

  // Keep the isolate alive for the receipt pass without blocking the caller.
  if (receiptIdToToken.size > 0) {
    EdgeRuntime.waitUntil(reconcileReceipts(receiptIdToToken, supabase));
  }

  return { tickets, accepted, failed };
}
