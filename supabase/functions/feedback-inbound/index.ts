/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Receives Resend Inbound webhooks. Resend (via Svix) signs every webhook
// with HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`, base64-encoded
// in the `svix-signature` header. We verify, then thread the email back to
// its feedback row via the +tag in the To address.

// Returning 4xx tells Svix the message is bad and to stop retrying.
// Returning 5xx tells it to retry. Be careful which we use where.

interface ResendAddress {
  name?: string;
  email: string;
}

interface ResendInboundPayload {
  type?: string;
  data?: {
    from?: ResendAddress | string;
    to?: (ResendAddress | string)[] | ResendAddress | string;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
  };
}

// ─── Svix signature verification ────────────────────────────────────────────

async function verifySvixSignature(
  body: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const svixId        = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Timestamp tolerance: reject if older than 5 minutes (replay protection).
  const ts = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const drift = Math.abs(Date.now() / 1000 - ts);
  if (drift > 300) return false;

  // Strip optional `whsec_` prefix on the secret.
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(rawSecret), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const message = `${svixId}.${svixTimestamp}.${body}`;
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // Header can carry multiple versions: "v1,base64sig v1,base64sig2"
  for (const part of svixSignature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version === 'v1' && timingSafeEqualB64(sig, expected)) return true;
  }
  return false;
}

function timingSafeEqualB64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeAddresses(
  input: (ResendAddress | string)[] | ResendAddress | string | undefined,
): { email: string; name?: string }[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(a => typeof a === 'string' ? { email: a } : { email: a.email, name: a.name });
}

// Pulls the feedback id from any +tag in the To addresses.
// Expected shape: `support+<uuid>@mail.dukanoh.com`
function extractFeedbackId(addrs: { email: string }[]): string | null {
  const uuidRe = /\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;
  for (const { email } of addrs) {
    const m = email.match(uuidRe);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// Minimal HTML → text fallback when an inbound email has no text/plain
// part. We never render the raw HTML in the admin UI: a malicious sender
// could exfiltrate the admin session via an <img src> or <script>. Plain
// text rendered with whitespace-pre-wrap is the safe default.
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    return new Response('RESEND_WEBHOOK_SECRET not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const ok = await verifySvixSignature(rawBody, req.headers, secret);
  if (!ok) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Resend names its inbound event `email.received`. Be lenient and also
  // accept anything containing "inbound" or "received" in case Resend
  // renames it later, and skip everything else so subscribing to the
  // wrong event in the dashboard doesn't insert junk rows.
  const type = payload.type ?? '';
  const isInbound = type === 'email.received' || type.includes('inbound') || type.includes('received');
  if (!isInbound) {
    return new Response(JSON.stringify({ skipped: 'not an inbound event', type }), { status: 200 });
  }

  const toAddrs   = normalizeAddresses(payload.data?.to);
  const fromAddrs = normalizeAddresses(payload.data?.from);

  const feedbackId = extractFeedbackId(toAddrs);
  if (!feedbackId) {
    // No +tag means we can't thread it — drop with 200 so Svix doesn't retry.
    return new Response(JSON.stringify({ skipped: 'no feedback id in to addresses' }), { status: 200 });
  }

  const sender = fromAddrs[0];
  if (!sender) {
    return new Response(JSON.stringify({ skipped: 'no sender' }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Confirm the feedback row exists. If not, the +tag is stale or forged —
  // drop with 200 so we don't accumulate retries.
  const { data: feedback } = await supabase
    .from('feedback')
    .select('id, status, email')
    .eq('id', feedbackId)
    .maybeSingle();

  if (!feedback) {
    return new Response(JSON.stringify({ skipped: 'feedback row not found', feedbackId }), { status: 200 });
  }

  // Forgery guard: a +tag UUID could leak via forwarded email, log
  // aggregators, etc. If it does, anyone who knows the UUID could post
  // arbitrary "inbound" replies into the thread and re-open it. Refuse to
  // process inbound mail whose sender doesn't match the original submitter.
  const originalEmail = (feedback.email as string | null)?.trim().toLowerCase();
  const senderEmail   = sender.email.trim().toLowerCase();
  if (!originalEmail || originalEmail !== senderEmail) {
    return new Response(
      JSON.stringify({ skipped: 'sender does not match feedback submitter', feedbackId }),
      { status: 200 },
    );
  }

  const now = new Date().toISOString();

  const text = payload.data?.text ?? (payload.data?.html ? htmlToText(payload.data.html) : null);

  const insertRes = await supabase.from('feedback_replies').insert({
    feedback_id:  feedbackId,
    direction:    'inbound',
    subject:      payload.data?.subject ?? null,
    body_text:    text,
    body_html:    payload.data?.html ?? null,  // kept for audit/debug; UI never renders it.
    sender_email: sender.email,
    sender_name:  sender.name ?? null,
  });

  if (insertRes.error) {
    // Real error: tell Svix to retry.
    return new Response(JSON.stringify({ error: insertRes.error.message }), { status: 500 });
  }

  // Re-open the thread so it's surfaced in the admin Open tab again.
  await supabase
    .from('feedback')
    .update({ status: 'open', last_reply_at: now })
    .eq('id', feedbackId);

  return new Response(JSON.stringify({ ok: true, feedbackId }), { status: 200 });
});
