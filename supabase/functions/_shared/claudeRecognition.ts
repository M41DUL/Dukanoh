// Pure pieces of the Claude recognition engine: the prompts, the answer
// schemas, and the normalisers that turn a model answer into the contract.
// No Deno or SDK imports — every function here is unit tested in Jest.

import { CATEGORIES, CATEGORY_DEFINITIONS, COLOURS, FABRICS, GENDERS, OCCASIONS } from './garmentTaxonomy.ts';

export const CLAUDE_ENGINE = 'claude';
/** Bump whenever a prompt or schema below changes materially. */
export const CLAUDE_ENGINE_VERSION = 'recognise-2026-09d';
export const DEFAULT_MODEL = 'claude-sonnet-5';

// ─── Recognition ─────────────────────────────────────────────────────────────

/**
 * The separate garment pieces an outfit can be made of. The engine reports
 * which are visible so Fit can suggest what's missing from a set rather than
 * what a fixed table says goes with the category.
 */
export const PIECES = ['saree', 'skirt', 'top', 'bottoms', 'dupatta', 'blouse', 'jacket'] as const;

export const PIECES_GUIDE =
  '"pieces" lists the separate garment pieces visible in the photo, from: saree (the drape), skirt (a lehenga skirt), top (kameez, kurta, kurti, anarkali, sherwani, achkan, gown bodice), bottoms (salwar, churidar, pajama, sharara, palazzo), dupatta, blouse (choli or saree blouse), jacket (Nehru jacket or waistcoat). Empty for jewellery, accessories and shoes.';


/**
 * What each category looks like. The definitions in the taxonomy say what a
 * category *means* for a seller; these say how to *recognise* it in a photo,
 * which is what a small model needs. A plain black kurta was read as
 * Casualwear before these existed.
 */
export const RECOGNITION_CUES: Record<string, string> = {
  Lehenga:         'full flared skirt, usually with a cropped blouse (choli) and a dupatta; often heavily embellished',
  Saree:           'one long unstitched drape, pleated at the waist and thrown over one shoulder, with a fitted blouse',
  Anarkali:        'long frock-style top flaring from the chest or waist to the ankle, worn over churidar',
  'Salwar Kameez': 'three pieces — a knee-length kameez top, loose salwar trousers and a dupatta; the everyday South Asian women\'s suit',
  Kurta:           'straight-cut tunic-length shirt, usually with a stand collar, buttoned placket and side slits; men\'s or women\'s; shown without bottoms. A plain kurta is still a Kurta, never Casualwear',
  Sharara:         'wide flared trousers, often pleated from the knee, with a short kurti top',
  Gown:            'floor-length western-style dress, often Indo-western with embroidery',
  Dupatta:         'a long rectangular scarf or stole on its own',
  Blouse:          'a fitted, usually cropped top for a saree or lehenga, on its own',
  Salwar:          'bottoms on their own — salwar, churidar, palazzo or pajama',
  Sherwani:        'men\'s long fitted coat buttoned to the neck, knee-length or longer, wedding-level embellishment, worn over a kurta and churidar',
  'Kurta Pajama':  'men\'s kurta with matching pajama trousers shown together as a set',
  Achkan:          'men\'s structured knee-length coat with a stand collar, plainer and more tailored than a sherwani; includes Jodhpuri suits',
  'Pathani Suit':  'men\'s kurta with a stand collar and cuffed sleeves shown with its salwar as a two-piece set',
  'Nehru Jacket':  'men\'s sleeveless waistcoat with a stand collar, worn over a kurta',
  Jewellery:       'earrings, necklaces, tikka, bangles, sets, kalgi',
  Accessories:     'bags and potlis, safa or turban, belts, hair pieces, brooches',
  Casualwear:      'western casual pieces only — t-shirts, jeans, hoodies, plain western dresses. Never use it for a kurta or any other South Asian garment',
  Shoes:           'footwear, including juttis, mojaris and khussa',
};

