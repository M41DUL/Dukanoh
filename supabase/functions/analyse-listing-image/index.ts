/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
/* eslint-enable import/no-unresolved */
import {
  CLAUDE_ENGINE,
  CLAUDE_ENGINE_VERSION,
  DEFAULT_MODEL,
  LISTING_SCREEN_SCHEMA,
  LISTING_SCREEN_SYSTEM_PROMPT,
  modelOptions,
  MODERATION_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  normaliseListingScreen,
  normaliseModeration,
  parseJsonAnswer,
  type ListingScreenResult,
  type ModerationResult,
} from '../_shared/claudeRecognition.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Listing photo screening ──────────────────────────────────────────────────
//
// Request:  { imageBase64, check: 'moderation' | 'quality' }        — one photo
//           { imagesBase64: string[], check: 'listing' }              — a whole listing
// Response: check=moderation → { blocked, reasons }
//           check=quality    → { warnings }
//           check=listing    → { photos: [{ blocked, reasons, isClothing, warnings }],
//                                cover: { detectedCategory, detectedColour, detectedGender,
//                                         confidence, hasPerson, attributes } }
//
// The single-photo modes are what the older sell form calls, two or three
// times per photo. The listing mode is one look for the whole listing: every
// photo screened, the piece identified from the cover. The model tier is
// platform_settings.recognition_model. AWS Rekognition was retired 2026-09-18.
//
// Fails open on an outage — a seller is never blocked because a service was
// down — but a refusal from the model is treated as blocked.

async function screen(imageBase64: string, model: string): Promise<ModerationResult | null> {
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

const MAX_LISTING_PHOTOS = 8;

async function screenListing(imagesBase64: string[], model: string): Promise<ListingScreenResult | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const opts = modelOptions(model);
  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: LISTING_SCREEN_SCHEMA } };
  if (opts.output_config_effort) outputConfig.effort = opts.output_config_effort;
  const content = imagesBase64.flatMap((data, i) => ([
    { type: 'text', text: `Photo ${i + 1}${i === 0 ? ' (cover)' : ''}:` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
  ]));
  content.push({ type: 'text', text: `Screen all ${imagesBase64.length} photos and identify the piece from photo 1.` });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      system: [{ type: 'text', text: LISTING_SCREEN_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: outputConfig,
      ...(opts.thinking ? { thinking: opts.thinking } : {}),
    } as never);
    if (response.stop_reason === 'refusal') return normaliseListingScreen(null, imagesBase64.length, true);
    const parsed = parseJsonAnswer(response.content);
    return parsed === null ? null : normaliseListingScreen(parsed, imagesBase64.length);
  } catch (err) {
    console.error('Claude listing screen error:', (err as Error).message);
    return null;
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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const strip = (raw: string) => (raw.includes(',') ? raw.split(',')[1] : raw);

  try {
    const body = await req.json();
    const check = body.check;
    const { data: setting } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'recognition_model')
      .maybeSingle();
    const model = setting?.value ?? DEFAULT_MODEL;

    // ── Whole listing ─────────────────────────────────────────────────────────
    if (check === 'listing') {
      const raws = Array.isArray(body.imagesBase64) ? body.imagesBase64 : [];
      if (raws.length === 0 || raws.length > MAX_LISTING_PHOTOS) return json({ error: 'Send 1 to 8 images' }, 400);
      if (raws.some((r: unknown) => typeof r !== 'string' || !r)) return json({ error: 'No image provided' }, 400);
      if (raws.some((r: string) => r.length > 2_500_000)) return json({ error: 'Image too large' }, 400);
      const started = Date.now();
      const result = await screenListing(raws.map(strip), model);
      // Trust & safety log (listing_screen_events): one row per photo, including
      // the fail-open case, so the Transparency Report can count what was
      // screened and an appeal can see the original verdict.
      const logScreen = (rows: object[]) =>
        admin.from('listing_screen_events').insert(rows).then(() => {}, () => {});
      if (!result) {
        logScreen(raws.map((_r: string, i: number) => ({
          user_id: user.id, photo_index: i, photo_count: raws.length, outcome: 'unavailable',
          engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model,
        })));
        return json({ photos: raws.map(() => ({ blocked: false, reasons: [], isClothing: true, warnings: [] })), cover: null });
      }
      logScreen(result.photos.map((p, i) => ({
        user_id: user.id, photo_index: i, photo_count: result.photos.length, outcome: 'ok',
        blocked: p.blocked, reasons: p.reasons ?? [], warnings: p.warnings ?? [], is_clothing: p.isClothing ?? null,
        engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model,
      })));
      const c = result.cover;
      admin.from('recognition_events').insert({
        user_id: user.id, source: 'sell', requested_engine: CLAUDE_ENGINE,
        engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model, outcome: 'ok',
        is_clothing: c.isClothing, category: c.detectedCategory, colour: c.detectedColour,
        confidence: c.confidence, has_person: c.hasPerson, attributes: c.attributes,
        latency_ms: Date.now() - started,
      }).then(() => {}, () => {});
      return json({
        photos: result.photos.map(p => ({ blocked: p.blocked, reasons: p.reasons, isClothing: p.isClothing, warnings: p.warnings })),
        cover: {
          detectedCategory: c.detectedCategory, detectedColour: c.detectedColour, detectedGender: c.detectedGender,
          confidence: c.confidence, hasPerson: c.hasPerson, attributes: c.attributes,
          engine: CLAUDE_ENGINE, engineVersion: CLAUDE_ENGINE_VERSION, model,
        },
      });
    }

    // ── One photo (older sell form) ───────────────────────────────────────────
    const rawBase64 = body.imageBase64;
    if (!rawBase64 || typeof rawBase64 !== 'string') return json({ error: 'No image provided' }, 400);
    if (rawBase64.length > 2_500_000) return json({ error: 'Image too large' }, 400);
    if (check !== 'moderation' && check !== 'quality') return json({ error: 'Invalid check type' }, 400);

    const imageBase64 = strip(rawBase64);

    const result = await screen(imageBase64, model);
    if (check === 'moderation') {
      admin.from('listing_screen_events').insert({
        user_id: user.id, photo_index: 0, photo_count: 1, outcome: result ? 'ok' : 'unavailable',
        blocked: result?.blocked ?? false, reasons: result?.reasons ?? [], warnings: result?.warnings ?? [],
        engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model,
      }).then(() => {}, () => {});
    }
    if (!result) return json(check === 'moderation' ? { blocked: false, reasons: [] } : { warnings: [] });
    return json(check === 'moderation'
      ? { blocked: result.blocked, reasons: result.reasons }
      : { warnings: result.warnings });

  } catch (err) {
    console.error('analyse-listing-image error:', (err as Error).message);
    return json({ blocked: false, reasons: [], warnings: [] });
  }
});
