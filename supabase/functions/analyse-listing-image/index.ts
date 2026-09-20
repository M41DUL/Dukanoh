/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
/* eslint-enable import/no-unresolved */
import {
  CLAUDE_ENGINE,
  CLAUDE_ENGINE_VERSION,
  DEFAULT_MODEL,
  draftOpening,
  isDegenerateRecognition,
  LISTING_SCREEN_SCHEMA,
  LISTING_SCREEN_SYSTEM_PROMPT,
  modelOptions,
  MODERATION_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  normaliseListingScreen,
  normaliseModeration,
  parseJsonAnswer,
  type ListingDraft,
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
//                                         confidence, hasPerson, attributes },
//                                draft: { title, description, fabric, occasion, engineVersion } | null }
//
// The single-photo modes are what the older sell form calls, two or three
// times per photo. The listing mode is one look for the whole listing: every
// photo screened, the piece identified from the cover, and a draft of the
// listing text the form fills in for the seller to edit. Builds before the
// draft existed ignore the extra field. The model tier is
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

/**
 * One look at the whole listing. Now and then the model answers with a
 * skeleton (a category, confidence 0, nothing else); that would pre-fill a
 * guess and draft nothing, so it is retried once. `retried` is logged.
 */
async function screenListing(imagesBase64: string[], model: string): Promise<{ result: ListingScreenResult | null; retried: boolean }> {
  const first = await lookAtListing(imagesBase64, model);
  if (first && isDegenerateRecognition(first.cover)) {
    const second = await lookAtListing(imagesBase64, model);
    return { result: second ?? first, retried: true };
  }
  return { result: first, retried: false };
}

async function lookAtListing(imagesBase64: string[], model: string): Promise<ListingScreenResult | null> {
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
  // The opening line varies per request so two similar pieces from different
  // sellers do not come out as one template. It sits after the cached prompt.
  content.push({
    type: 'text',
    text: `Screen all ${imagesBase64.length} photos, identify the piece from photo 1 and write the draft. ${draftOpening(Math.floor(Math.random() * 1_000_000))}`,
  });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1800,
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

// ─── Title collision ──────────────────────────────────────────────────────────
// Two similar pieces from different sellers should not go live under the same
// title. If the drafted title already belongs to a live listing, the
// alternative title is offered instead.

type Admin = ReturnType<typeof createClient>;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => `\\${m}`);
}

async function titleIsLive(admin: Admin, title: string): Promise<boolean> {
  const { data, error } = await admin
    .from('listings')
    .select('id')
    .eq('status', 'available')
    .ilike('title', escapeLike(title))
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

async function chooseTitle(admin: Admin, draft: ListingDraft): Promise<{ title: string | null; collision: boolean }> {
  const first = draft.title ?? draft.altTitle;
  if (!first) return { title: null, collision: false };
  try {
    if (!(await titleIsLive(admin, first))) return { title: first, collision: false };
    const alt = draft.title ? draft.altTitle : null;
    if (alt && !(await titleIsLive(admin, alt))) return { title: alt, collision: true };
    return { title: first, collision: true };
  } catch {
    return { title: first, collision: false };
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
      const { result, retried } = await screenListing(raws.map(strip), model);
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
        return json({ photos: raws.map(() => ({ blocked: false, reasons: [], isClothing: true, warnings: [] })), cover: null, draft: null });
      }
      logScreen(result.photos.map((p, i) => ({
        user_id: user.id, photo_index: i, photo_count: result.photos.length, outcome: 'ok',
        blocked: p.blocked, reasons: p.reasons ?? [], warnings: p.warnings ?? [], is_clothing: p.isClothing ?? null,
        engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model,
      })));
      const c = result.cover;
      const chosen = result.draft ? await chooseTitle(admin, result.draft) : { title: null, collision: false };
      const draft = result.draft
        ? {
            title: chosen.title,
            description: result.draft.description,
            fabric: result.draft.fabric,
            occasion: result.draft.occasion,
            engineVersion: CLAUDE_ENGINE_VERSION,
          }
        : null;
      const draftOffered = !!draft && !!(draft.title || draft.description || draft.fabric || draft.occasion);
      admin.from('recognition_events').insert({
        user_id: user.id, source: 'sell', requested_engine: CLAUDE_ENGINE,
        engine: CLAUDE_ENGINE, engine_version: CLAUDE_ENGINE_VERSION, model, outcome: 'ok',
        is_clothing: c.isClothing, category: c.detectedCategory, colour: c.detectedColour,
        confidence: c.confidence, has_person: c.hasPerson,
        // No listing text is logged: only whether a draft went out, what the
        // normaliser dropped and why, and whether the title had to change.
        attributes: { ...c.attributes, retried, draft: { offered: draftOffered, dropped: result.draft?.dropped ?? [], collision: chosen.collision } },
        latency_ms: Date.now() - started,
      }).then(() => {}, () => {});
      return json({
        photos: result.photos.map(p => ({ blocked: p.blocked, reasons: p.reasons, isClothing: p.isClothing, warnings: p.warnings })),
        cover: {
          detectedCategory: c.detectedCategory, detectedColour: c.detectedColour, detectedGender: c.detectedGender,
          confidence: c.confidence, hasPerson: c.hasPerson, attributes: c.attributes,
          engine: CLAUDE_ENGINE, engineVersion: CLAUDE_ENGINE_VERSION, model,
        },
        draft,
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
