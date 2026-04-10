/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// ─── Pure logic ───────────────────────────────────────────────────────────────
// Rekognition returns a label hierarchy via `Parents`.
// A label is clothing if:
//   (a) its Name is in the root set, OR
//   (b) any of its Parents has Name 'Clothing' or 'Apparel'
import { isClothingLabel, detectCategory, detectColour, RekognitionLabel } from './_lib.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // ── Body ──────────────────────────────────────────────────────────────────────
  try {
    const { imageBase64: rawBase64 } = await req.json();

    if (!rawBase64 || typeof rawBase64 !== 'string') {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate size — base64 of 1.5MB image ≈ 2M chars
    if (rawBase64.length > 2_500_000) {
      return new Response(
        JSON.stringify({ error: 'Image too large' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Strip data URL prefix if present
    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    const region = Deno.env.get('AWS_REGION')!;

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region,
      service: 'rekognition',
    });

    const response = await aws.fetch(
      `https://rekognition.${region}.amazonaws.com/`,
      {
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
      }
    );

    if (!response.ok) {
      // Log status only — not the full response body which may contain infra details
      // eslint-disable-next-line no-console
      console.error('Rekognition error status:', response.status);
      return new Response(
        JSON.stringify({ isClothing: false }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const rawLabels: RekognitionLabel[] = data.Labels ?? [];
    const labels: string[] = rawLabels.map((l: RekognitionLabel) => l.Name);
    const dominantColors = data.ImageProperties?.DominantColors ?? [];

    const isClothing = rawLabels.some(isClothingLabel);
    const detectedCategory = detectCategory(labels);
    const detectedColour = detectColour(dominantColors);

    return new Response(
      JSON.stringify({ isClothing, detectedCategory, detectedColour }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('validate-clothing error:', (err as Error).message);
    return new Response(
      JSON.stringify({ isClothing: false }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
