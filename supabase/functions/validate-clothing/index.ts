/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import {
  detectCategory,
  detectColour,
  isClothingLabel,
  type RekognitionLabel,
} from './_lib.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Handler ──────────────────────────────────────────────────────────────────
//
// Response contract:
//   200 { isClothing, detectedCategory, detectedColour }  — a verdict
//   400 { error }                                         — bad input
//   401 { error }                                         — no / invalid JWT
//   500 { error: 'Server misconfigured' }                 — AWS secrets missing
//   503 { error: 'validation_unavailable' }               — Rekognition failed
//
// A 503 is not a verdict on the photo. Clients must not read it as "not
// clothing": Dukanoh Fit tells the member the check couldn't run; the sell
// form fails open.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  try {
    const { imageBase64: rawBase64 } = await req.json();

    if (!rawBase64 || typeof rawBase64 !== 'string') return json({ error: 'No image provided' }, 400);
    if (rawBase64.length > 2_500_000) return json({ error: 'Image too large' }, 400);

    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    const region = Deno.env.get('AWS_REGION');
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    if (!region || !accessKeyId || !secretAccessKey) return json({ error: 'Server misconfigured' }, 500);

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region,
      service: 'rekognition',
    });

    const response = await aws.fetch(`https://rekognition.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'RekognitionService.DetectLabels',
      },
      body: JSON.stringify({
        Image: { Bytes: imageBase64 },
        MaxLabels: 30,
        MinConfidence: 60,
        Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
      }),
    });

    if (!response.ok) {
       
      console.error('Rekognition error status:', response.status);
      return json({ error: 'validation_unavailable' }, 503);
    }

    const data = await response.json();
    const rawLabels: RekognitionLabel[] = data.Labels ?? [];
    const labels = rawLabels.map(l => l.Name);
    const dominantColors = data.ImageProperties?.DominantColors ?? [];

    return json({
      isClothing: rawLabels.some(isClothingLabel),
      detectedCategory: detectCategory(labels),
      detectedColour: detectColour(dominantColors),
    });

  } catch (err) {
     
    console.error('validate-clothing error:', (err as Error).message);
    return json({ error: 'validation_unavailable' }, 503);
  }
});
