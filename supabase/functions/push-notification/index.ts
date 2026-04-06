import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

Deno.serve(async (req) => {
  // Verify webhook secret
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!webhookSecret || !token || !timingSafeEqual(token, webhookSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const payload = await req.json();
  const { table, record, old_record } = payload;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey!
  );

  if (table === 'messages') {
    return handleMessage(supabase, record);
  }

  if (table === 'orders') {
    return handleOrder(supabase, record, old_record);
  }

  if (table === 'listings') {
    return handlePriceDrop(supabase, record, old_record);
  }

  if (table === 'conversations') {
    return handleNewEnquiry(supabase, record);
  }

  if (table === 'saved_items') {
    return handleListingSaved(supabase, record);
  }

  if (table === 'reviews') {
    return handleReview(supabase, record);
  }

  return new Response(JSON.stringify({ skipped: 'unknown table' }), { status: 200 });
});

// ─── Message notification ─────────────────────────────────────

async function handleMessage(supabase: ReturnType<typeof createClient>, record: Record<string, string>) {
  if (!record?.receiver_id || !record?.content) {
    return new Response('Missing fields', { status: 400 });
  }

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', record.receiver_id);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  const { data: sender } = await supabase
    .from('users')
    .select('username')
    .eq('id', record.sender_id)
    .single();

  const senderName = sender?.username ?? 'Someone';
  const body = formatMessageContent(record.content);

  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    sound: 'default',
    title: `@${senderName}`,
    body,
    data: { conversation_id: record.conversation_id },
  }));

  return sendPush(messages, supabase);
}

// ─── Order notification ───────────────────────────────────────

async function handleOrder(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, string>,
  old_record: Record<string, string>
) {
  if (!record?.status || record.status === old_record?.status) {
    return new Response(JSON.stringify({ skipped: 'no status change' }), { status: 200 });
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('title')
    .eq('id', record.listing_id)
    .single();

  const itemTitle = listing?.title ?? 'your item';
  const messages: object[] = [];

  switch (record.status) {
    case 'paid': {
      // Notify seller
      const tokens = await getTokens(supabase, record.seller_id);
      tokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Item sold!',
        body: `${itemTitle} has been purchased. Ship it to the buyer.`,
        data: { order_id: record.id },
      }));
      break;
    }
    case 'shipped': {
      // Notify buyer
      const tokens = await getTokens(supabase, record.buyer_id);
      tokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Order shipped!',
        body: `${itemTitle} is on its way to you.`,
        data: { order_id: record.id },
      }));
      break;
    }
    case 'completed': {
      // Notify both
      const [buyerTokens, sellerTokens] = await Promise.all([
        getTokens(supabase, record.buyer_id),
        getTokens(supabase, record.seller_id),
      ]);
      buyerTokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Order complete!',
        body: `Your ${itemTitle} order has been completed.`,
        data: { order_id: record.id },
      }));
      sellerTokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Payment released!',
        body: `Payment for ${itemTitle} has been added to your wallet.`,
        data: { order_id: record.id },
      }));
      break;
    }
    case 'disputed': {
      // Notify seller
      const tokens = await getTokens(supabase, record.seller_id);
      tokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Dispute opened',
        body: `The buyer has opened a dispute on ${itemTitle}.`,
        data: { order_id: record.id },
      }));
      break;
    }
    case 'cancelled': {
      // Notify both
      const [buyerTokens, sellerTokens] = await Promise.all([
        getTokens(supabase, record.buyer_id),
        getTokens(supabase, record.seller_id),
      ]);
      buyerTokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Order cancelled',
        body: `Your order for ${itemTitle} has been cancelled.`,
        data: { order_id: record.id },
      }));
      sellerTokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Order cancelled',
        body: `The order for ${itemTitle} has been cancelled.`,
        data: { order_id: record.id },
      }));
      break;
    }
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no recipients for status' }), { status: 200 });
  }

  return sendPush(messages, supabase);
}

// ─── New enquiry notification ─────────────────────────────────

async function handleNewEnquiry(supabase: ReturnType<typeof createClient>, record: Record<string, string>) {
  // conversations INSERT — notify seller of first message
  if (!record?.seller_id || !record?.buyer_id || !record?.listing_id) {
    return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200 });
  }

  const [{ data: buyer }, { data: listing }] = await Promise.all([
    supabase.from('users').select('username').eq('id', record.buyer_id).single(),
    supabase.from('listings').select('title').eq('id', record.listing_id).single(),
  ]);

  const buyerName = buyer?.username ?? 'Someone';
  const itemTitle = listing?.title ?? 'your listing';
  const tokens = await getTokens(supabase, record.seller_id);

  if (tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  const messages = tokens.map(t => ({
    to: t,
    sound: 'default',
    title: `New enquiry on ${itemTitle}`,
    body: `@${buyerName} sent you a message`,
    data: { conversation_id: record.id },
  }));

  return sendPush(messages, supabase);
}

// ─── Listing saved notification ───────────────────────────────

