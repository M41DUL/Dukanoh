import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  return sendPush(messages);
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

  return sendPush(messages);
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

async function sendPush(messages: object[]) {
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
