// Pure pieces of the Claude recognition engine: the prompts, the answer
// schemas, and the normalisers that turn a model answer into the contract.
// No Deno or SDK imports — every function here is unit tested in Jest.

import { CATEGORIES, CATEGORY_DEFINITIONS, COLOURS, GENDERS } from './garmentTaxonomy.ts';

export const CLAUDE_ENGINE = 'claude';
/** Bump whenever a prompt or schema below changes materially. */
export const CLAUDE_ENGINE_VERSION = 'recognise-2026-09';
export const DEFAULT_MODEL = 'claude-haiku-4-5';

// ─── Recognition ─────────────────────────────────────────────────────────────

export const RECOGNITION_SYSTEM_PROMPT = [
  'You identify South Asian clothing for Dukanoh, a UK resale app for South Asian fashion.',
  'You will be shown one photo. Answer with the JSON the schema requires and nothing else.',
  '',
  'Categories — pick exactly one, or null if the photo is not a listable item:',
  ...CATEGORIES.map(c => `- ${c}: ${CATEGORY_DEFINITIONS[c]}`),
  '',
  `Colours — pick from: ${COLOURS.join(', ')}.`,
  '"colour" is the main colour of the garment itself, ignoring the background, the floor and any person.',
  '"accent_colours" are up to two secondary colours on the piece (embroidery, borders, zari, lining). Empty if none stand out.',
  'Use "Multi" only when no single colour dominates. Use "Other" only when no listed colour fits.',
  '',
  '"is_listable" is true when the photo shows a garment, jewellery, an accessory or footwear that could be sold on the app. A person wearing it, a mannequin, a hanger or a flat-lay all count. A photo of nothing wearable is false.',
  '"gender" is Men or Women for who the piece is made for, or null if you cannot tell.',
  '"embellishment" is none (plain), light (some embroidery or print) or heavy (dense embroidery, zari, stones, sequins).',
  '"has_person" is true if any person or part of a person is visible, including a face, hands or legs.',
  '"confidence" is 0 to 1 for the category choice.',
].join('\n');

export const RECOGNITION_SCHEMA = {
  type: 'object',
  properties: {
    is_listable:    { type: 'boolean' },
    category:       { anyOf: [{ type: 'string', enum: [...CATEGORIES] }, { type: 'null' }] },
    colour:         { anyOf: [{ type: 'string', enum: [...COLOURS] }, { type: 'null' }] },
    accent_colours: { type: 'array', items: { type: 'string', enum: [...COLOURS] } },
    gender:         { anyOf: [{ type: 'string', enum: [...GENDERS] }, { type: 'null' }] },
    embellishment:  { anyOf: [{ type: 'string', enum: ['none', 'light', 'heavy'] }, { type: 'null' }] },
    has_person:     { type: 'boolean' },
    confidence:     { type: 'number' },
  },
  required: ['is_listable', 'category', 'colour', 'accent_colours', 'gender', 'embellishment', 'has_person', 'confidence'],
  additionalProperties: false,
} as const;

/** The contract validate-clothing answers with, plus the extra attributes. */
export interface RecognitionResult {
  isClothing: boolean;
  detectedCategory: string | null;
  detectedColour: string | null;
  detectedGender: string | null;
  confidence: number | null;
  hasPerson: boolean;
  attributes: {
    accentColours: string[];
    embellishment: 'none' | 'light' | 'heavy' | null;
  };
}

