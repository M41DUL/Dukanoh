/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// ─── Pure logic ───────────────────────────────────────────────────────────────
// Suggestive is intentionally excluded — South Asian garments (sarees,
// lehengas) can show midriff and would generate false positives.
import { isBlocked, hasComplexBackground, ModerationLabel } from './_lib.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Body ──────────────────────────────────────────────────────────────────────
  try {
    const { imageBase64: rawBase64, check } = await req.json();

    if (!rawBase64 || typeof rawBase64 !== 'string') return json({ error: 'No image provided' }, 400);
    if (rawBase64.length > 2_500_000) return json({ error: 'Image too large' }, 400);
    if (check !== 'moderation' && check !== 'quality') return json({ error: 'Invalid check type' }, 400);

    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    const region = Deno.env.get('AWS_REGION')!;
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region,
      service: 'rekognition',
    });

    // ── Moderation check ──────────────────────────────────────────────────────
    if (check === 'moderation') {
      const res = await aws.fetch(`https://rekognition.${region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'RekognitionService.DetectModerationLabels',
        },
        body: JSON.stringify({
          Image: { Bytes: imageBase64 },
          MinConfidence: 70,
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('Rekognition moderation error:', res.status);
        // Fail open — don't block the seller if Rekognition is unavailable
        return json({ blocked: false });
      }

      const data = await res.json();
      const labels: ModerationLabel[] = data.ModerationLabels ?? [];
      const blocked = labels.some(isBlocked);
      return json({ blocked });
    }

    // ── Quality check ─────────────────────────────────────────────────────────
    const res = await aws.fetch(`https://rekognition.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'RekognitionService.DetectLabels',
      },
      body: JSON.stringify({
        Image: { Bytes: imageBase64 },
        MaxLabels: 50,
        MinConfidence: 60,
        Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
      }),
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('Rekognition quality error:', res.status);
      return json({ warnings: [] });
    }

    const data = await res.json();
    const quality = data.ImageProperties?.Quality ?? {};
    const labels: { Name: string; Confidence: number }[] = data.Labels ?? [];

    const warnings: string[] = [];

    if (typeof quality.Brightness === 'number' && quality.Brightness < 30) {
      warnings.push('Your cover photo looks a bit dark — better-lit photos help buyers see the details.');
    }
    if (typeof quality.Sharpness === 'number' && quality.Sharpness < 35) {
      warnings.push('Your cover photo looks blurry — try holding your phone steady or retaking it.');
    }
    if (hasComplexBackground(labels)) {
      warnings.push('A plain background helps buyers focus on the item.');
    }

    return json({ warnings });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('analyse-listing-image error:', (err as Error).message);
    // Fail open on unexpected errors
    return json({ blocked: false, warnings: [] });
  }
});
