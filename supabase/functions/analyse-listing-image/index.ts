/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
/* eslint-enable import/no-unresolved */
import { hasComplexBackground, isBlocked, type ModerationLabel } from './_lib.ts';
import {
  CLAUDE_ENGINE,
  DEFAULT_MODEL,
  modelOptions,
  MODERATION_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  normaliseModeration,
  parseJsonAnswer,
  QUALITY_WARNINGS,
  type ModerationResult,
} from '../_shared/claudeRecognition.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Listing photo screening ──────────────────────────────────────────────────
//
// Request:  { imageBase64, check: 'moderation' | 'quality' }
// Response: check=moderation → { blocked, reasons }
//           check=quality    → { warnings }
//
// Same engine switch as validate-clothing (platform_settings.recognition_engine).
// With Claude, one look answers both checks; the response is trimmed to what
// the caller asked for so today's sell form keeps working unchanged.
//
// Fails open on an outage — a seller is never blocked because a service was
// down — but a refusal from the model is treated as blocked.

async function screenWithClaude(imageBase64: string, model: string): Promise<ModerationResult | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 12_000, maxRetries: 1 });
  const opts = modelOptions(model);
  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: MODERATION_SCHEMA } };
  if (opts.output_config_effort) outputConfig.effort = opts.output_config_effort;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      system: [{ type: 'text', text: MODERATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'Screen this listing photo.' },
        ],
      }],
      output_config: outputConfig,
      ...(opts.thinking ? { thinking: opts.thinking } : {}),
    } as never);
    if (response.stop_reason === 'refusal') return normaliseModeration(null, true);
    const parsed = parseJsonAnswer(response.content);
    return parsed === null ? null : normaliseModeration(parsed);
  } catch (err) {
    console.error('Claude moderation error:', (err as Error).message);
    return null;
  }
}

async function screenWithRekognition(imageBase64: string, check: 'moderation' | 'quality'): Promise<{ blocked: boolean; warnings: string[] } | null> {
  const region = Deno.env.get('AWS_REGION');
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  if (!region || !accessKeyId || !secretAccessKey) return null;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 'rekognition' });
  const call = (target: string, body: object) => aws.fetch(`https://rekognition.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `RekognitionService.${target}` },
    body: JSON.stringify(body),
  });

  if (check === 'moderation') {
    const res = await call('DetectModerationLabels', { Image: { Bytes: imageBase64 }, MinConfidence: 70 });
    if (!res.ok) { console.error('Rekognition moderation error:', res.status); return null; }
    const labels: ModerationLabel[] = (await res.json()).ModerationLabels ?? [];
    return { blocked: labels.some(isBlocked), warnings: [] };
  }

  const res = await call('DetectLabels', {
    Image: { Bytes: imageBase64 }, MaxLabels: 50, MinConfidence: 60, Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
  });
  if (!res.ok) { console.error('Rekognition quality error:', res.status); return null; }
  const data = await res.json();
  const quality = data.ImageProperties?.Quality ?? {};
  const labels: { Name: string; Confidence: number }[] = data.Labels ?? [];
  const warnings: string[] = [];
  if (typeof quality.Brightness === 'number' && quality.Brightness < 30) warnings.push(QUALITY_WARNINGS.tooDark);
  if (typeof quality.Sharpness === 'number' && quality.Sharpness < 35) warnings.push(QUALITY_WARNINGS.blurry);
  if (hasComplexBackground(labels)) warnings.push(QUALITY_WARNINGS.busyBackground);
  return { blocked: false, warnings };
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

  try {
    const { imageBase64: rawBase64, check } = await req.json();

    if (!rawBase64 || typeof rawBase64 !== 'string') return json({ error: 'No image provided' }, 400);
    if (rawBase64.length > 2_500_000) return json({ error: 'Image too large' }, 400);
    if (check !== 'moderation' && check !== 'quality') return json({ error: 'Invalid check type' }, 400);

    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: settings } = await admin
      .from('platform_settings')
      .select('key, value')
      .in('key', ['recognition_engine', 'recognition_model']);
    const setting = (key: string) => settings?.find(s => s.key === key)?.value;
    const engine = setting('recognition_engine') ?? 'rekognition';
    const model = setting('recognition_model') ?? DEFAULT_MODEL;

    if (engine === CLAUDE_ENGINE) {
      const result = await screenWithClaude(imageBase64, model);
      if (!result) return json(check === 'moderation' ? { blocked: false, reasons: [] } : { warnings: [] });
      return json(check === 'moderation'
        ? { blocked: result.blocked, reasons: result.reasons }
        : { warnings: result.warnings });
    }

    const result = await screenWithRekognition(imageBase64, check);
    if (!result) return json(check === 'moderation' ? { blocked: false, reasons: [] } : { warnings: [] });
    return json(check === 'moderation' ? { blocked: result.blocked, reasons: [] } : { warnings: result.warnings });

  } catch (err) {
    console.error('analyse-listing-image error:', (err as Error).message);
    return json({ blocked: false, reasons: [], warnings: [] });
  }
});
