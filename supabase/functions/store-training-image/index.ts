/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import { validateSubmission } from './_lib.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'dukanoh-fit-training';

// Stores a Dukanoh Fit photo plus the labels the member confirmed as one
// garment_labels row (source 'fit'). By design the row carries no member id
// and no reference to the recognition_events log — the engine's guess is
// copied in as plain values — so a stored photo can never be traced to an
// account. Photos with a person in frame are refused.
//
// Always answers 200 { stored, reason? }: this is best-effort background
// work and must never surface to the member.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const reply = (body: object) => new Response(
    JSON.stringify(body),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
  const notStored = (reason: string) => reply({ stored: false, reason });

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return notStored('unauthorized');

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return notStored('unauthorized');

  // ── Body ──────────────────────────────────────────────────────────────────────
  try {
    const submission = validateSubmission(await req.json());
    if (!submission.ok) return notStored(submission.reason);
    const { imageBase64, row } = submission;

    // ── Upload to S3 ─────────────────────────────────────────────────────────────
    const region = Deno.env.get('AWS_REGION');
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    if (!region || !accessKeyId || !secretAccessKey) return notStored('misconfigured');

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 's3' });

    const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
    const s3Key = `${row.category}/${crypto.randomUUID()}.jpg`;

    const s3Res = await aws.fetch(
      `https://${BUCKET}.s3.${region}.amazonaws.com/${s3Key}`,
      { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: imageBytes }
    );

    if (!s3Res.ok) {
       
      console.error('S3 upload failed:', s3Res.status);
      return notStored('upload_failed');
    }

    // ── Record the labelled photo ───────────────────────────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { error } = await admin
      .from('garment_labels')
      .insert({ ...row, image_url: `s3://${BUCKET}/${s3Key}` });
    if (error) {
       
      console.error('garment_labels insert failed:', error.message);
      return notStored('record_failed');
    }

    return reply({ stored: true });

  } catch (err) {
     
    console.error('store-training-image error:', (err as Error).message);
    return notStored('error');
  }
});
