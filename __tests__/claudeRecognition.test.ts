// The Claude engine's pure parts: prompts name every category and colour the
// engine may answer with, schemas only allow those answers, and the
// normalisers never let a stray value through to the contract.
import { CATEGORIES, COLOURS, FABRICS, OCCASIONS } from '../supabase/functions/_shared/garmentTaxonomy';
import {
  CLAUDE_ENGINE,
  CLAUDE_ENGINE_VERSION,
  DEFAULT_MODEL,
  DRAFT_BANNED_PHRASES,
  DRAFT_DESCRIPTION_MAX,
  DRAFT_OPENINGS,
  DRAFT_SCHEMA,
  cleanDraftText,
  draftOpening,
  LISTING_SCREEN_SCHEMA,
  LISTING_SCREEN_SYSTEM_PROMPT,
  MODERATION_SCHEMA,
  MODERATION_SYSTEM_PROMPT,
  normaliseListingScreen,
  PIECES,
  QUALITY_WARNINGS,
  RECOGNITION_CUES,
  RECOGNITION_SCHEMA,
  RECOGNITION_SYSTEM_PROMPT,
  isDegenerateRecognition,
  modelOptions,
  normaliseDraft,
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
      gender: 'Women', embellishment: 'heavy', has_person: false, pieces: ['top', 'dupatta', 'top', 'cape'], confidence: 0.9234,
    });
    expect(r).toEqual({
      isClothing: true, detectedCategory: 'Anarkali', detectedColour: 'Maroon', detectedGender: 'Women',
      confidence: 0.923, hasPerson: false, attributes: { accentColours: ['Gold', 'Cream'], embellishment: 'heavy', pieces: ['top', 'dupatta'] },
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
  test('a skeleton answer is recognised so the caller can retry', () => {
    const skeleton = normaliseRecognition({ is_listable: true, category: 'Salwar', colour: null, accent_colours: [], gender: null, embellishment: null, has_person: false, pieces: [], confidence: 0 });
    expect(isDegenerateRecognition(skeleton)).toBe(true);
    const real = normaliseRecognition({ is_listable: true, category: 'Salwar Kameez', colour: 'Green', accent_colours: ['Pink'], gender: 'Women', embellishment: 'heavy', has_person: false, pieces: ['top', 'bottoms', 'dupatta'], confidence: 0.85 });
    expect(isDegenerateRecognition(real)).toBe(false);
    expect(isDegenerateRecognition(normaliseRecognition({ is_listable: false }))).toBe(false);
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

describe('pieces and the whole-listing look', () => {
  test('the recognition schema and prompt know the pieces vocabulary', () => {
    const items = RECOGNITION_SCHEMA.properties.pieces.items as { enum: readonly string[] };
    expect([...items.enum]).toEqual([...PIECES]);
    expect(RECOGNITION_SYSTEM_PROMPT).toContain('"pieces"');
  });
  test('the listing schema has one entry per photo and a cover read', () => {
    expect(LISTING_SCREEN_SCHEMA.required).toEqual(['photos', 'cover', 'draft']);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/Photo 1 is the cover/);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/midriff/);
  });
  test('normaliseListingScreen keeps photo order and reads the cover', () => {
    const r = normaliseListingScreen({
      photos: [
        { index: 2, blocked: true, reasons: ['nudity'], is_listable: true },
        { index: 1, blocked: false, reasons: [], is_listable: true, too_dark: true },
        { index: 9, blocked: true },
      ],
      cover: { category: 'Kurta', colour: 'Black', accent_colours: [], gender: 'Men', embellishment: 'none', pieces: ['top'], confidence: 0.8 },
    }, 3);
    expect(r.photos.map(p => p.blocked)).toEqual([false, true, false]);
    expect(r.photos[0].warnings).toEqual([QUALITY_WARNINGS.tooDark]);
    expect(r.photos[2].isClothing).toBe(true);
    expect(r.cover.detectedCategory).toBe('Kurta');
    expect(r.cover.detectedGender).toBe('Men');
    expect(r.cover.attributes.pieces).toEqual(['top']);
  });
  test('a cover that is not listable yields no category and no draft', () => {
    const r = normaliseListingScreen({ photos: [{ index: 1, is_listable: false }], cover: { category: 'Kurta' }, draft: { title: 'Black kurta' } }, 1);
    expect(r.photos[0].isClothing).toBe(false);
    expect(r.cover.detectedCategory).toBeNull();
    expect(r.draft).toBeNull();
  });
  test('a listable cover carries its draft', () => {
    const r = normaliseListingScreen({
      photos: [{ index: 1, is_listable: true }],
      cover: { category: 'Kurta', colour: 'Black', confidence: 0.9 },
      draft: { title: 'Black kurta with side slits', alt_title: 'Kurta in black', description: 'Plain black cotton, straight cut, stand collar. Slits to the hip on both sides.', fabric: 'Cotton', fabric_confidence: 0.9, occasion: 'Everyday', occasion_confidence: 0.8 },
    }, 1);
    expect(r.draft?.title).toBe('Black kurta with side slits');
    expect(r.draft?.fabric).toBe('Cotton');
    expect(r.draft?.occasion).toBe('Everyday');
  });
  test('a refusal blocks every photo and drafts nothing', () => {
    const r = normaliseListingScreen(null, 2, true);
    expect(r.photos.every(p => p.blocked)).toBe(true);
    expect(r.draft).toBeNull();
  });
});

describe('the listing draft', () => {
  test('the schema only allows taxonomy fabrics and occasions', () => {
    const fab = DRAFT_SCHEMA.properties.fabric.anyOf[0] as { enum: readonly string[] };
    const occ = DRAFT_SCHEMA.properties.occasion.anyOf[0] as { enum: readonly string[] };
    expect([...fab.enum]).toEqual([...FABRICS]);
    expect([...occ.enum]).toEqual([...OCCASIONS]);
    expect(DRAFT_SCHEMA.additionalProperties).toBe(false);
    expect(LISTING_SCREEN_SCHEMA.properties.draft).toBe(DRAFT_SCHEMA);
  });
  test('the prompt carries the voice rules and every banned phrase', () => {
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/Never mention condition/);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/British spelling/);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/Do not start the description with "This"/);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/No dashes, semicolons/);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/Say "set" only when more than one piece/);
    expect(LISTING_SCREEN_SYSTEM_PROMPT).toMatch(/no hanger, mannequin, flat lay/);
    for (const w of DRAFT_BANNED_PHRASES) expect(LISTING_SCREEN_SYSTEM_PROMPT).toContain(w);
    for (const f of FABRICS) expect(LISTING_SCREEN_SYSTEM_PROMPT).toContain(f);
  });
  test('the example drafts in the prompt pass the normaliser', () => {
    const examples = LISTING_SCREEN_SYSTEM_PROMPT.split('\n').filter(l => l.startsWith('Title: '));
    expect(examples).toHaveLength(3);
    for (const line of examples) {
      const [, title, description] = /^Title: (.+?)\. Description: (.+)$/.exec(line)!;
      const d = normaliseDraft({ title, alt_title: '', description, fabric: null, fabric_confidence: 0, occasion: null, occasion_confidence: 0 });
      expect(d.title).toBe(title);
      expect(d.description).toBe(description);
      expect(d.dropped).toEqual(['alt_title:empty']);
    }
  });
  test('openings are picked by seed, always from the list', () => {
    expect(DRAFT_OPENINGS.length).toBeGreaterThanOrEqual(4);
    expect(draftOpening(0)).toBe(DRAFT_OPENINGS[0]);
    expect(draftOpening(DRAFT_OPENINGS.length + 1)).toBe(DRAFT_OPENINGS[1]);
    expect(DRAFT_OPENINGS).toContain(draftOpening(-7));
    expect(DRAFT_OPENINGS).toContain(draftOpening(Number.NaN));
  });

  test('a good answer maps straight onto the draft', () => {
    const d = normaliseDraft({
      title: 'Maroon zari lehenga set', alt_title: 'Lehenga set in maroon zari',
      description: 'Gold zari across the skirt in a floral jaal, heavier at the hem. With the matching choli and a sheer dupatta.',
      fabric: 'Velvet', fabric_confidence: 0.9, occasion: 'Wedding', occasion_confidence: 0.85,
    });
    expect(d).toEqual({
      title: 'Maroon zari lehenga set', altTitle: 'Lehenga set in maroon zari',
      description: 'Gold zari across the skirt in a floral jaal, heavier at the hem. With the matching choli and a sheer dupatta.',
      fabric: 'Velvet', occasion: 'Wedding', dropped: [],
    });
  });
  test('dashes, semicolons, emoji, exclamation and quotation marks come out', () => {
    expect(cleanDraftText('gold zari on the border — choli included; sheer dupatta ✨ in frame! “Deep” maroon…'))
      .toBe('Gold zari on the border, choli included. Sheer dupatta in frame. Deep maroon.');
    expect(cleanDraftText('Wide sharara - pleated from the knee -- peach throughout')).toBe('Wide sharara, pleated from the knee, peach throughout');
  });
  test('markdown and paragraphs collapse into one plain paragraph', () => {
    expect(cleanDraftText('**Gold zari** on the border.\n\n- Choli in frame\n- Dupatta too')).toBe('Gold zari on the border. Choli in frame Dupatta too');
    expect(cleanDraftText('# Maroon lehenga')).toBe('Maroon lehenga');
  });
  test('American spellings become British and keep their capital', () => {
    const d = normaliseDraft({ title: 'Gray kurta with colored thread', description: 'Color is deep maroon. Jewelry alongside is not part of it, only the colorful border.' });
    expect(d.title).toBe('Grey kurta with coloured thread');
    expect(d.description).toBe('Colour is deep maroon. Jewellery alongside is not part of it, only the colourful border.');
  });
  test('a Title Cased title comes down to sentence case, proper nouns kept', () => {
    expect(normaliseDraft({ title: 'Maroon Zari Lehenga Set For Eid' }).title).toBe('Maroon zari lehenga set for Eid');
    expect(normaliseDraft({ title: 'Black Kurta.' }).title).toBe('Black kurta');
    expect(normaliseDraft({ title: 'Maroon lehenga with Banarasi border' }).title).toBe('Maroon lehenga with Banarasi border');
  });
  test('a banned phrase drops the field and says which', () => {
    const d = normaliseDraft({ title: 'Elegant maroon lehenga', description: 'Stunning zari work, perfect for weddings.' });
    expect(d.title).toBeNull();
    expect(d.description).toBeNull();
    expect(d.dropped).toEqual(expect.arrayContaining(['title:banned:elegant', 'description:banned:stunning']));
  });
  test('banned words match whole words only', () => {
    const d = normaliseDraft({ title: 'Grey overalls, unused', description: 'Wide overalls with unused side pockets and a deep hem.' });
    expect(d.title).toBe('Grey overalls, unused');
    expect(d.description).toBe('Wide overalls with unused side pockets and a deep hem.');
  });
  test('a sentence about the photo is removed, the rest kept, and the log says so', () => {
    const d = normaliseDraft({ description: 'Sherwani shown on its own on a hanger. Self jacquard weave in cream. Beadwork down the placket and along both cuffs.' });
    expect(d.description).toBe('Self jacquard weave in cream. Beadwork down the placket and along both cuffs.');
    expect(d.dropped).toEqual(expect.arrayContaining(['description:trimmed:shown']));
    const only = normaliseDraft({ description: 'Laid out flat in the photo.' });
    expect(only.description).toBeNull();
    expect(only.dropped).toContain('description:photo:laid out');
    expect(normaliseDraft({ title: 'Kurta on a hanger' }).dropped).toContain('title:photo:hanger');
  });
  test('filler words are removed and the sentence recapitalised', () => {
    const d = normaliseDraft({ title: 'Just a plain black kurta', description: 'Just the print doing the work. Very fine cotton, quite a soft weave, really.' });
    expect(d.title).toBe('A plain black kurta');
    expect(d.description).toBe('The print doing the work. Fine cotton, a soft weave, really.');
  });
  test('a description that opens with This is dropped', () => {
    const d = normaliseDraft({ description: 'This maroon lehenga has gold zari on the hem and a matching choli.' });
    expect(d.description).toBeNull();
    expect(d.dropped).toContain('description:starts_this');
  });
  test('a title that is a sentence is dropped, a description that runs on is cut at a full stop', () => {
    expect(normaliseDraft({ title: 'A maroon lehenga with heavy gold zari work all over the skirt and hem' }).dropped).toContain('title:long');
    const sentence = 'Embroidered chikankari across the shoulders and a scalloped organza dupatta. ';
    const d = normaliseDraft({ description: sentence.repeat(8) }); // 80 words, well over 500 characters
    expect(d.description!.length).toBeLessThanOrEqual(DRAFT_DESCRIPTION_MAX);
    expect(d.description!.endsWith('.')).toBe(true);
    expect(normaliseDraft({ description: 'word '.repeat(120) }).dropped).toContain('description:long');
  });
  test('fabric and occasion need to be on the list and confident', () => {
    const low = normaliseDraft({ fabric: 'Silk', fabric_confidence: 0.4, occasion: 'Wedding', occasion_confidence: 0.5 });
    expect(low.fabric).toBeNull();
    expect(low.occasion).toBeNull();
    expect(low.dropped).toEqual(expect.arrayContaining(['fabric:low_confidence', 'occasion:low_confidence']));
    const bad = normaliseDraft({ fabric: 'Denim', fabric_confidence: 0.9, occasion: 'Prom', occasion_confidence: 0.9 });
    expect(bad.fabric).toBeNull();
    expect(bad.dropped).toEqual(expect.arrayContaining(['fabric:invalid', 'occasion:invalid']));
    expect(normaliseDraft({ fabric: 'Other', fabric_confidence: 1 }).fabric).toBeNull();
  });
  test('a one-word or machine title is dropped', () => {
    expect(normaliseDraft({ title: 'Placeholder' }).dropped).toContain('title:banned:placeholder');
    expect(normaliseDraft({ title: 'Kurta' }).dropped).toContain('title:short');
    expect(normaliseDraft({ description: 'Unable to identify the item.' }).dropped).toContain('description:banned:unable to');
  });
  test('an alternative title that repeats the title is dropped', () => {
    expect(normaliseDraft({ title: 'Black kurta', alt_title: 'black kurta' }).altTitle).toBeNull();
  });
  test('garbage is a safe empty draft', () => {
    const d = normaliseDraft(null);
    expect(d.title).toBeNull();
    expect(d.description).toBeNull();
    expect(d.fabric).toBeNull();
    expect(d.dropped).toEqual(expect.arrayContaining(['title:empty', 'description:empty']));
  });
});
