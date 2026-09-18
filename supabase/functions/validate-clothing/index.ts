/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
/* eslint-enable import/no-unresolved */
import {
  categoryConfidence,
  detectCategory,
  detectColour,
  detectHasPerson,
  ENGINE as REKOGNITION_ENGINE,
  ENGINE_VERSION as REKOGNITION_VERSION,
  isClothingLabel,
  type RekognitionLabel,
} from './_lib.ts';
import {
  CLAUDE_ENGINE,
  CLAUDE_ENGINE_VERSION,
  DEFAULT_MODEL,
  modelOptions,
  normaliseRecognition,
  parseJsonAnswer,
  RECOGNITION_SCHEMA,
  RECOGNITION_SYSTEM_PROMPT,
  type RecognitionResult,
} from '../_shared/claudeRecognition.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── The recognition contract ─────────────────────────────────────────────────
//
// Every caller (Dukanoh Fit, the sell form) depends on this shape and nothing
// else. Engines sit behind it; the active one is
// platform_settings.recognition_engine ('claude' | 'rekognition') and, for
// Claude, platform_settings.recognition_model.
//
// Request:  { imageBase64, source?: 'fit' | 'sell' }
// Response:
//   200 { isClothing, detectedCategory, detectedColour, detectedGender,
//         engine, engineVersion, model, confidence, hasPerson,
//         attributes: { accentColours, embellishment } }   — a verdict
//   400 { error }                                          — bad input
//   401 { error }                                          — no / invalid JWT
//   500 { error: 'Server misconfigured' }                  — engine secrets missing
//   503 { error: 'validation_unavailable' }                — engine failed
//
// A 503 is not a verdict on the photo. Clients must not read it as "not
// clothing": Dukanoh Fit tells the member the check couldn't run; the sell
// form fails open.
//
// Every call is logged to recognition_events — no image, and nothing in any
// stored photo points back at the log — so engines can be scored against the
// labels members confirm.

type Verdict = RecognitionResult & { engine: string; engineVersion: string; model: string | null };
type EngineOutcome =
  | { kind: 'ok'; verdict: Verdict; outcome: 'ok' | 'refused' }
  | { kind: 'misconfigured' }
  | { kind: 'unavailable'; engine: string; engineVersion: string; model: string | null };

// ─── Engine: Claude ───────────────────────────────────────────────────────────

async function runClaude(imageBase64: string, model: string): Promise<EngineOutcome> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return { kind: 'misconfigured' };

  const client = new Anthropic({ apiKey, timeout: 12_000, maxRetries: 1 });
  const opts = modelOptions(model);
  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: RECOGNITION_SCHEMA } };
  if (opts.output_config_effort) outputConfig.effort = opts.output_config_effort;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 400,
      system: [{ type: 'text', text: RECOGNITION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'Identify this piece.' },
        ],
      }],
      output_config: outputConfig,
      ...(opts.thinking ? { thinking: opts.thinking } : {}),
    } as never);

    const base = { engine: CLAUDE_ENGINE, engineVersion: CLAUDE_ENGINE_VERSION, model: response.model ?? model };

    if (response.stop_reason === 'refusal') {
      // The model declined to look. Not clothing as far as the app is
      // concerned, and never stored.
      const empty = normaliseRecognition(null);
      return { kind: 'ok', outcome: 'refused', verdict: { ...empty, hasPerson: true, ...base } };
    }

    const parsed = parseJsonAnswer(response.content);
    if (parsed === null) return { kind: 'unavailable', ...base };
    return { kind: 'ok', outcome: 'ok', verdict: { ...normaliseRecognition(parsed), ...base } };
  } catch (err) {
    console.error('Claude recognition error:', (err as Error).message);
    return { kind: 'unavailable', engine: CLAUDE_ENGINE, engineVersion: CLAUDE_ENGINE_VERSION, model };
  }
}

// ─── Engine: Rekognition (kept until AWS is retired) ──────────────────────────

async function runRekognition(imageBase64: string): Promise<EngineOutcome> {
  const region = Deno.env.get('AWS_REGION');
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  if (!region || !accessKeyId || !secretAccessKey) return { kind: 'misconfigured' };

  const base = { engine: REKOGNITION_ENGINE, engineVersion: REKOGNITION_VERSION, model: null };
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 'rekognition' });

  const response = await aws.fetch(`https://rekognition.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'RekognitionService.DetectLabels' },
    body: JSON.stringify({
      Image: { Bytes: imageBase64 }, MaxLabels: 30, MinConfidence: 60,
      Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
    }),
  });
  if (!response.ok) {
    console.error('Rekognition error status:', response.status);
    return { kind: 'unavailable', ...base };
  }

  const data = await response.json();
  const rawLabels: RekognitionLabel[] = data.Labels ?? [];
  const labels = rawLabels.map(l => l.Name);
  const detectedCategory = detectCategory(labels);
  return {
    kind: 'ok',
    outcome: 'ok',
    verdict: {
      isClothing: rawLabels.some(isClothingLabel),
      detectedCategory,
      detectedColour: detectColour(data.ImageProperties?.DominantColors ?? []),
      detectedGender: null,
      confidence: categoryConfidence(rawLabels, detectedCategory),
      hasPerson: detectHasPerson(labels),
      attributes: { accentColours: [], embellishment: null },
      ...base,
    },
  };
}

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

    // The engine switch.
    const { data: settings } = await admin
      .from('platform_settings')
      .select('key, value')
      .in('key', ['recognition_engine', 'recognition_model']);
    const setting = (key: string) => settings?.find(s => s.key === key)?.value;
    const requestedEngine = setting('recognition_engine') ?? REKOGNITION_ENGINE;
    const model = setting('recognition_model') ?? DEFAULT_MODEL;
    const started = Date.now();

    const result = requestedEngine === CLAUDE_ENGINE
      ? await runClaude(imageBase64, model)
      : await runRekognition(imageBase64);

    if (result.kind === 'misconfigured') return json({ error: 'Server misconfigured' }, 500);

    if (result.kind === 'unavailable') {
      logEvent({
        user_id: user.id, source, requested_engine: requestedEngine,
        engine: result.engine, engine_version: result.engineVersion, model: result.model,
        outcome: 'unavailable', latency_ms: Date.now() - started,
      });
      return json({ error: 'validation_unavailable' }, 503);
    }

    const v = result.verdict;
    logEvent({
      user_id: user.id, source, requested_engine: requestedEngine,
      engine: v.engine, engine_version: v.engineVersion, model: v.model, outcome: result.outcome,
      is_clothing: v.isClothing, category: v.detectedCategory, colour: v.detectedColour,
      confidence: v.confidence, has_person: v.hasPerson, attributes: v.attributes,
      latency_ms: Date.now() - started,
    });

    return json(v);

  } catch (err) {
    console.error('validate-clothing error:', (err as Error).message);
    return json({ error: 'validation_unavailable' }, 503);
  }
});