export const RECOGNITION_SYSTEM_PROMPT = [
  'You identify South Asian clothing for Dukanoh, a UK resale app for South Asian fashion.',
  'You will be shown one photo. Answer with the JSON the schema requires and nothing else.',
  '',
  'Categories — pick exactly one, or null if the photo is not a listable item. Prefer the specific South Asian garment over Casualwear whenever the piece is one:',
  ...CATEGORIES.map(c => `- ${c}: ${CATEGORY_DEFINITIONS[c]}. Looks like: ${RECOGNITION_CUES[c]}`),
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
  PIECES_GUIDE,
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
    pieces:         { type: 'array', items: { type: 'string', enum: [...PIECES] } },
    confidence:     { type: 'number' },
  },
  required: ['is_listable', 'category', 'colour', 'accent_colours', 'gender', 'embellishment', 'has_person', 'pieces', 'confidence'],
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
    pieces: string[];
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
  const pieces = Array.isArray(r.pieces)
    ? [...new Set(r.pieces.map(x => oneOf(x, PIECES)).filter((x): x is string => !!x))]
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
      pieces: isListable ? pieces : [],
    },
  };
}

/**
 * Now and then the model answers with a skeleton: listable, a category, and
 * nothing else — confidence 0, no colour, no pieces. Seen on roughly one call
 * in six for some photos, at both low and medium effort. The caller retries
 * once rather than pre-filling a guess.
 */
