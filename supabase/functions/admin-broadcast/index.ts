/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import { sendExpoPush } from '../_shared/expoPush.ts';

// Sends a marketing push notification to a filtered cohort of users.
// Auth: verify_jwt is false at the gateway (see project memory); we
// manually verify the caller's JWT and check admin status. The actual
// query + Expo send uses the service-role client to bypass RLS.

interface BroadcastBody {
  title?: string;
  body?: string;
  deep_link_destination?: string | null;
  deep_link_listing_id?: string | null;
  audience_role?: 'buyers' | 'sellers' | null;
  audience_tier?: 'free' | 'pro' | 'founder' | null;
  audience_active_days?: number | null;
}

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function destinationToRoute(dest: string | null | undefined, listingId: string | null | undefined): string | undefined {
  if (!dest) return undefined;
  switch (dest) {
    case 'home':         return '/(tabs)/';
    case 'search':       return '/(tabs)/search';
    case 'sell':         return '/(tabs)/sell';
    case 'saved':        return '/saved';
    case 'listings':     return '/listings';
    case 'dukanoh-fit':  return '/dukanoh-fit';
    case 'boosts':       return '/boosts';
    case 'specific-listing':
      return listingId ? `/listing/${listingId}` : undefined;
    default:             return undefined;
  }
}

// CORS: pin to the Dukanoh web origin. This function is only called from the
// mobile app (native, no CORS), so this is defense-in-depth against browser
// callers from other origins.
const ALLOWED_ORIGINS = ['https://dukanoh.com', 'https://www.dukanoh.com'];
function corsOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin(req),
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Vary': 'Origin',
      },
    });
  }

  // ─── Admin auth ────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: setting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'admin_user_ids')
    .single();
  const adminIds: string[] = JSON.parse(setting?.value ?? '[]');
  if (!adminIds.includes(user.id)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  // ─── Payload validation ────────────────────────────────
  let payload: BroadcastBody;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const title = payload.title?.trim();
  const body = payload.body?.trim();
  if (!title || !body) {
    return jsonResponse({ error: 'title and body are required' }, 400);
  }
  if (title.length > 60) {
    return jsonResponse({ error: 'title must be 60 chars or less' }, 400);
  }
  if (body.length > 178) {
    return jsonResponse({ error: 'body must be 178 chars or less' }, 400);
  }

  // ─── Insert broadcast row in 'sending' state ───────────
  const { data: broadcast, error: insertError } = await supabase
    .from('broadcasts')
    .insert({
      title,
      body,
      deep_link_destination: payload.deep_link_destination ?? null,
      deep_link_listing_id: payload.deep_link_listing_id ?? null,
      audience_role: payload.audience_role ?? null,
      audience_tier: payload.audience_tier ?? null,
      audience_active_days: payload.audience_active_days ?? null,
      status: 'sending',
      sent_by: user.id,
    })
    .select('id')
    .single();

  if (insertError || !broadcast) {
    return jsonResponse({ error: insertError?.message ?? 'Could not log broadcast' }, 500);
  }

  try {
    // ─── Resolve audience -> tokens ─────────────────────
    let query = supabase
      .from('users')
      .select('id, push_tokens!inner(token)')
      .eq('marketing_push_consent', true);

    if (payload.audience_role === 'buyers')  query = query.eq('is_seller', false);
    if (payload.audience_role === 'sellers') query = query.eq('is_seller', true);
    if (payload.audience_tier)               query = query.eq('seller_tier', payload.audience_tier);
    if (payload.audience_active_days) {
      const cutoff = new Date(Date.now() - payload.audience_active_days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('last_active_at', cutoff);
    }

    const { data: rows, error: queryError } = await query;
    if (queryError) throw new Error(queryError.message);

    const tokens = new Set<string>();
    for (const row of rows ?? []) {
      const userTokens = (row as unknown as { push_tokens: { token: string }[] }).push_tokens ?? [];
      for (const t of userTokens) {
        if (t.token) tokens.add(t.token);
      }
    }

    if (tokens.size === 0) {
      await supabase
        .from('broadcasts')
        .update({ status: 'sent', recipient_count: 0, sent_at: new Date().toISOString() })
        .eq('id', broadcast.id);
      return jsonResponse({ id: broadcast.id, recipient_count: 0, accepted: 0, failed: 0 });
    }

    // ─── Build push messages ─────────────────────────────
    const route = destinationToRoute(payload.deep_link_destination, payload.deep_link_listing_id);
    const messages = Array.from(tokens).map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: route ? { route } : {},
    }));

    const { accepted, failed } = await sendExpoPush(messages, supabase);

    await supabase
      .from('broadcasts')
      .update({
        status: 'sent',
        recipient_count: accepted,
        sent_at: new Date().toISOString(),
      })
      .eq('id', broadcast.id);

    return jsonResponse({ id: broadcast.id, recipient_count: accepted, accepted, failed });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    await supabase
      .from('broadcasts')
      .update({ status: 'failed', error_message: message })
      .eq('id', broadcast.id);
    return jsonResponse({ error: message }, 500);
  }
});
