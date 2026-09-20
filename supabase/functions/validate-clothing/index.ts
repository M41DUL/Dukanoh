/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
/* eslint-enable import/no-unresolved */
import {
  CLAUDE_ENGINE,
  CLAUDE_ENGINE_VERSION,
  DEFAULT_MODEL,
  isDegenerateRecognition,
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
// else. Engines sit behind it. platform_settings.recognition_engine names the
// active engine and recognition_model the Claude tier. Claude is the only
// engine wired today (AWS Rekognition was retired 2026-09-18); any other
// value is recorded on the event so a future engine can be switched in
// without changing callers, and Claude answers meanwhile.
//
// Request:  { imageBase64, source?: 'fit' | 'sell' }
// Response:
//   200 { isClothing, detectedCategory, detectedColour, detectedGender,
//         engine, engineVersion, model, confidence, hasPerson,
//         attributes: { accentColours, embellishment } }   — a verdict
//   400 { error }                                          — bad input
//   401 { error }                                          — no / invalid JWT
//   500 { error: 'Server misconfigured' }                  — API key missing
//   503 { error: 'validation_unavailable' }                — engine failed
//
// A 503 is not a verdict on the photo. Clients must not read it as "not
// clothing": Dukanoh Fit tells the member the check couldn't run; the sell
// form fails open.
//
// Every call is logged to recognition_events — no image, and nothing in any
// stored photo points back at the log — so engines can be scored against the
// labels members confirm.

type Verdict = RecognitionResult & { engine: string; engineVersion: string; model: string };
type EngineOutcome =
  | { kind: 'ok'; verdict: Verdict; outcome: 'ok' | 'refused' }
  | { kind: 'misconfigured' }
  | { kind: 'unavailable' };

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
    if (parsed === null) return { kind: 'unavailable' };
    return { kind: 'ok', outcome: 'ok', verdict: { ...normaliseRecognition(parsed), ...base } };
  } catch (err) {
    console.error('Claude recognition error:', (err as Error).message);
    return { kind: 'unavailable' };
  }
}

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

    const { data: settings } = await admin
      .from('platform_settings')
      .select('key, value')
      .in('key', ['recognition_engine', 'recognition_model']);
    const setting = (key: string) => settings?.find(s => s.key === key)?.value;
    const requestedEngine = setting('recognition_engine') ?? CLAUDE_ENGINE;
    const model = setting('recognition_model') ?? DEFAULT_MODEL;
    const started = Date.now();

    // A skeleton answer (category, confidence 0, nothing else) is retried
    // once rather than handed to the member as a verdict.
    let result = await runClaude(imageBase64, model);
    if (result.kind === 'ok' && result.outcome === 'ok' && isDegenerateRecognition(result.verdict)) {
      const again = await runClaude(imageBase64, model);
      if (again.kind === 'ok') result = again;
    }

    if (result.kind === 'misconfigured') return json({ error: 'Server misconfigured' }, 500);

    if (result.kind === 'unavailable') {
      logEvent({
        user_id: user.id, source, requested_engine: requestedEngine,
        engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model,
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
