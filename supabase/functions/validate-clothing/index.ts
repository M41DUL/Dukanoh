/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import {
  categoryConfidence,
  detectCategory,
  detectColour,
  detectHasPerson,
  ENGINE,
  ENGINE_VERSION,
  isClothingLabel,
  type RekognitionLabel,
} from './_lib.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── The recognition contract ─────────────────────────────────────────────────
//
// Every caller (Dukanoh Fit, the sell form) depends on this shape and nothing
// else. Engines sit behind it; the active one is
// platform_settings.recognition_engine.
//
// Request:  { imageBase64, source?: 'fit' | 'sell' }
// Response:
//   200 { isClothing, detectedCategory, detectedColour,
//         engine, engineVersion, confidence, hasPerson }  — a verdict
//   400 { error }                                         — bad input
//   401 { error }                                         — no / invalid JWT
//   500 { error: 'Server misconfigured' }                 — engine secrets missing
//   503 { error: 'validation_unavailable' }               — engine failed
//
// A 503 is not a verdict on the photo. Clients must not read it as "not
// clothing": Dukanoh Fit tells the member the check couldn't run; the sell
// form fails open.
//
// Every call is logged to recognition_events — no image, and nothing in any
// stored photo points back at the log — so engines can be scored against the
// labels members confirm.

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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Prediction log — fire-and-forget, never affects the answer.
  const logEvent = (row: Record<string, unknown>) => {
    admin.from('recognition_events').insert(row).then(() => {}, () => {});
  };

  try {
    const { imageBase64: rawBase64, source: rawSource } = await req.json();
    const source = rawSource === 'fit' ? 'fit' : 'sell';

    if (!rawBase64 || typeof rawBase64 !== 'string') return json({ error: 'No image provided' }, 400);
    if (rawBase64.length > 2_500_000) return json({ error: 'Image too large' }, 400);

    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    // The engine switch. Only Rekognition is wired today; any other value is
    // recorded on the event and Rekognition still answers, so a mis-set
    // switch degrades to today's behaviour rather than to nothing.
    const { data: setting } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'recognition_engine')
      .maybeSingle();
    const requestedEngine = setting?.value ?? ENGINE;
    const started = Date.now();

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
      logEvent({
        user_id: user.id, source, requested_engine: requestedEngine,
        engine: ENGINE, engine_version: ENGINE_VERSION, outcome: 'unavailable',
        latency_ms: Date.now() - started,
      });
      return json({ error: 'validation_unavailable' }, 503);
    }

    const data = await response.json();
    const rawLabels: RekognitionLabel[] = data.Labels ?? [];
    const labels = rawLabels.map(l => l.Name);
    const dominantColors = data.ImageProperties?.DominantColors ?? [];

    const isClothing = rawLabels.some(isClothingLabel);
    const detectedCategory = detectCategory(labels);
    const detectedColour = detectColour(dominantColors);
    const confidence = categoryConfidence(rawLabels, detectedCategory);
    const hasPerson = detectHasPerson(labels);

    logEvent({
      user_id: user.id, source, requested_engine: requestedEngine,
      engine: ENGINE, engine_version: ENGINE_VERSION, outcome: 'ok',
      is_clothing: isClothing, category: detectedCategory, colour: detectedColour,
      confidence, has_person: hasPerson, latency_ms: Date.now() - started,
    });

    return json({
      isClothing,
      detectedCategory,
      detectedColour,
      engine: ENGINE,
      engineVersion: ENGINE_VERSION,
      confidence,
      hasPerson,
    });

  } catch (err) {
    console.error('validate-clothing error:', (err as Error).message);
    return json({ error: 'validation_unavailable' }, 503);
  }
});
