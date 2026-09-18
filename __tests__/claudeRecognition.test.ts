// The Claude engine's pure parts: prompts name every category and colour the
// engine may answer with, schemas only allow those answers, and the
// normalisers never let a stray value through to the contract.
import { CATEGORIES, COLOURS } from '../supabase/functions/_shared/garmentTaxonomy';
import {
  CLAUDE_ENGINE,
  CLAUDE_ENGINE_VERSION,
  DEFAULT_MODEL,
  MODERATION_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  QUALITY_WARNINGS,
  RECOGNITION_CUES,
  RECOGNITION_SCHEMA,
  RECOGNITION_SYSTEM_PROMPT,
  modelOptions,
  normaliseModeration,
  normaliseRecognition,
  parseJsonAnswer,
} from '../supabase/functions/_shared/claudeRecognition';

describe('prompts and schemas', () => {
  test('the recognition prompt names every category with its definition', () => {
    for (const c of CATEGORIES) expect(RECOGNITION_SYSTEM_PROMPT).toContain(`- ${c}: `);
  });
  test('every category has a visual cue and the prompt carries it', () => {
    for (const c of CATEGORIES) {
      expect(typeof RECOGNITION_CUES[c]).toBe('string');
      expect(RECOGNITION_SYSTEM_PROMPT).toContain(`- ${c}: `);
      expect(RECOGNITION_SYSTEM_PROMPT).toContain(RECOGNITION_CUES[c]);
    }
  });
  test('the prompt tells the model a plain kurta is not Casualwear', () => {
    expect(RECOGNITION_SYSTEM_PROMPT).toMatch(/never Casualwear/);
  });
  test('the recognition prompt lists every colour', () => {
    for (const c of COLOURS) expect(RECOGNITION_SYSTEM_PROMPT).toContain(c);
  });
  test('the schema only allows taxonomy categories and colours', () => {
    const cat = RECOGNITION_SCHEMA.properties.category.anyOf[0] as { enum: readonly string[] };
    const col = RECOGNITION_SCHEMA.properties.colour.anyOf[0] as { enum: readonly string[] };
    expect([...cat.enum]).toEqual([...CATEGORIES]);
    expect([...col.enum]).toEqual([...COLOURS]);
    expect(RECOGNITION_SCHEMA.additionalProperties).toBe(false);
  });
  test('the moderation prompt protects ordinary South Asian fashion photography', () => {
    expect(MODERATION_SYSTEM_PROMPT).toMatch(/midriff/);
    expect(MODERATION_SYSTEM_PROMPT).toMatch(/mannequin/i);
    expect(MODERATION_SCHEMA.additionalProperties).toBe(false);
  });
  test('engine identity', () => {
    expect(CLAUDE_ENGINE).toBe('claude');
    expect(CLAUDE_ENGINE_VERSION).toMatch(/^recognise-/);
    expect(DEFAULT_MODEL).toMatch(/^claude-/);
  });
});

describe('normaliseRecognition', () => {
  test('a good answer maps straight onto the contract', () => {
    const r = normaliseRecognition({
      is_listable: true, category: 'Anarkali', colour: 'Maroon', accent_colours: ['Gold', 'Cream', 'Red'],
      gender: 'Women', embellishment: 'heavy', has_person: false, confidence: 0.9234,
    });
    expect(r).toEqual({
      isClothing: true, detectedCategory: 'Anarkali', detectedColour: 'Maroon', detectedGender: 'Women',
      confidence: 0.923, hasPerson: false, attributes: { accentColours: ['Gold', 'Cream'], embellishment: 'heavy' },
    });
  });
  test('not listable means no category and no confidence, whatever else came back', () => {
    const r = normaliseRecognition({ is_listable: false, category: 'Saree', colour: 'Red', accent_colours: [], gender: null, embellishment: null, has_person: true, confidence: 0.4 });
    expect(r.isClothing).toBe(false);
    expect(r.detectedCategory).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.hasPerson).toBe(true);
  });
  test('a category outside the taxonomy is treated as no category', () => {
    const r = normaliseRecognition({ is_listable: true, category: 'Abaya', colour: 'Beige', accent_colours: [], gender: 'Kids', embellishment: 'medium', has_person: false, confidence: 2 });
    expect(r.isClothing).toBe(false);
    expect(r.detectedColour).toBeNull();
    expect(r.detectedGender).toBeNull();
    expect(r.attributes.embellishment).toBeNull();
  });
  test('garbage becomes a safe empty answer', () => {
    expect(normaliseRecognition(null).isClothing).toBe(false);
    expect(normaliseRecognition('x').detectedCategory).toBeNull();
  });
  test('confidence is clamped to 0–1', () => {
    expect(normaliseRecognition({ is_listable: true, category: 'Kurta', confidence: 1.7 }).confidence).toBe(1);
    expect(normaliseRecognition({ is_listable: true, category: 'Kurta', confidence: -3 }).confidence).toBe(0);
  });
});

describe('normaliseModeration', () => {
  test('maps flags to the warning copy sellers already see', () => {
    const r = normaliseModeration({ blocked: false, reasons: [], too_dark: true, blurry: false, busy_background: true, stock_or_watermark: false, screenshot: false, has_person: true });
    expect(r.blocked).toBe(false);
    expect(r.warnings).toEqual([QUALITY_WARNINGS.tooDark, QUALITY_WARNINGS.busyBackground]);
    expect(r.flags.hasPerson).toBe(true);
  });
  test('a refusal is blocked', () => {
    const r = normaliseModeration(null, true);
    expect(r.blocked).toBe(true);
    expect(r.reasons).toEqual(['other']);
  });
  test('unknown reasons are dropped, known ones kept', () => {
    const r = normaliseModeration({ blocked: true, reasons: ['nudity', 'cats'] });
    expect(r.reasons).toEqual(['nudity']);
  });
});

describe('request shaping', () => {
  test('Haiku gets no thinking or effort options', () => {
    expect(modelOptions('claude-haiku-4-5')).toEqual({});
  });
  test('Sonnet and Opus get adaptive thinking at low effort', () => {
    expect(modelOptions('claude-sonnet-5')).toEqual({ thinking: { type: 'adaptive' }, output_config_effort: 'low' });
    expect(modelOptions('claude-opus-5')).toEqual({ thinking: { type: 'adaptive' }, output_config_effort: 'low' });
  });
  test('parseJsonAnswer reads the first text block', () => {
    expect(parseJsonAnswer([{ type: 'text', text: '{"ok":true}' }])).toEqual({ ok: true });
    expect(parseJsonAnswer([{ type: 'thinking', thinking: '' }, { type: 'text', text: 'nope' }])).toBeNull();
    expect(parseJsonAnswer('x')).toBeNull();
  });
});