export function isDegenerateRecognition(r: RecognitionResult): boolean {
  return r.isClothing && (r.confidence === null || r.confidence === 0) && r.detectedColour === null;
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

// ─── Listing draft ───────────────────────────────────────────────────────────
// The sell form fills title, description, fabric and occasion from the same
// look. The seller publishes the words as their own, so the draft has to read
// like a member typed it on their phone. The prompt asks for that; the
// normaliser makes sure of it. A field that still reads like a machine is
// dropped, never patched, and the reason is recorded so the prompt can be tuned.

export const DRAFT_TITLE_MAX = 80;          // the form's maxLength
export const DRAFT_TITLE_MIN_WORDS = 2;
export const DRAFT_TITLE_MAX_WORDS = 8;
export const DRAFT_DESCRIPTION_MAX = 500;   // the form's maxLength
export const DRAFT_DESCRIPTION_MAX_WORDS = 90;
export const DRAFT_FABRIC_MIN_CONFIDENCE = 0.6;
export const DRAFT_OCCASION_MIN_CONFIDENCE = 0.6;

/**
 * Words and phrases that read as a brochure or a machine rather than a member.
 * Any one of them drops the field. Kept as plain words so the same list is
 * both the rule in the prompt and the check in the normaliser.
 */
export const DRAFT_BANNED_PHRASES: readonly string[] = [
  // brochure adjectives
  'stunning', 'gorgeous', 'exquisite', 'elegant', 'timeless', 'luxurious', 'vibrant', 'breathtaking',
  'eye-catching', 'eye catching', 'versatile', 'effortless', 'beautiful',
  // brochure verbs
  'features', 'boasts', 'showcases', 'elevate', 'elevates', 'complements', 'pairs beautifully', 'adorned', 'crafted', 'exudes',
  // sales lines
  'perfect for', 'must-have', 'must have', 'statement piece', 'turn heads', 'add a touch', 'look no further',
  "don't miss", 'wardrobe staple', 'any occasion', 'every occasion', 'whether you',
  // connectors nobody types on a phone
  'additionally', 'furthermore', 'moreover', 'overall',
  // outsider terms for the community's own clothes
  'tunic', 'scarf', 'ethnic', 'traditional', 'bollywood', 'desi',
  // hedging
  'appears', 'seems', 'likely', 'possibly',
  // brand rules
  'pre-loved', 'preloved', 'pre-owned', 'preowned', 'second hand', 'second-hand', 'used',
  // disclaimers
  'please note', 'may vary',
  // a machine talking about its own answer
  'placeholder', 'untitled', 'unknown', 'unclear', 'unable to', 'not visible', 'no item', 'n/a', 'tbc', 'tbd',
];

/**
 * Words that describe the photo rather than the piece. A seller writing about
 * their own kurta does not say it is on a hanger. A sentence carrying one of
 * these is removed and the rest of the description kept; a title carrying one
 * is dropped.
 */
export const DRAFT_PHOTO_PHRASES: readonly string[] = [
  'photo', 'photos', 'picture', 'pictured', 'image', 'in frame', 'in the frame', 'shown', 'hanger', 'mannequin',
  'laid out', 'flat lay', 'displayed', 'visible here', 'in view', 'on display', 'the model', 'wearer',
];

/** Filler a member would not bother typing. Removed, never a reason to drop. */
export const DRAFT_FILLER_WORDS: readonly string[] = ['just', 'simply', 'really', 'very', 'quite'];

/** The per-request line that varies how a draft opens, so two similar pieces do not read as one template. */
export const DRAFT_OPENINGS: readonly string[] = [
  'For this listing, start the title with the colour and open the description with the work or embellishment.',
  'For this listing, start the title with the piece and open the description with the other pieces alongside it.',
  'For this listing, start the title with the work or the fabric and open the description with the cut or silhouette.',
  'For this listing, start the title with the colour and open the description with the border or the hem.',
  'For this listing, start the title with the piece and open the description with the texture or the sheen.',
];

export function draftOpening(seed: number): string {
  const n = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return DRAFT_OPENINGS[n % DRAFT_OPENINGS.length];
}

export const DRAFT_PROMPT_LINES: readonly string[] = [
  'Then write the seller a draft in "draft", using every photo. The seller publishes it as their own words, so it must read like a member typed it on their phone in a minute, not like a shop, a catalogue or a machine.',
  '',
  '"title": three to six words in sentence case, no full stop: the piece, its colour and one detail you can see. Shapes that work: "Maroon zari lehenga set", "Black cotton kurta, side slits", "Mirror work sharara in peach".',
  '"alt_title": a second title that starts with a different word from the first.',
  '"description": 25 to 60 words in one paragraph. Only what the photos show: the work and where it sits, the pieces in frame, the neckline, the border, the sheen, the cut. Include two details another piece of the same colour and category would not share. Short sentences of uneven length. A fragment is fine.',
  `"fabric": one of ${FABRICS.join(', ')} only when the photos make it plain, else null, with "fabric_confidence" from 0 to 1. Velvet, net, brocade, organza and cotton usually show; silk, satin, crepe, georgette and chiffon usually do not, so leave those null unless certain. Keep it consistent with the description: if you name a fabric there, set "fabric" to it with confidence 0.6 or above; if you would not name it, leave "fabric" null.`,
  `"occasion": one of ${OCCASIONS.join(', ')} when the piece plainly suits it, else null, with "occasion_confidence" from 0 to 1. Heavy work points to Wedding or Festive, a plain everyday kurta to Everyday.`,
  '',
  'Rules for the title and description:',
  '- Describe only the garment, as the seller would describe the piece itself. Never the person, the background, or how it is presented: no hanger, mannequin, flat lay, "in frame", "in the photo", "shown" or "pictured".',
  '- Never mention condition, wear, flaws, fit, size, measurements, price, brand, designer, where it is from or how it was worn. The seller adds those.',
  '- Say "set" only when more than one piece is there. Name the other pieces plainly, as in "with a matching choli and dupatta"; the seller removes any that are not for sale.',
  '- Use the community\'s words: kurta, kameez, dupatta, choli, lehenga, sharara, zari, gota, mirror work, chikankari. Never tunic, scarf, skirt set, ethnic wear, traditional, Indian outfit, Bollywood or desi.',
  '- British spelling: colour, jewellery, grey, favourite.',
  '- Do not start the description with "This". Do not repeat the title as the first sentence. Do not list colour, category and occasion together.',
  '- State what you see. No appears, seems, likely or possibly: if unsure, leave it out.',
  '- No dashes, semicolons, bullet points, emojis, exclamation marks or quotation marks. Plain sentences with commas and full stops.',
  '- Do not address the reader. No calls to action, no disclaimers, no "please note".',
  `- No filler: ${DRAFT_FILLER_WORDS.join(', ')}.`,
  `- Never use these words: ${DRAFT_BANNED_PHRASES.join(', ')}.`,
  '',
  'The voice, from three different photos:',
  'Title: Maroon zari lehenga set. Description: Gold zari worked across the skirt in a dense floral jaal, heavier towards the hem. With the matching choli and a sheer dupatta edged in the same zari. Deep maroon with a slight sheen.',
  'Title: Black kurta with side slits. Description: Plain black cotton, straight cut, stand collar and a short buttoned placket. Slits to the hip on both sides. Knee length.',
  'Title: Peach sharara with mirror work. Description: Mirror work in rows down the kurti front, silver thread between the mirrors. Wide sharara pleated from the knee. Peach throughout, with a paler dupatta alongside.',
];

export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title:               { type: 'string' },
    alt_title:           { type: 'string' },
    description:         { type: 'string' },
    fabric:              { anyOf: [{ type: 'string', enum: [...FABRICS] }, { type: 'null' }] },
    fabric_confidence:   { type: 'number' },
    occasion:            { anyOf: [{ type: 'string', enum: [...OCCASIONS] }, { type: 'null' }] },
    occasion_confidence: { type: 'number' },
  },
  required: ['title', 'alt_title', 'description', 'fabric', 'fabric_confidence', 'occasion', 'occasion_confidence'],
  additionalProperties: false,
} as const;

