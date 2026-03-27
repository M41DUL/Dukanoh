import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const record = payload.record;

  if (!record?.receiver_id || !record?.content) {
    return new Response('Missing fields', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey!
  );

  // Get receiver's push tokens
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', record.receiver_id);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no tokens' }), { status: 200 });
  }

  // Get sender's username for the notification title
  const { data: sender } = await supabase
    .from('users')
    .select('username')
    .eq('id', record.sender_id)
    .single();

  const senderName = sender?.username ?? 'Someone';
  const body = formatContent(record.content);

  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    sound: 'default',
    title: `@${senderName}`,
    body,
    data: { conversation_id: record.conversation_id },
  }));

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
});

function formatContent(content: string): string {
  if (content.startsWith('__OFFER__:')) {
    return `Made an offer: \u00a3${content.slice('__OFFER__:'.length)}`;
  }
  if (content.startsWith('__OFFER_ACCEPTED__:')) {
    const parts = content.slice('__OFFER_ACCEPTED__:'.length).split(':');
    const amount = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];
    return `Accepted your offer of \u00a3${amount}`;
  }
  if (content.startsWith('__OFFER_DECLINED__:')) {
    const parts = content.slice('__OFFER_DECLINED__:'.length).split(':');
    const amount = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];
    return `Declined your offer of \u00a3${amount}`;
  }
  return content.length > 100 ? content.substring(0, 97) + '...' : content;
}
