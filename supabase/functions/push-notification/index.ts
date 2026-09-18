/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import { sendExpoPush } from '../_shared/expoPush.ts';

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
  // Two callers are allowed:
  //  • Database webhooks — Authorization: Bearer <WEBHOOK_SECRET>
  //  • pg_cron jobs (remind_auto_release_orders) — x-dukanoh-key: <INTERNAL_API_KEY>,
  //    the same header/secret the auto-cancel cron uses.
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const internalKey = Deno.env.get('INTERNAL_API_KEY');
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const providedKey = req.headers.get('x-dukanoh-key');

  const viaWebhook = !!webhookSecret && !!token && timingSafeEqual(token, webhookSecret);
  const viaInternal = !!internalKey && !!providedKey && timingSafeEqual(providedKey, internalKey);
  if (!viaWebhook && !viaInternal) {
    return new Response('Unauthorized', { status: 401 });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const payload = await req.json();
  const { type, table, record, old_record } = payload;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey ?? ''
  );

  // Cron-originated: the buyer's 'shipped' order completes in ~24h.
  if (table === 'orders' && type === 'AUTO_RELEASE_REMINDER') {
    return handleAutoReleaseReminder(supabase, record);
  }

  // From recompute_seller_standing(): a seller reached 3 strikes (warning) or
  // 5 strikes / an admin pause (selling paused). Terms clause 4.7.
  if (table === 'users' && (type === 'STRIKE_WARNING' || type === 'SELLING_PAUSED')) {
    return handleSellerStanding(supabase, type, record);
  }

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

// ─── Auto-release reminder ────────────────────────────────────
// Sent by the remind-auto-release-orders cron ~24h before a 'shipped' order
// completes on its own (Terms clause 5: "We will send you a reminder before this
// happens"). Buyer only. The cron stamps auto_release_reminder_sent_at before
// calling, so a retry never double-sends.

async function handleAutoReleaseReminder(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, string>
) {
  if (!record?.buyer_id || record.status !== 'shipped') {
    return new Response(JSON.stringify({ skipped: 'not a shipped order' }), { status: 200 });
  }

  const tokens = await getTokens(supabase, record.buyer_id);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('title')
    .eq('id', record.listing_id)
    .single();
  const itemTitle = listing?.title ?? 'your order';

  const messages = tokens.map(t => ({
    to: t,
    sound: 'default',
    title: 'Your order completes tomorrow',
    body: `Has ${itemTitle} arrived? Tap "Item received", or report an issue if something's wrong.`,
    data: { order_id: record.id },
  }));

  return sendPush(messages, supabase);
}

// ─── Seller standing (strikes) ────────────────────────────────