export interface ListingDraft {
  title: string | null;
  altTitle: string | null;
  description: string | null;
  fabric: string | null;
  occasion: string | null;
  /**
   * Why a field was dropped, e.g. "description:banned:stunning", or trimmed,
   * e.g. "description:trimmed:hanger". For tuning, never shown.
   */
  dropped: string[];
}

const BANNED_RE = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:' + DRAFT_BANNED_PHRASES.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}])',
  'iu',
);

const PHOTO_RE = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:' + DRAFT_PHOTO_PHRASES.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}])',
  'iu',
);

const FILLER_RE = new RegExp('(?<![\\p{L}\\p{N}])(?:' + DRAFT_FILLER_WORDS.join('|') + ')\\s+', 'giu');

/** The American spellings a UK member would never type. First-letter case is kept. */
const SPELLING_FIXES: readonly [RegExp, string][] = [
  [/\bcolor/giu, 'colour'],      // color, colors, colored, colorful
  [/\bjewelry\b/giu, 'jewellery'],
  [/\bgray\b/giu, 'grey'],
  [/\bfavorite/giu, 'favourite'],
  [/\bcenter\b/giu, 'centre'],
];

/** Proper nouns that keep their capital when a Title Cased title is brought down to sentence case. */
const TITLE_KEEP_CAPS: readonly string[] = [
  'Eid', 'Diwali', 'Holi', 'Navratri', 'Ramadan', 'Nehru', 'Jodhpuri', 'Banarasi', 'Kanjeevaram', 'Kanjivaram',
  'Lucknowi', 'Chikankari', 'Phulkari', 'Bandhani', 'Kashmiri', 'Pashmina', 'Patola', 'Paithani', 'Chanderi',
  'Jamdani', 'Ajrak', 'Kantha', 'Indo',
];

