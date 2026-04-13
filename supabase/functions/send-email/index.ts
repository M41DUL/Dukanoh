/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM = 'Dukanoh <orders@mail.dukanoh.com>';
const BASE_URL = 'https://dukanoh.com';

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!webhookSecret || !token || !timingSafeEqual(token, webhookSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const { table, record, old_record } = payload;

  if (table !== 'orders') {
    return new Response(JSON.stringify({ skipped: 'not orders table' }), { status: 200 });
  }

  if (!record?.status || record.status === old_record?.status) {
    return new Response(JSON.stringify({ skipped: 'no status change' }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  return handleOrderEmail(supabase, record, old_record);
});

// ─── Order email handler ──────────────────────────────────────

async function handleOrderEmail(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, string>,
  _old_record: Record<string, string>
) {
  const [
    { data: listing },
    { data: buyer },
    { data: seller },
    buyerAuth,
    sellerAuth,
  ] = await Promise.all([
    supabase.from('listings').select('title, images').eq('id', record.listing_id).single(),
    supabase.from('users').select('full_name').eq('id', record.buyer_id).single(),
    supabase.from('users').select('full_name').eq('id', record.seller_id).single(),
    supabase.auth.admin.getUserById(record.buyer_id),
    supabase.auth.admin.getUserById(record.seller_id),
  ]);

  const itemTitle = listing?.title ?? 'your item';
  const itemImage = listing?.images?.[0] ?? null;
  const buyerName = (buyer?.full_name ?? 'there').split(' ')[0];
  const sellerName = (seller?.full_name ?? 'there').split(' ')[0];
  const buyerEmail = buyerAuth.data.user?.email;
  const sellerEmail = sellerAuth.data.user?.email;
  const orderRef = `ORD-${record.id.slice(0, 8).toUpperCase()}`;
  const orderUrl = `${BASE_URL}/order/${record.id}`;

  const sends: Promise<void>[] = [];

  switch (record.status) {
    case 'paid': {
      const address = [
        record.delivery_address_line1,
        record.delivery_address_line2,
        record.delivery_city,
        record.delivery_postcode,
        record.delivery_country,
      ].filter(Boolean).join('\n');

      // Seller: you've made a sale
      if (sellerEmail) {
        sends.push(sendEmail({
          to: sellerEmail,
          subject: `You've made a sale — ${itemTitle}`,
          html: layout({
            heading: `You've made a sale,\n${sellerName}.`,
            subheading: `Order number: ${orderRef}`,
            ctaLabel: 'View order',
            ctaUrl: orderUrl,
            sections: [
              itemRow({ title: itemTitle, image: itemImage, meta: `Sold for £${parseFloat(record.item_price).toFixed(2)}` }),
              summaryTable('Ship to', [
                ['Address', address.replace(/\n/g, ', ')],
              ]),
              summaryTable('What happens next', [
                ['Ship within', '5 days'],
                ['Mark as shipped', 'In the app once posted'],
                ['You get paid', 'When buyer confirms receipt'],
              ]),
            ],
          }),
        }));
      }

      // Buyer: order confirmed
      if (buyerEmail) {
        sends.push(sendEmail({
          to: buyerEmail,
          subject: `Order confirmed — ${itemTitle}`,
          html: layout({
            heading: `Your order is confirmed,\n${buyerName}.`,
            subheading: `Order number: ${orderRef}`,
            ctaLabel: 'View order',
            ctaUrl: orderUrl,
            sections: [
              itemRow({ title: itemTitle, image: itemImage }),
              summaryTable('Order summary', [
                ['Item price', `£${parseFloat(record.item_price).toFixed(2)}`],
                ['Buyer protection', `£${parseFloat(record.protection_fee).toFixed(2)}`],
                ['Total paid', `£${parseFloat(record.total_paid).toFixed(2)}`],
              ]),
            ],
          }),
        }));
      }
      break;
    }

    case 'shipped': {
      if (buyerEmail) {
        const trackingRows: [string, string][] = record.tracking_number
          ? [
              ['Tracking number', record.tracking_number],
              ...(record.courier ? [['Courier', record.courier] as [string, string]] : []),
            ]
          : [];

        sends.push(sendEmail({
          to: buyerEmail,
          subject: `Your order is on its way — ${itemTitle}`,
          html: layout({
            heading: `Your order is on its way,\n${buyerName}.`,
            subheading: `Order number: ${orderRef}`,
            ctaLabel: 'View order',
            ctaUrl: orderUrl,
            sections: [
              itemRow({ title: itemTitle, image: itemImage }),
              ...(trackingRows.length > 0 ? [summaryTable('Tracking', trackingRows)] : []),
              summaryTable('What to do when it arrives', [
                ['Confirm receipt', 'Open the app and confirm delivery'],
                ['Auto-release', 'Funds release automatically after 2 days if you don\'t confirm'],
              ]),
            ],
          }),
        }));
      }
      break;
    }

    case 'completed': {
      if (sellerEmail) {
        const payout = parseFloat(record.item_price) - (parseFloat(record.item_price) * 0.05);

        sends.push(sendEmail({
          to: sellerEmail,
          subject: `Your payment is on the way — ${itemTitle}`,
          html: layout({
            heading: `Your payment is on the way,\n${sellerName}.`,
            subheading: `Order number: ${orderRef}`,
            ctaLabel: 'View wallet',
            ctaUrl: `${BASE_URL}/wallet`,
            sections: [
              itemRow({ title: itemTitle, image: itemImage, meta: `Sold for £${parseFloat(record.item_price).toFixed(2)}` }),
              summaryTable('Payout summary', [
                ['Amount', `£${payout.toFixed(2)}`],
                ['Timeline', '2–5 business days'],
              ]),
            ],
          }),
        }));
      }
      break;
    }

    case 'cancelled': {
      if (buyerEmail) {
        sends.push(sendEmail({
          to: buyerEmail,
          subject: `Order cancelled — ${itemTitle}`,
          html: layout({
            heading: `Your order has been cancelled,\n${buyerName}.`,
            subheading: `Order number: ${orderRef}`,
            ctaLabel: 'Browse Dukanoh',
            ctaUrl: BASE_URL,
            sections: [
              itemRow({ title: itemTitle, image: itemImage }),
              summaryTable('Refund details', [
                ['Amount refunded', `£${parseFloat(record.total_paid).toFixed(2)}`],
                ['Timeline', '5–10 business days'],
              ]),
            ],
          }),
        }));
      }

      if (sellerEmail) {
        sends.push(sendEmail({
          to: sellerEmail,
          subject: `Order cancelled — ${itemTitle}`,
          html: layout({
            heading: `An order has been cancelled,\n${sellerName}.`,
            subheading: `Order number: ${orderRef}`,
            ctaLabel: 'View listings',
            ctaUrl: `${BASE_URL}/listings`,
            sections: [
              itemRow({ title: itemTitle, image: itemImage }),
              summaryTable('What happens next', [
                ['Listing status', 'Reinstated and available to buy'],
              ]),
            ],
          }),
        }));
      }
      break;
    }
  }

  if (sends.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no emails for this status' }), { status: 200 });
  }

  await Promise.all(sends);
  return new Response(JSON.stringify({ sent: sends.length }), { status: 200 });
}

// ─── Resend ───────────────────────────────────────────────────

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

// ─── Template ─────────────────────────────────────────────────

interface LayoutOptions {
  heading: string;
  subheading: string;
  ctaLabel: string;
  ctaUrl: string;
  sections: string[];
}

function layout({ heading, subheading, ctaLabel, ctaUrl, sections }: LayoutOptions): string {
  const headingHtml = heading
    .split('\n')
    .map((line, i) => i === 0
      ? `<span style="display:block;">${line}</span>`
      : `<span style="display:block;color:#3735C5;">${line}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dukanoh</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:0;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

          <!-- Top bar -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #E8E8E8;text-align:center;">
              <img src="https://ewjerucqcmluovxdcdsu.supabase.co/storage/v1/object/public/listings/brand/dukanoh-logo.png" width="141" height="24" alt="Dukanoh" style="display:inline-block;border:0;">
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding:40px 40px 8px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#0D0D0D;line-height:1.3;letter-spacing:-0.5px;">${headingHtml}</h1>
            </td>
          </tr>

          <!-- Subheading -->
          <tr>
            <td style="padding:8px 40px 28px;text-align:center;">
              <p style="margin:0;font-size:14px;color:#6B6B6B;">${subheading}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#3735C5;border-radius:100px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.2px;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #E8E8E8;margin:0;"></td></tr>

          <!-- Sections -->
          ${sections.map(s => `
          <tr><td style="padding:32px 40px 0;">${s}</td></tr>
          <tr><td style="padding:32px 40px 0;"><hr style="border:none;border-top:1px solid #E8E8E8;margin:0;"></td></tr>
          `).join('')}

          <!-- Footer -->
          <tr>
            <td style="padding:28px 40px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#6B6B6B;line-height:2;">
                    <a href="${BASE_URL}/help" style="color:#6B6B6B;text-decoration:none;">Help Centre</a>
                    &nbsp;&nbsp;·&nbsp;&nbsp;
                    <a href="mailto:support@mail.dukanoh.com" style="color:#6B6B6B;text-decoration:none;">Contact Support</a>
                    &nbsp;&nbsp;·&nbsp;&nbsp;
                    <a href="${BASE_URL}/terms" style="color:#6B6B6B;text-decoration:none;">Terms &amp; Conditions</a>
                    &nbsp;&nbsp;·&nbsp;&nbsp;
                    <a href="${BASE_URL}/privacy" style="color:#6B6B6B;text-decoration:none;">Privacy Policy</a>
                    <br>
                    <span style="color:#BBBBBB;">© Dukanoh. All rights reserved.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function itemRow({ title, image, meta }: { title: string; image: string | null; meta?: string }): string {
  const imgHtml = image
    ? `<td style="width:72px;vertical-align:top;padding-right:16px;">
        <img src="${image}" width="72" height="90" style="border-radius:8px;object-fit:cover;display:block;" alt="${title}">
       </td>`
    : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;font-weight:600;color:#6B6B6B;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:16px;">Description</td>
        <td style="font-size:13px;font-weight:600;color:#6B6B6B;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:16px;text-align:right;">Detail</td>
      </tr>
      <tr>
        ${imgHtml}
        <td style="vertical-align:top;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#0D0D0D;line-height:1.4;">${title}</p>
          ${meta ? `<p style="margin:0;font-size:14px;color:#6B6B6B;">${meta}</p>` : ''}
        </td>
      </tr>
    </table>`;
}

function summaryTable(heading: string, rows: [string, string][]): string {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 0;font-size:14px;color:#6B6B6B;border-bottom:1px solid #F2F2F2;">${label}</td>
      <td style="padding:10px 0;font-size:14px;color:#0D0D0D;font-weight:500;border-bottom:1px solid #F2F2F2;text-align:right;">${value}</td>
    </tr>`).join('');

  return `
    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0D0D0D;">${heading}</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${rowsHtml}
    </table>`;
}
