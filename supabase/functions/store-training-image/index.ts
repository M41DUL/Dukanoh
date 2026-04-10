/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CAP_PER_CATEGORY = 200;
const BUCKET = 'dukanoh-fit-training';

// Valid app categories — reject anything outside this set
const VALID_CATEGORIES = new Set([
  'Lehenga', 'Saree', 'Anarkali', 'Sherwani', 'Kurta', 'Achkan',
  'Pathani Suit', 'Dupatta', 'Blouse', 'Sharara', 'Salwar', 'Nehru Jacket',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const ok = () => new Response(
    JSON.stringify({ stored: false }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return ok();

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return ok();

  // ── Body ──────────────────────────────────────────────────────────────────────
  try {
    const { imageBase64: rawBase64, category } = await req.json();

    if (!rawBase64 || typeof rawBase64 !== 'string') return ok();
    if (!category || !VALID_CATEGORIES.has(category)) return ok();
    if (rawBase64.length > 2_500_000) return ok();

    // Strip data URL prefix if present
    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    // ── Check cap ────────────────────────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { count } = await supabaseAdmin
      .from('fit_training_images')
      .select('id', { count: 'exact', head: true })
      .eq('category', category);

    if ((count ?? 0) >= CAP_PER_CATEGORY) return ok();

    // ── Upload to S3 ─────────────────────────────────────────────────────────────
    const region = Deno.env.get('AWS_REGION')!;
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region,
      service: 's3',
    });

    const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
    const s3Key = `${category}/${crypto.randomUUID()}.jpg`;

    const s3Res = await aws.fetch(
      `https://${BUCKET}.s3.${region}.amazonaws.com/${s3Key}`,
      { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: imageBytes }
    );

    if (!s3Res.ok) {
      // eslint-disable-next-line no-console
      console.error('S3 upload failed:', s3Res.status);
      return ok();
    }

    // ── Record in DB ─────────────────────────────────────────────────────────────
    await supabaseAdmin.from('fit_training_images').insert({ category, s3_key: s3Key });

    return new Response(
      JSON.stringify({ stored: true }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('store-training-image error:', (err as Error).message);
    return ok();
  }
});