function fixSpelling(text: string): string {
  let out = text;
  for (const [re, fix] of SPELLING_FIXES) {
    out = out.replace(re, m => (m[0] === m[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix));
  }
  return out;
}

function findBanned(text: string): string | null {
  const m = BANNED_RE.exec(text);
  return m ? m[0].toLowerCase() : null;
}

function findPhotoWord(text: string): string | null {
  const m = PHOTO_RE.exec(text);
  return m ? m[0].toLowerCase() : null;
}

/** Sentence starts and the first letter come back up after words have been removed. */
function recapitalise(text: string): string {
  const s = text.replace(/([.?])\s+(\p{Ll})/gu, (_m, p: string, c: string) => `${p} ${c.toUpperCase()}`);
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function removeFiller(text: string): string {
  return recapitalise(text.replace(FILLER_RE, '').replace(/\s+([.,])/g, '$1').trim());
}

/**
 * Removes every sentence that talks about the photo instead of the piece.
 * Returns the sentences kept and the first offending word, for the log.
 */
function dropPhotoSentences(text: string): { kept: string; word: string | null } {
  const sentences = text.split(/(?<=[.?])\s+/u);
  let word: string | null = null;
  const kept = sentences.filter(sentence => {
    const hit = findPhotoWord(sentence);
    if (hit && !word) word = hit;
    return !hit;
  });
  return { kept: kept.join(' ').trim(), word };
}

/**
 * Takes the machine out of a piece of text: dashes, semicolons, markdown,
 * emoji, exclamation marks and quotation marks go, and what is left is one
 * plain paragraph with commas and full stops.
 */
export function cleanDraftText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw
    .replace(/[‘’]/g, "'")
    .replace(/[“”"«»]/g, '')
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
    .replace(/^\s*(?:[#>*•\-–—]+\s*)+/gmu, '')   // headers, bullets and quotes at a line start
    .replace(/\*\*|__|`/g, '')                                   // bold and code markers
    .replace(/\s*[–—]\s*|\s+-\s+|\s*--+\s*/g, ', ')    // dashes used as punctuation
    .replace(/…|\.{2,}/g, '.')
    .replace(/!+/g, '.')
    .replace(/;\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/\.\s*,/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/\.{2,}/g, '.')
    .replace(/^[,.\s]+/, '')
    .trim();
  s = s.replace(/([.?])\s+(\p{Ll})/gu, (_m, p: string, c: string) => `${p} ${c.toUpperCase()}`);
  if (s) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

/** A title the model wrote In Title Case comes down to sentence case; one already in sentence case is left alone. */
function sentenceCaseTitle(title: string): string {
  const words = title.split(' ');
  const rest = words.slice(1).filter(w => /^\p{L}{3,}$/u.test(w));
  const titleCased = rest.length > 0 && rest.every(w => /^\p{Lu}/u.test(w));
  if (!titleCased) return title;
  return words
    .map((w, i) => {
      if (i === 0) return w;
      const keep = TITLE_KEEP_CAPS.find(k => k.toLowerCase() === w.toLowerCase());
      return keep ?? (/^\p{Lu}\p{Ll}*$/u.test(w) ? w.toLowerCase() : w);
    })
    .join(' ');
}

function cleanTitle(raw: unknown): { value: string | null; reason: string | null } {
  let s = removeFiller(cleanDraftText(raw)).replace(/[.,:\s]+$/u, '');
  if (!s) return { value: null, reason: 'empty' };
  s = fixSpelling(s);
  const banned = findBanned(s);
  if (banned) return { value: null, reason: `banned:${banned}` };
  const photo = findPhotoWord(s);
  if (photo) return { value: null, reason: `photo:${photo}` };
  const words = s.split(' ').length;
  if (words > DRAFT_TITLE_MAX_WORDS || s.length > DRAFT_TITLE_MAX) return { value: null, reason: 'long' };
  if (words < DRAFT_TITLE_MIN_WORDS || s.length < 3) return { value: null, reason: 'short' };
  s = sentenceCaseTitle(s);
  return { value: s, reason: null };
}

function cleanDescription(raw: unknown): { value: string | null; reason: string | null; note: string | null } {
  let s = removeFiller(cleanDraftText(raw));
  if (!s) return { value: null, reason: 'empty', note: null };
  s = fixSpelling(s);
  if (/^this\b/iu.test(s)) return { value: null, reason: 'starts_this', note: null };
  const banned = findBanned(s);
  if (banned) return { value: null, reason: `banned:${banned}`, note: null };
  const { kept, word } = dropPhotoSentences(s);
  const note = word ? `trimmed:${word}` : null;
  s = kept;
  if (!s) return { value: null, reason: `photo:${word}`, note: null };
  if (s.split(' ').length > DRAFT_DESCRIPTION_MAX_WORDS) return { value: null, reason: 'long', note };
  if (s.length > DRAFT_DESCRIPTION_MAX) {
    const cut = s.lastIndexOf('. ', DRAFT_DESCRIPTION_MAX - 1);
    if (cut < 10) return { value: null, reason: 'long', note };
    s = s.slice(0, cut + 1);
  }
  if (!/[.?]$/u.test(s)) s += '.';
  if (s.length < 10) return { value: null, reason: 'short', note };
  return { value: s, reason: null, note };
}

function gatedChoice(
  value: unknown, confidence: unknown, allowed: readonly string[], min: number, field: string, dropped: string[],
): string | null {
  const chosen = oneOf(value, allowed);
  if (!chosen) {
    if (typeof value === 'string' && value) dropped.push(`${field}:invalid`);
    return null;
  }
  if (chosen === 'Other') return null;
  if ((clamp01(confidence) ?? 0) < min) { dropped.push(`${field}:low_confidence`); return null; }
  return chosen;
}

/**
 * Turns the model's draft into what the form may fill in. Anything that still
 * reads like a machine, or that the form could not accept, is dropped with a
 * reason. A dropped field is blank for the seller, which is what they had
 * before drafts existed.
 */
export function normaliseDraft(raw: unknown): ListingDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dropped: string[] = [];
  const title = cleanTitle(r.title);
  if (title.reason) dropped.push(`title:${title.reason}`);
  const alt = cleanTitle(r.alt_title);
  if (alt.reason) dropped.push(`alt_title:${alt.reason}`);
  const description = cleanDescription(r.description);
  if (description.reason) dropped.push(`description:${description.reason}`);
  if (description.note) dropped.push(`description:${description.note}`);
  const fabric = gatedChoice(r.fabric, r.fabric_confidence, FABRICS, DRAFT_FABRIC_MIN_CONFIDENCE, 'fabric', dropped);
  const occasion = gatedChoice(r.occasion, r.occasion_confidence, OCCASIONS, DRAFT_OCCASION_MIN_CONFIDENCE, 'occasion', dropped);
  return {
    title: title.value,
    altTitle: alt.value && alt.value.toLowerCase() !== title.value?.toLowerCase() ? alt.value : null,
    description: description.value,
    fabric,
    occasion,
    dropped,
  };
}

export function emptyDraft(): ListingDraft {
  return { title: null, altTitle: null, description: null, fabric: null, occasion: null, dropped: [] };
}

// ─── Whole listing in one look ───────────────────────────────────────────────
// The sell form sends every photo of a listing at once. One call screens each
// photo, identifies the piece from the cover and drafts the listing, instead
// of two or three calls per photo.

const MODERATION_RULES = [
  'Set "blocked" true only for: explicit nudity or sexual content; graphic violence or gore; weapons shown as a threat; illegal drugs; hate symbols.',
  'Do NOT block ordinary fashion photography. A visible midriff, back, shoulders or arms in a saree, lehenga, blouse or sharara is normal and allowed. A person modelling the garment is allowed. A mannequin is allowed.',
  '"reasons" lists why it was blocked; empty when not blocked.',
  '"is_listable" is true when the photo shows a garment, jewellery, an accessory or footwear that could be sold on the app. A person wearing it, a mannequin, a hanger or a flat-lay all count.',
  '"too_dark": the item is hard to see because the photo is underexposed.',
  '"blurry": the item is out of focus or motion-blurred.',
  '"busy_background": clutter, furniture or a messy room distracts from the item.',
  '"stock_or_watermark": this looks like a retailer\'s catalogue image, a professional stock photo, or carries a watermark or shop logo, rather than a photo the seller took of their own piece.',
  '"screenshot": this is a screenshot of a website, app or message rather than a photo.',
  '"has_person": any person or part of a person is visible.',
];

export const LISTING_SCREEN_SYSTEM_PROMPT = [
  'You screen the photos a seller is adding to one listing on Dukanoh, a UK resale app for South Asian fashion, and you identify the piece from the cover photo.',
  'You will be shown up to 8 photos of the same item, numbered in order. Photo 1 is the cover. Answer with the JSON the schema requires and nothing else, with exactly one "photos" entry per photo, in order, "index" starting at 1.',
  '',
  'For every photo:',
  ...MODERATION_RULES,
  '',
  'For the cover photo only, fill in "cover":',
  'Categories — pick exactly one, or null if the cover is not a listable item. Prefer the specific South Asian garment over Casualwear whenever the piece is one:',
  ...CATEGORIES.map(c => `- ${c}: ${CATEGORY_DEFINITIONS[c]}. Looks like: ${RECOGNITION_CUES[c]}`),
  '',
  `Colours — pick from: ${COLOURS.join(', ')}. "colour" is the main colour of the garment itself, ignoring the background; "accent_colours" are up to two secondary colours on the piece. Use "Multi" only when no single colour dominates.`,
  '"gender" is Men or Women for who the piece is made for, or null if you cannot tell.',
  '"embellishment" is none, light or heavy.',
  PIECES_GUIDE,
  '"confidence" is 0 to 1 for the category choice.',
  '',
  ...DRAFT_PROMPT_LINES,
].join('\n');

const PHOTO_SCREEN_SCHEMA = {
  type: 'object',
  properties: {
    index:              { type: 'integer' },
    blocked:            { type: 'boolean' },
    reasons:            { type: 'array', items: { type: 'string', enum: [...MODERATION_REASONS] } },
    is_listable:        { type: 'boolean' },
    too_dark:           { type: 'boolean' },
    blurry:             { type: 'boolean' },
    busy_background:    { type: 'boolean' },
    stock_or_watermark: { type: 'boolean' },
    screenshot:         { type: 'boolean' },
    has_person:         { type: 'boolean' },
  },
  required: ['index', 'blocked', 'reasons', 'is_listable', 'too_dark', 'blurry', 'busy_background', 'stock_or_watermark', 'screenshot', 'has_person'],
  additionalProperties: false,
} as const;

export const LISTING_SCREEN_SCHEMA = {
  type: 'object',
  properties: {
    photos: { type: 'array', items: PHOTO_SCREEN_SCHEMA },
    cover: {
      type: 'object',
      properties: {
        category:       { anyOf: [{ type: 'string', enum: [...CATEGORIES] }, { type: 'null' }] },
        colour:         { anyOf: [{ type: 'string', enum: [...COLOURS] }, { type: 'null' }] },
        accent_colours: { type: 'array', items: { type: 'string', enum: [...COLOURS] } },
        gender:         { anyOf: [{ type: 'string', enum: [...GENDERS] }, { type: 'null' }] },
        embellishment:  { anyOf: [{ type: 'string', enum: ['none', 'light', 'heavy'] }, { type: 'null' }] },
        pieces:         { type: 'array', items: { type: 'string', enum: [...PIECES] } },
        confidence:     { type: 'number' },
      },
      required: ['category', 'colour', 'accent_colours', 'gender', 'embellishment', 'pieces', 'confidence'],
      additionalProperties: false,
    },
    draft: DRAFT_SCHEMA,
  },
  required: ['photos', 'cover', 'draft'],
  additionalProperties: false,
} as const;

export interface PhotoScreenResult extends ModerationResult {
  isClothing: boolean;
}

export interface ListingScreenResult {
  photos: PhotoScreenResult[];
  cover: RecognitionResult;
  /** Null when the cover is not a listable piece or the model refused. */
  draft: ListingDraft | null;
}

/** A photo the model said nothing about passes: screening fails open, never closed. */
function passThroughPhoto(): PhotoScreenResult {
  return { ...normaliseModeration({}), isClothing: true };
}

/**
 * One entry per photo sent, in order, whatever the model returned. Missing or
 * out-of-range entries pass through; a refusal blocks every photo. The cover
 * read is normalised like a single recognition, with "is_listable" taken
 * from photo 1. The draft only exists for a listable cover.
 */
export function normaliseListingScreen(raw: unknown, count: number, refused = false): ListingScreenResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const entries = Array.isArray(r.photos) ? r.photos : [];
  const photos: PhotoScreenResult[] = Array.from({ length: count }, () => passThroughPhoto());
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const i = typeof e.index === 'number' ? Math.round(e.index) - 1 : -1;
    if (i < 0 || i >= count) continue;
    photos[i] = { ...normaliseModeration(e), isClothing: e.is_listable !== false };
  }
  if (refused) {
    for (const p of photos) { p.blocked = true; if (p.reasons.length === 0) p.reasons = ['other']; }
  }
  const coverRaw = (r.cover && typeof r.cover === 'object' ? r.cover : {}) as Record<string, unknown>;
  const cover = normaliseRecognition({
    ...coverRaw,
    is_listable: photos[0]?.isClothing ?? false,
    has_person: photos[0]?.flags.hasPerson ?? false,
  });
  const draft = cover.isClothing && !refused ? normaliseDraft(r.draft) : null;
  return { photos, cover, draft };
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