function oneOf(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

function clamp01(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

/**
 * Turns the model's JSON into the contract. Defensive on purpose: a value
 * outside the lists becomes null, a bad shape becomes "not listable" with no
 * category, so the caller never has to trust the model's output directly.
 */
export function normaliseRecognition(raw: unknown): RecognitionResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const accents = Array.isArray(r.accent_colours)
    ? r.accent_colours.map(c => oneOf(c, COLOURS)).filter((c): c is string => !!c).slice(0, 2)
    : [];
  const category = oneOf(r.category, CATEGORIES);
  const isListable = r.is_listable === true && category !== null;
  return {
    isClothing: isListable,
    detectedCategory: isListable ? category : null,
    detectedColour: oneOf(r.colour, COLOURS),
    detectedGender: oneOf(r.gender, GENDERS),
    confidence: isListable ? clamp01(r.confidence) : null,
    hasPerson: r.has_person === true,
    attributes: {
      accentColours: accents,
      embellishment: oneOf(r.embellishment, ['none', 'light', 'heavy']) as RecognitionResult['attributes']['embellishment'],
    },
  };
}

// ─── Moderation + quality ────────────────────────────────────────────────────

export const MODERATION_SYSTEM_PROMPT = [
  'You screen photos that sellers upload to Dukanoh, a UK resale app for South Asian fashion.',
  'You will be shown one photo. Answer with the JSON the schema requires and nothing else.',
  '',
  'Set "blocked" true only for: explicit nudity or sexual content; graphic violence or gore; weapons shown as a threat; illegal drugs; hate symbols.',
  'Do NOT block ordinary fashion photography. A visible midriff, back, shoulders or arms in a saree, lehenga, blouse or sharara is normal and allowed. A person modelling the garment is allowed. A mannequin is allowed.',
  '"reasons" lists why it was blocked; empty when not blocked.',
  '',
  'Quality, judged for a listing photo:',
  '"too_dark": the item is hard to see because the photo is underexposed.',
  '"blurry": the item is out of focus or motion-blurred.',
  '"busy_background": clutter, furniture or a messy room distracts from the item.',
  '"stock_or_watermark": this looks like a retailer\'s catalogue image, a professional stock photo, or carries a watermark or shop logo, rather than a photo the seller took of their own piece.',
  '"screenshot": this is a screenshot of a website, app or message rather than a photo.',
  '"has_person": any person or part of a person is visible.',
].join('\n');

export const MODERATION_REASONS = ['nudity', 'sexual', 'violence', 'weapons', 'drugs', 'hate', 'other'] as const;

export const MODERATION_SCHEMA = {
  type: 'object',
  properties: {
    blocked:            { type: 'boolean' },
    reasons:            { type: 'array', items: { type: 'string', enum: [...MODERATION_REASONS] } },
    too_dark:           { type: 'boolean' },
    blurry:             { type: 'boolean' },
    busy_background:    { type: 'boolean' },
    stock_or_watermark: { type: 'boolean' },
    screenshot:         { type: 'boolean' },
    has_person:         { type: 'boolean' },
  },
  required: ['blocked', 'reasons', 'too_dark', 'blurry', 'busy_background', 'stock_or_watermark', 'screenshot', 'has_person'],
  additionalProperties: false,
} as const;

export interface ModerationResult {
  blocked: boolean;
  reasons: string[];
  warnings: string[];
  flags: {
    tooDark: boolean;
    blurry: boolean;
    busyBackground: boolean;
    stockOrWatermark: boolean;
    screenshot: boolean;
    hasPerson: boolean;
  };
}

// Copy stays exactly what sellers already see today.
export const QUALITY_WARNINGS = {
  tooDark:          'Your cover photo looks a bit dark — better-lit photos help buyers see the details.',
  blurry:           'Your cover photo looks blurry — try holding your phone steady or retaking it.',
  busyBackground:   'A plain background helps buyers focus on the item.',
  stockOrWatermark: 'This looks like a catalogue or stock image — buyers trust photos of the actual piece.',
  screenshot:       'This looks like a screenshot — take a photo of the piece instead.',
} as const;

/** A refusal from the model is treated as blocked: the safe direction for a marketplace. */
export function normaliseModeration(raw: unknown, refused = false): ModerationResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const flags = {
    tooDark:          r.too_dark === true,
    blurry:           r.blurry === true,
    busyBackground:   r.busy_background === true,
    stockOrWatermark: r.stock_or_watermark === true,
    screenshot:       r.screenshot === true,
    hasPerson:        r.has_person === true,
  };
  const reasons = Array.isArray(r.reasons)
    ? r.reasons.filter((x): x is string => typeof x === 'string' && (MODERATION_REASONS as readonly string[]).includes(x))
    : [];
  const blocked = refused || r.blocked === true;
  const warnings: string[] = [];
  if (flags.tooDark) warnings.push(QUALITY_WARNINGS.tooDark);
  if (flags.blurry) warnings.push(QUALITY_WARNINGS.blurry);
  if (flags.busyBackground) warnings.push(QUALITY_WARNINGS.busyBackground);
  if (flags.stockOrWatermark) warnings.push(QUALITY_WARNINGS.stockOrWatermark);
  if (flags.screenshot) warnings.push(QUALITY_WARNINGS.screenshot);
  return { blocked, reasons: refused && reasons.length === 0 ? ['other'] : reasons, warnings, flags };
}

// ─── Request shaping ─────────────────────────────────────────────────────────

/**
 * Per-model request options. Haiku 4.5 takes neither adaptive thinking nor
 * effort; the current Sonnet / Opus generation runs adaptive thinking by
 * default, which is wasted on a classification, so it is pinned low.
 */
export function modelOptions(model: string): Record<string, unknown> {
  if (model.startsWith('claude-haiku')) return {};
  return { thinking: { type: 'adaptive' }, output_config_effort: 'low' };
}

/** Pulls the first text block out of a Messages API response and parses it. */
export function parseJsonAnswer(content: unknown): unknown {
  if (!Array.isArray(content)) return null;
  const block = content.find(b => b && typeof b === 'object' && (b as { type?: string }).type === 'text') as { text?: string } | undefined;
  if (!block?.text) return null;
  try { return JSON.parse(block.text); } catch { return null; }
}
