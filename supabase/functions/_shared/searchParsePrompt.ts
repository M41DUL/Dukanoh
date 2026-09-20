// Pure pieces of the search parse: the prompt, the answer schema and the
// normaliser that turns Claude's answer into the filters the app expects.
// No Deno or SDK imports — unit tested in Jest. The phone's own dictionary
// (lib/searchParse.ts) does most searches; this is asked about the leftovers.

import { CATEGORIES, CATEGORY_DEFINITIONS, COLOURS, CONDITIONS, FABRICS, GENDERS, OCCASIONS, SIZES } from './garmentTaxonomy.ts';

/** Bump whenever the prompt or schema changes materially; cached parses carry it. */
export const SEARCH_PARSE_VERSION = 'search-2026-09b';
export const MAX_QUERY_CHARS = 120;
export const MAX_PRICE = 2000;

export const SEARCH_PARSE_SYSTEM_PROMPT = [
  'You turn what a member typed into the search bar of Dukanoh, a UK resale app for South Asian fashion, into search filters.',
  'Members write in English, in Hinglish and romanised Urdu, Punjabi, Bengali or Gujarati, or in Bengali, Devanagari, Gurmukhi or Urdu script. Read all of them.',
  'Answer with the JSON the schema requires and nothing else.',
  '',
  'Map words to these lists only, and only when the member plainly meant them:',
  `- categories: ${CATEGORIES.map(c => `${c} (${CATEGORY_DEFINITIONS[c]})`).join('; ')}. Ghagra and lehenga choli are Lehenga; kameez, jora, joda, 3 piece and any kind of suit (punjabi suit, patiala suit, palazzo suit, trouser suit, lawn suit, ready to wear suit) are Salwar Kameez, never a western suit, and so is the word suit in any script (ਸੂਟ, سوٹ, सूट, স্যুট); kurti is Kurta; chunni and odhni are Dupatta; choli is Blouse; churidar and palazzo on their own are Salwar; sharara suit and gharara are Sharara; jhumka, tikka and bangles are Jewellery; jutti and khussa are Shoes.`,
  `- colours: ${COLOURS.join(', ')}. laal is Red, gulabi Pink, mehroon Maroon, firozi Teal, sabz Green, neela Blue, peela Yellow, sunehri Gold, kala Black, safed White; beige and ivory are Cream.`,
  `- occasions: ${OCCASIONS.join(', ')}. shaadi, biye, walima, nikkah, baraat, bridal, bridesmaid and groom mean Wedding; mehendi, henna, haldi and holud mean Mehndi; puja, navratri, garba and holi mean Festive; sangeet and engagement mean Party.`,
  `- fabrics: ${FABRICS.join(', ')}. tussar, kanjeevaram, banarasi silk and raw silk are Silk; jamawar and jacquard are Brocade. Never answer Other.`,
  `- sizes: ${SIZES.join(', ')}. UK dress sizes: 6 and 8 are XS, 10 is S, 12 is M, 14 is L, 16 is XL, 18 and 20 are XXL. A bare letter is not a size.`,
  `- conditions: ${CONDITIONS.join(', ')}. bnwt, unworn and with tags mean New; worn once and like new mean Excellent.`,
  `- gender: ${GENDERS.join(' or ')}, only when the words say who it is for (mens, ladies, groom, bride, dulhan, my sister, my husband). A category never implies a gender.`,
  '- price_min and price_max in pounds, from words like under, upto, over, from, between. A number without a price word or £ is not a price.',
  '',
  '"residual" lists the words that name none of the above and should be matched against listing titles instead: brand and designer names, weave and craft names (banarasi, chikankari, phulkari, zardozi, gota), and anything else specific about the piece. Write each in Latin letters, lowercased, transliterating from other scripts. Leave out filler (I want, please, for, to, outfit, something, kuch, chahiye, lagbe) and every word you mapped.',
  'If the member rules something out (not green, no sequins, without dupatta), leave that thing out entirely: filters cannot exclude, and it must not appear in residual.',
  'Never add a filter the member did not ask for. When unsure whether a word is a filter, put it in residual.',
].join('\n');

const list = (values: readonly string[]) => ({ type: 'array', items: { type: 'string', enum: [...values] } });

export const SEARCH_PARSE_SCHEMA = {
  type: 'object',
  properties: {
    categories: list(CATEGORIES),
    colours:    list(COLOURS),
    occasions:  list(OCCASIONS),
    fabrics:    list(FABRICS),
    sizes:      list(SIZES),
    conditions: list(CONDITIONS),
    gender:     { anyOf: [{ type: 'string', enum: [...GENDERS] }, { type: 'null' }] },
    price_min:  { anyOf: [{ type: 'number' }, { type: 'null' }] },
    price_max:  { anyOf: [{ type: 'number' }, { type: 'null' }] },
    residual:   { type: 'array', items: { type: 'string' } },
  },
  required: ['categories', 'colours', 'occasions', 'fabrics', 'sizes', 'conditions', 'gender', 'price_min', 'price_max', 'residual'],
  additionalProperties: false,
} as const;

/** The same shape as ParsedSearch in lib/searchParse.ts. */
export interface SearchParse {
  categories: string[];
  colours: string[];
  occasions: string[];
  fabrics: string[];
  sizes: string[];
  conditions: string[];
  gender: string | null;
  priceMin: number | null;
  priceMax: number | null;
  residual: string[];
}

/** "Other" is a listing value, never a useful filter. */
function fromList(value: unknown, allowed: readonly string[], max = 3): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) if (typeof v === 'string' && v !== 'Other' && allowed.includes(v) && !out.includes(v)) out.push(v);
  return out.slice(0, max);
}

function price(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_PRICE, Math.round(value * 100) / 100);
}

/** Leftover words as the title search will use them: letters and digits only, lowercased, at most six. */
export function cleanResidual(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    for (const word of v.toLowerCase().split(/\s+/)) {
      const w = word.replace(/[^\p{L}\p{M}\p{N}]/gu, '').slice(0, 30);
      if (w && !out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, 6);
}

/** Defensive on purpose: a value outside the lists is dropped, a bad shape is an empty parse. */
export function normaliseSearchParse(raw: unknown): SearchParse {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let priceMin = price(r.price_min);
  let priceMax = price(r.price_max);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  return {
    categories: fromList(r.categories, CATEGORIES),
    colours:    fromList(r.colours, COLOURS),
    occasions:  fromList(r.occasions, OCCASIONS),
    fabrics:    fromList(r.fabrics, FABRICS),
    sizes:      fromList(r.sizes, SIZES),
    conditions: fromList(r.conditions, CONDITIONS),
    gender:     typeof r.gender === 'string' && GENDERS.includes(r.gender) ? r.gender : null,
    priceMin,
    priceMax,
    residual:   cleanResidual(r.residual),
  };
}

/** The cache key: what two members who typed the same thing have in common. */
export function normaliseQueryKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s£.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_CHARS);
}