async function handleSellerStanding(
  supabase: ReturnType<typeof createClient>,
  type: string,
  record: Record<string, string | number>
) {
  const sellerId = String(record?.id ?? '');
  const tokens = await getTokens(supabase, sellerId);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  const strikes = Number(record?.strike_count ?? 0);
  const paused = type === 'SELLING_PAUSED';
  const messages = tokens.map(t => ({
    to: t,
    sound: 'default',
    title: paused ? 'Selling paused' : 'Cancellation warning',
    body: paused
      ? `After ${strikes} cancelled orders in 12 months, your listings are hidden and new sales are paused. Request a review from your profile.`
      : `You've cancelled ${strikes} orders in the last 12 months. At 5, selling is paused. Dispatch on time to keep your record clean.`,
    data: { type: paused ? 'selling_paused' : 'strike_warning' },
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
      // Notify seller. An unverified seller can still ship, but their money is
      // held on the platform until they verify — so nudge them to verify.
      const sellerVerified = await isSellerVerified(supabase, record.seller_id);
      const tokens = await getTokens(supabase, record.seller_id);
      tokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Item sold!',
        body: sellerVerified
          ? `${itemTitle} has been purchased. Ship it to the buyer.`
          : `${itemTitle} has been purchased. Verify your account to get paid.`,
        data: { order_id: record.id },
      }));
      break;
    }
    case 'shipped': {
      // Notify buyer
      const tokens = await getTokens(supabase, record.buyer_id);
      const shippedBody = record.tracking_number
        ? `${itemTitle} is on its way. Tracking: ${record.tracking_number}`
        : `${itemTitle} is on its way to you.`;
      tokens.forEach(t => messages.push({
        to: t,
        sound: 'default',
        title: 'Order shipped!',
        body: shippedBody,
        data: { order_id: record.id },
      }));
      break;
    }
    case 'completed': {
      // Notify both
      const [buyerTokens, sellerTokens, sellerVerified] = await Promise.all([
        getTokens(supabase, record.buyer_id),
        getTokens(supabase, record.seller_id),
        isSellerVerified(supabase, record.seller_id),
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
        // Verified: money is settled and withdrawable. Unverified: it's earned
        // but locked until they verify, so frame it as a verify prompt.
        title: sellerVerified ? 'Payment released!' : 'You’ve earned money!',
        body: sellerVerified
          ? `Payment for ${itemTitle} has been added to your wallet.`
          : `Your ${itemTitle} earnings are waiting. Verify your account to withdraw.`,
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
      // Skip abandoned-checkout cleanup: a 'pending' reservation that never got
      // paid (released by cancel-stale-pending-orders) was never a real order to
      // the buyer/seller — notifying "Order cancelled" is alarming and confusing.
      // Only notify when a genuine, charged order is cancelled.
      if (old_record?.status === 'pending') {
        return new Response(JSON.stringify({ skipped: 'stale pending reservation released' }), { status: 200 });
      }
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
  const tokens = await getTokens(supabase, listing.seller_id, { activity: true });

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
  const tokens = await getTokens(supabase, record.seller_id, { activity: true });

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
  if (!record?.price || !old_record?.price) {
    return new Response(JSON.stringify({ skipped: 'no price data' }), { status: 200 });
  }
  if (parseFloat(record.price) >= parseFloat(old_record.price)) {
    return new Response(JSON.stringify({ skipped: 'not a price drop' }), { status: 200 });
  }
  if (record.status !== 'available') {
    return new Response(JSON.stringify({ skipped: 'listing not available' }), { status: 200 });
  }

  const newPrice = parseFloat(record.price);
  const listingTitle = record.title ?? 'A saved item';
  const THRESHOLD = 0.10; // 10% minimum drop

  // Fetch savers with their individual price_at_save
  const { data: savers } = await supabase
    .from('saved_items')
    .select('user_id, price_at_save')
    .eq('listing_id', record.id)
    .not('price_at_save', 'is', null);

  if (!savers || savers.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no savers' }), { status: 200 });
  }

  const notificationInserts: object[] = [];
  const eligibleSavers: { user_id: string; body: string }[] = [];

  for (const saver of savers as { user_id: string; price_at_save: number }[]) {
    const pctDrop = (saver.price_at_save - newPrice) / saver.price_at_save;

    // Only notify if drop is at least 10% relative to what this user saved it at
    if (pctDrop < THRESHOLD) continue;

    const savingPct = Math.round(pctDrop * 100);
    const body = `${listingTitle} dropped ${savingPct}% to £${newPrice.toFixed(2)}`;

    eligibleSavers.push({ user_id: saver.user_id, body });
    notificationInserts.push({
      user_id: saver.user_id,
      type: 'price_drop',
      title: 'Price drop on a saved item',
      body,
      listing_id: record.id,
    });
  }

  // Write in-app notifications (service role bypasses RLS)
  if (notificationInserts.length > 0) {
    await supabase.from('notifications').insert(notificationInserts);
  }

  if (eligibleSavers.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no eligible savers after threshold' }), { status: 200 });
  }

  // Activity group: drop savers who switched it off at Settings → Notifications.
  const { data: optedOut } = await supabase
    .from('users')
    .select('id')
    .in('id', eligibleSavers.map(s => s.user_id))
    .eq('activity_push_enabled', false);
  const optedOutIds = new Set(((optedOut ?? []) as { id: string }[]).map(u => u.id));
  const notifySavers = eligibleSavers.filter(s => !optedOutIds.has(s.user_id));
  if (notifySavers.length === 0) {
    return new Response(JSON.stringify({ skipped: 'all eligible savers opted out of activity pushes' }), { status: 200 });
  }

  // Batch-fetch all push tokens in one query — avoids N+1 (one query per saver)
  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', notifySavers.map(s => s.user_id));

  const tokensByUser = new Map<string, string[]>();
  for (const row of (tokenRows ?? []) as { user_id: string; token: string }[]) {
    const existing = tokensByUser.get(row.user_id) ?? [];
    existing.push(row.token);
    tokensByUser.set(row.user_id, existing);
  }

  const messages: object[] = [];
  for (const saver of notifySavers) {
    (tokensByUser.get(saver.user_id) ?? []).forEach(t => messages.push({
      to: t,
      sound: 'default',
      title: 'Price drop on a saved item',
      body: saver.body,
      data: { listing_id: record.id },
    }));
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no push tokens for eligible savers' }), { status: 200 });
  }

  return sendPush(messages, supabase);
}

// ─── Helpers ──────────────────────────────────────────────────

// `activity: true` marks the notification as part of the Activity group
// (saves, reviews, price drops on saved pieces), which members can switch off
// at Settings → Notifications. Orders, messages and standing notices ignore it.
async function getTokens(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  opts?: { activity?: boolean }
): Promise<string[]> {
  if (!userId) return [];
  if (opts?.activity) {
    const { data: prefs } = await supabase
      .from('users')
      .select('activity_push_enabled')
      .eq('id', userId)
      .maybeSingle();
    if (prefs && prefs.activity_push_enabled === false) return [];
  }
  const { data } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);
  return data?.map((r: { token: string }) => r.token) ?? [];
}

// True once the seller has completed Stripe Connect onboarding (can receive
// payouts). Used to tailor order notifications for unverified sellers, whose
// earnings are held until they verify.
async function isSellerVerified(supabase: ReturnType<typeof createClient>, sellerId: string): Promise<boolean> {
  if (!sellerId) return false;
  const { data } = await supabase
    .from('user_private')
    .select('stripe_onboarding_complete')
    .eq('user_id', sellerId)
    .maybeSingle();
  return data?.stripe_onboarding_complete === true;
}

async function sendPush(messages: object[], supabase: ReturnType<typeof createClient>) {
  const { tickets } = await sendExpoPush(messages, supabase);
  return new Response(JSON.stringify({ data: tickets }), { status: 200 });
}

function formatMessageContent(content: string): string {
  // Legacy bidding messages (feature removed) — show a neutral preview instead
  // of the raw protocol string.
  if (
    content.startsWith('__OFFER__:') ||
    content.startsWith('__OFFER_ACCEPTED__:') ||
    content.startsWith('__OFFER_DECLINED__:')
  ) {
    return 'New message';
  }
  return content.length > 100 ? content.substring(0, 97) + '...' : content;
}