async function handleListingSaved(supabase: ReturnType<typeof createClient>, record: Record<string, string>) {
  if (!record?.listing_id || !record?.user_id) {
    return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200 });
  }

  const [{ data: listing }, { data: saver }] = await Promise.all([
    supabase.from('listings').select('title, seller_id').eq('id', record.listing_id).single(),
    supabase.from('users').select('username').eq('id', record.user_id).single(),
  ]);

  if (!listing?.seller_id) {
    return new Response(JSON.stringify({ skipped: 'no seller' }), { status: 200 });
  }

  // Don't notify if seller saves their own listing
  if (listing.seller_id === record.user_id) {
    return new Response(JSON.stringify({ skipped: 'self-save' }), { status: 200 });
  }

  const saverName = saver?.username ?? 'Someone';
  const tokens = await getTokens(supabase, listing.seller_id);

  if (tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  const messages = tokens.map(t => ({
    to: t,
    sound: 'default',
    title: `@${saverName} saved your listing`,
    body: listing.title ?? 'One of your listings was saved',
    data: { listing_id: record.listing_id },
  }));

  return sendPush(messages, supabase);
}

// ─── Review notification ──────────────────────────────────────

async function handleReview(supabase: ReturnType<typeof createClient>, record: Record<string, string>) {
  if (!record?.seller_id || !record?.reviewer_id) {
    return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200 });
  }

  const { data: reviewer } = await supabase
    .from('users').select('username').eq('id', record.reviewer_id).single();

  const reviewerName = reviewer?.username ?? 'Someone';
  const stars = '★'.repeat(parseInt(record.rating ?? '5'));
  const tokens = await getTokens(supabase, record.seller_id);

  if (tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  const messages = tokens.map(t => ({
    to: t,
    sound: 'default',
    title: `New review ${stars}`,
    body: `@${reviewerName} left you a review`,
    data: { user_id: record.seller_id },
  }));

  return sendPush(messages, supabase);
}

// ─── Price drop notification ──────────────────────────────────

async function handlePriceDrop(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, string>,
  old_record: Record<string, string>
) {
  // Only fire if price dropped and listing is still available
  if (!record?.price || !old_record?.price) {
    return new Response(JSON.stringify({ skipped: 'no price data' }), { status: 200 });
  }
  if (parseFloat(record.price) >= parseFloat(old_record.price)) {
    return new Response(JSON.stringify({ skipped: 'not a price drop' }), { status: 200 });
  }
  if (record.status !== 'available') {
    return new Response(JSON.stringify({ skipped: 'listing not available' }), { status: 200 });
  }

  // Get all users who saved this listing
  const { data: savers } = await supabase
    .from('saved_items')
    .select('user_id')
    .eq('listing_id', record.id);

  if (!savers || savers.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no savers' }), { status: 200 });
  }

  const saverIds: string[] = savers.map((s: { user_id: string }) => s.user_id);
  const title = record.title ?? 'A saved item';
  const newPrice = parseFloat(record.price).toFixed(2);
  const messages: object[] = [];

  for (const saverId of saverIds) {
    const tokens = await getTokens(supabase, saverId);
    tokens.forEach(t => messages.push({
      to: t,
      sound: 'default',
      title: 'Price drop!',
      body: `${title} is now £${newPrice}`,
      data: { listing_id: record.id },
    }));
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens for savers' }), { status: 200 });
  }

  return sendPush(messages, supabase);
}

// ─── Helpers ──────────────────────────────────────────────────

async function getTokens(supabase: ReturnType<typeof createClient>, userId: string): Promise<string[]> {
  if (!userId) return [];
  const { data } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);
  return data?.map((r: { token: string }) => r.token) ?? [];
}

async function sendPush(messages: object[], supabase: ReturnType<typeof createClient>) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  const result = await response.json();

  // Clean up stale tokens reported as DeviceNotRegistered
  const tickets: { status: string; details?: { error?: string } }[] = result.data ?? [];
  const staleTokens: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const msg = messages[i] as { to: string };
      if (msg?.to) staleTokens.push(msg.to);
    }
  });
  if (staleTokens.length > 0) {
    await supabase.from('push_tokens').delete().in('token', staleTokens);
  }

  return new Response(JSON.stringify(result), { status: 200 });
}

function formatMessageContent(content: string): string {
  if (content.startsWith('__OFFER__:')) {
    return `Made an offer: £${content.slice('__OFFER__:'.length)}`;
  }
  if (content.startsWith('__OFFER_ACCEPTED__:')) {
    const parts = content.slice('__OFFER_ACCEPTED__:'.length).split(':');
    const amount = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];
    return `Accepted your offer of £${amount}`;
  }
  if (content.startsWith('__OFFER_DECLINED__:')) {
    const parts = content.slice('__OFFER_DECLINED__:'.length).split(':');
    const amount = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];
    return `Declined your offer of £${amount}`;
  }
  return content.length > 100 ? content.substring(0, 97) + '...' : content;
}
