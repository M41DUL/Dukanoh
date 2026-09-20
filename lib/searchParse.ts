/**
 * Turns what a member types into the search bar into the filters the listings
 * screen already has, so "laal lehenga for shaadi under 150" opens Lehenga ·
 * Red · Wedding · up to £150 with nothing left to text-match. Runs on the
 * phone, instantly and for free; words it cannot place come back in
 * `residual`, and the caller may ask Claude about those (see
 * supabase/functions/parse-search).
 *
 * Only what the words say is set: a category never implies a gender and a
 * fabric never implies an occasion. Pure module, no React, unit tested.
 */
import { Categories, Colours, Conditions, Fabrics, Occasions, Sizes } from '@/constants/theme';

export type Gender = 'Men' | 'Women';

export interface ParsedSearch {
  categories: string[];
  colours: string[];
  occasions: string[];
  fabrics: string[];
  sizes: string[];
  conditions: string[];
  gender: Gender | null;
  priceMin: number | null;
  priceMax: number | null;
  /** Words the dictionary could not place, lowercased, in the order typed. */
  residual: string[];
}

type Facet = 'categories' | 'colours' | 'occasions' | 'fabrics' | 'sizes' | 'conditions';

interface Term {
  categories?: string[];
  colours?: string[];
  occasions?: string[];
  fabrics?: string[];
  sizes?: string[];
  conditions?: string[];
  gender?: Gender;
}

export const MAX_PRICE = 2000;

// ─── The dictionary ───────────────────────────────────────────────────────────
// Keys are how members write; values are the taxonomy. Multi-word keys win
// over single words at the same position ("salwar kameez" before "salwar").

const CATEGORY_WORDS: Record<string, string[]> = {
  Lehenga:         ['lehenga', 'lehengas', 'lehnga', 'lengha', 'lehanga', 'lehengha', 'langa', 'ghagra', 'ghaghra', 'chaniya choli', 'lehenga choli', 'ghagra choli'],
  Saree:           ['saree', 'sarees', 'sari', 'saris', 'saari', 'sharee', 'shari'],
  Anarkali:        ['anarkali', 'anarkalis', 'anarkli', 'frock', 'frocks'],
  'Salwar Kameez': ['salwar kameez', 'shalwar kameez', 'salwar suit', 'shalwar suit', 'salwar kamiz', 'shalwar qameez', 'shalwar kamiz', 'kameez', 'kamiz', 'qameez', 'suit', 'suits', 'jora', 'joda', '3 piece', 'three piece', '2 piece', 'two piece', 'punjabi suit', 'patiala suit', 'pakistani suit', 'indian suit', 'churidar suit', 'trouser suit', 'palazzo suit', 'lawn suit', 'cotton suit', 'silk suit', 'chiffon suit', 'unstitched suit', 'ready to wear suit'],
  Kurta:           ['kurta', 'kurtas', 'kurti', 'kurtis', 'kurtha'],
  Sharara:         ['sharara', 'shararas', 'gharara', 'ghararas', 'garara', 'sharara suit', 'gharara suit', 'farshi gharara'],
  Gown:            ['gown', 'gowns', 'dress', 'dresses', 'maxi', 'maxis'],
  Dupatta:         ['dupatta', 'dupattas', 'dupata', 'duppata', 'chunni', 'chunri', 'chunari', 'odhni', 'odni', 'stole', 'shawl'],
  Blouse:          ['blouse', 'blouses', 'choli', 'cholis', 'saree blouse'],
  Salwar:          ['salwar', 'shalwar', 'churidar', 'churidaar', 'palazzo', 'palazzos', 'pyjama', 'pajama', 'trousers', 'bottoms', 'pants'],
  Sherwani:        ['sherwani', 'sherwanis', 'shervani'],
  'Kurta Pajama':  ['kurta pajama', 'kurta pyjama', 'kurta pajamas', 'kurta set', 'kurta shalwar', 'kurta salwar'],
  Achkan:          ['achkan', 'achkans', 'jodhpuri', 'bandhgala', 'bandh gala', 'prince coat'],
  'Pathani Suit':  ['pathani', 'pathani suit', 'pathaani', 'afghani suit'],
  'Nehru Jacket':  ['nehru jacket', 'nehru', 'waistcoat', 'waist coat', 'koti', 'modi jacket', 'jacket'],
  Jewellery:       ['jewellery', 'jewelry', 'jewellry', 'jhumka', 'jhumkas', 'jhumki', 'earrings', 'earring', 'necklace', 'necklaces', 'tikka', 'maang tikka', 'matha patti', 'bangles', 'bangle', 'churiyan', 'kangan', 'kada', 'kalgi', 'choker', 'haar', 'rani haar', 'nath', 'nose ring', 'anklet', 'payal', 'jewellery set'],
  Accessories:     ['accessories', 'accessory', 'bag', 'bags', 'clutch', 'potli', 'safa', 'turban', 'pagri', 'belt', 'brooch', 'sehra'],
  Casualwear:      ['jeans', 'tshirt', 't shirt', 'hoodie', 'casualwear', 'casual wear'],
  Shoes:           ['shoes', 'shoe', 'jutti', 'juttis', 'khussa', 'khussas', 'mojari', 'mojaris', 'heels', 'sandals', 'footwear', 'chappal', 'kolhapuri', 'kolhapuris', 'trainers', 'sneakers'],
};

const COLOUR_WORDS: Record<string, string[]> = {
  Black:  ['black', 'kala', 'kaala', 'kalo'],
  White:  ['white', 'safed', 'sufaid', 'shada'],
  Cream:  ['cream', 'beige', 'ivory', 'off white', 'offwhite', 'nude', 'oatmeal', 'ecru'],
  Grey:   ['grey', 'gray', 'charcoal', 'slate'],
  Silver: ['silver', 'chandi'],
  Red:    ['red', 'laal', 'lal', 'surkh', 'scarlet', 'crimson', 'cherry'],
  Maroon: ['maroon', 'mehroon', 'wine', 'burgundy', 'oxblood', 'deep red'],
  Pink:   ['pink', 'gulabi', 'rose', 'blush', 'baby pink', 'hot pink', 'fuchsia', 'fuschia', 'magenta', 'rani pink', 'rani', 'dusty pink', 'dusky pink'],
  Peach:  ['peach', 'coral', 'salmon', 'apricot'],
  Orange: ['orange', 'rust', 'narangi', 'tangerine', 'burnt orange'],
  Yellow: ['yellow', 'peela', 'peeli', 'mustard', 'lemon'],
  Gold:   ['gold', 'golden', 'sona', 'sunehri', 'sunehra', 'champagne', 'antique gold'],
  Green:  ['green', 'hara', 'hari', 'sabz', 'mint', 'sage', 'olive', 'emerald', 'bottle green', 'pista', 'pistachio', 'lime', 'forest green', 'dark green', 'light green'],
  Teal:   ['teal', 'turquoise', 'firozi', 'feroza', 'ferozi', 'aqua', 'cyan', 'sea green'],
  Blue:   ['blue', 'neela', 'neeli', 'nila', 'royal blue', 'sky blue', 'cobalt', 'powder blue', 'light blue', 'baby blue', 'electric blue'],
  Navy:   ['navy', 'navy blue', 'midnight blue', 'dark blue'],
  Purple: ['purple', 'lavender', 'lilac', 'mauve', 'plum', 'violet', 'baingani', 'aubergine', 'grape'],
  Multi:  ['multi', 'multicolour', 'multicolor', 'multi colour', 'multi color', 'multicoloured', 'rainbow', 'colourful', 'colorful'],
};

const OCCASION_WORDS: Record<string, string[]> = {
  Everyday: ['everyday', 'casual', 'daily', 'daily wear', 'day wear', 'everyday wear'],
  Eid:      ['eid', 'eidi', 'eid outfit', 'eid wear', 'ramadan', 'ramzan', 'chand raat'],
  Diwali:   ['diwali', 'deepavali', 'dhanteras'],
  Festive:  ['festive', 'festival', 'puja', 'pooja', 'durga puja', 'navratri', 'garba', 'dandiya', 'holi', 'pongal', 'onam', 'vaisakhi', 'baisakhi', 'lohri', 'karva chauth', 'teej', 'bihu', 'poila boishakh', 'pohela boishakh', 'nowruz', 'festive wear'],
  Wedding:  ['wedding', 'weddings', 'shaadi', 'shadi', 'bridal', 'bride', 'dulhan', 'walima', 'valima', 'nikah', 'nikkah', 'nikaah', 'reception', 'baraat', 'barat', 'bridesmaid', 'wedding guest', 'marriage', 'biye', 'bou bhaat', 'groom', 'dulha'],
  Mehndi:   ['mehndi', 'mehendi', 'mehandi', 'henna', 'haldi', 'holud', 'gaye holud', 'mayun', 'mayoon', 'dholki'],
  Party:    ['party', 'party wear', 'partywear', 'evening', 'cocktail', 'sangeet', 'engagement', 'birthday', 'dinner'],
  Formal:   ['formal', 'formals', 'office', 'work wear', 'smart', 'black tie', 'graduation', 'interview'],
};

const FABRIC_WORDS: Record<string, string[]> = {
  Silk:      ['silk', 'silks', 'resham', 'raw silk', 'pure silk', 'art silk', 'tussar', 'tussar silk', 'kanjeevaram', 'kanjivaram', 'kanchipuram', 'mysore silk'],
  Chiffon:   ['chiffon', 'shiffon'],
  Georgette: ['georgette', 'jorjet', 'georgett', 'georgete'],
  Cotton:    ['cotton', 'cottons', 'sooti', 'suti', 'khadi', 'khaddar', 'mulmul', 'mul mul'],
  Lawn:      ['lawn', 'lawn suit'],
  Velvet:    ['velvet', 'velvets', 'makhmal'],
  Net:       ['net', 'netted', 'tulle'],
  Organza:   ['organza', 'organzas'],
  Satin:     ['satin', 'satins'],
  Crepe:     ['crepe'],
  Brocade:   ['brocade', 'jamawar', 'jamavar', 'kimkhab', 'kinkhab', 'jacquard'],
  Linen:     ['linen', 'linens'],
};

const SIZE_WORDS: Record<string, string[]> = {
  XS:         ['xs', 'extra small', 'x small', 'xsmall', 'size xs', 'size 6', 'uk 6', 'size 8', 'uk 8'],
  S:          ['small', 'size s', 'size small', 'size 10', 'uk 10'],
  M:          ['medium', 'med', 'size m', 'size medium', 'size 12', 'uk 12'],
  L:          ['large', 'size l', 'size large', 'size 14', 'uk 14'],
  XL:         ['xl', 'extra large', 'x large', 'xlarge', 'size xl', 'size 16', 'uk 16'],
  XXL:        ['xxl', '2xl', 'xx large', 'xxlarge', 'size xxl', 'size 18', 'uk 18', 'size 20', 'uk 20'],
  'One size': ['one size', 'free size', 'onesize', 'freesize'],
  Custom:     ['custom', 'custom size', 'made to measure', 'tailored'],
};

const CONDITION_WORDS: Record<string, string[]> = {
  New:       ['new', 'brand new', 'bnwt', 'bnwot', 'nwt', 'unworn', 'never worn', 'with tags', 'unused'],
  Excellent: ['excellent', 'like new', 'barely worn', 'worn once', 'mint condition', 'as new'],
  Good:      ['good', 'good condition'],
  Fair:      ['fair', 'fair condition'],
};

const GENDER_WORDS: Record<Gender, string[]> = {
  Men:   ['men', 'mens', 'man', 'male', 'gents', 'gent', 'gentlemen', 'him', 'for him', 'boys', 'boy', 'husband', 'groom', 'dulha', 'mard', 'larka', 'larkay', 'chele', 'cheleder'],
  Women: ['women', 'womens', 'woman', 'ladies', 'lady', 'female', 'her', 'for her', 'girls', 'girl', 'wife', 'bride', 'bridal', 'dulhan', 'aurat', 'larki', 'meye', 'meyeder'],
};

/** Words that carry no filter and should not be text-matched either. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'my', 'me', 'i', 'im', 'want', 'need', 'looking', 'look',
  'find', 'some', 'something', 'any', 'please', 'pls', 'is', 'it', 'this', 'that', 'these', 'those', 'size', 'sizes', 'colour', 'color',
  'coloured', 'colored', 'wear', 'outfit', 'outfits', 'clothes', 'clothing', 'kapray', 'kapde', 'kapra', 'set', 'sets', 'piece', 'pieces',
  'pc', 'pcs', 'style', 'type', 'kind', 'under', 'over', 'below', 'above', 'less', 'more', 'than', 'upto', 'up', 'max', 'min', 'budget',
  'cheap', 'cheapest', 'affordable', 'price', 'pounds', 'quid', 'gbp', 'buy', 'sell', 'sale', 'dukanoh', 'uk', 'from', 'by', 'like',
  'wala', 'wali', 'wale', 'ka', 'ki', 'ke', 'liye', 'chahiye', 'hai', 'ho', 'aur', 'ya', 'ek', 'koi', 'main', 'mujhe', 'chai', 'ami',
  'amar', 'jonno', 'lagbe', 'dorkar', 'ta', 'ekta', 'kono', 'ready', 'stitched', 'stitch', 'jama', 'kapor', 'poshak', 'smth', 'sth',
  'nice', 'pretty', 'lovely',
]);

// ─── Lookup tables built once ────────────────────────────────────────────────

const TERMS = new Map<string, Term>();
function addTerms(table: Record<string, string[]>, facet: Facet, allowed: readonly string[]) {
  for (const [value, keys] of Object.entries(table)) {
    if (!allowed.includes(value)) throw new Error(`searchParse: "${value}" is not in the taxonomy for ${facet}`);
    for (const key of keys) {
      const term = TERMS.get(key) ?? {};
      term[facet] = [...(term[facet] ?? []), value];
      TERMS.set(key, term);
    }
  }
}
addTerms(CATEGORY_WORDS, 'categories', Categories);
addTerms(COLOUR_WORDS, 'colours', Colours);
addTerms(OCCASION_WORDS, 'occasions', Occasions);
addTerms(FABRIC_WORDS, 'fabrics', Fabrics);
addTerms(SIZE_WORDS, 'sizes', Sizes);
addTerms(CONDITION_WORDS, 'conditions', Conditions);
for (const [gender, keys] of Object.entries(GENDER_WORDS) as [Gender, string[]][]) {
  for (const key of keys) {
    const term = TERMS.get(key) ?? {};
    term.gender = gender;
    TERMS.set(key, term);
  }
}

const MAX_KEY_WORDS = Math.max(...[...TERMS.keys()].map(k => k.split(' ').length));
/** Single-word keys of four letters or more, the pool for typo matching. */
const FUZZY_KEYS = [...TERMS.keys()].filter(k => !k.includes(' ') && /^\p{L}{4,}$/u.test(k));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’']/g, '')                              // men's -> mens
    .replace(/(?<!\d)[–—-]|[–—-](?!\d)/g, ' ')  // off-white -> off white; 50-100 stays a range
    .replace(/[^\p{L}\p{M}\p{N}\s£.-]/gu, ' ')                    // marks kept, so Bengali and Devanagari words stay whole
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let left = i;
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const cur = Math.min(prev[j] + 1, left + 1, sub);
      prev[j - 1] = left;
      left = cur;
    }
    prev[b.length] = left;
  }
  return prev[b.length];
}

/** A typo away from a known word: one edit for five letters or more, two for eight or more, and only when unambiguous. */
function fuzzyKey(word: string): string | null {
  if (!/^\p{L}{5,}$/u.test(word)) return null;
  const allowed = word.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestDist = allowed + 1;
  let ties = 0;
  for (const key of FUZZY_KEYS) {
    const d = levenshtein(word, key);
    if (d < bestDist) { best = key; bestDist = d; ties = 1; }
    else if (d === bestDist) ties += 1;
  }
  return best && bestDist <= allowed && ties === 1 ? best : null;
}

function lookup(phrase: string): Term | undefined {
  const direct = TERMS.get(phrase);
  if (direct) return direct;
  if (phrase.includes(' ')) return undefined;
  // plurals the tables did not list
  if (phrase.endsWith('es') && TERMS.has(phrase.slice(0, -2))) return TERMS.get(phrase.slice(0, -2));
  if (phrase.endsWith('s') && TERMS.has(phrase.slice(0, -1))) return TERMS.get(phrase.slice(0, -1));
  const fuzzy = fuzzyKey(phrase);
  return fuzzy ? TERMS.get(fuzzy) : undefined;
}

const PRICE_WORD = '(?:pounds?|quid|gbp)';
const NUM = '(\\d+(?:\\.\\d+)?)';
const TO = '(?:to|and|-)';
/** Tried in this order: ranges, then worded maxima and minima, then a bare £ amount. */
const PRICE_PATTERNS: { re: RegExp; kind: 'max' | 'min' | 'range' }[] = [
  { re: new RegExp(`£\\s*${NUM}\\s*${TO}\\s*£?\\s*${NUM}|${NUM}\\s*${TO}\\s*£\\s*${NUM}|${NUM}\\s*${TO}\\s*${NUM}\\s*${PRICE_WORD}`, 'g'), kind: 'range' },
  { re: new RegExp(`(?:under|below|less than|upto|up to|max(?:imum)?|within|budget(?: of)?|no more than)\\s*£?\\s*${NUM}\\s*(?:${PRICE_WORD}|£)?`, 'g'), kind: 'max' },
  { re: new RegExp(`(?:over|above|more than|min(?:imum)?|at least|from)\\s*£?\\s*${NUM}\\s*(?:${PRICE_WORD})?(?=\\s|$)`, 'g'), kind: 'min' },
  { re: new RegExp(`£\\s*${NUM}|${NUM}\\s*${PRICE_WORD}`, 'g'), kind: 'max' },
];

function clampPrice(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_PRICE, Math.round(n * 100) / 100);
}

/** Pulls prices out and returns the text without them. Ranges are read first so "£50 to £100" is not two maxima. */
function extractPrice(text: string): { text: string; priceMin: number | null; priceMax: number | null } {
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  let rest = text;
  for (const { re, kind } of PRICE_PATTERNS) {
    rest = rest.replace(re, (...m: string[]) => {
      const nums = m.slice(1, -2).filter(x => x !== undefined && x !== '').map(Number);
      if (kind === 'range' && nums.length >= 2) {
        priceMin = priceMin ?? clampPrice(Math.min(nums[0], nums[1]));
        priceMax = priceMax ?? clampPrice(Math.max(nums[0], nums[1]));
      } else if (kind === 'max' && nums.length >= 1) {
        priceMax = priceMax ?? clampPrice(nums[0]);
      } else if (kind === 'min' && nums.length >= 1) {
        priceMin = priceMin ?? clampPrice(nums[0]);
      }
      return ' ';
    });
  }
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  return { text: rest.replace(/\s+/g, ' ').trim(), priceMin, priceMax };
}

export function emptyParse(): ParsedSearch {
  return { categories: [], colours: [], occasions: [], fabrics: [], sizes: [], conditions: [], gender: null, priceMin: null, priceMax: null, residual: [] };
}

function push(list: string[], values: string[] | undefined) {
  for (const v of values ?? []) if (!list.includes(v)) list.push(v);
}

// ─── The parser ──────────────────────────────────────────────────────────────

export function parseSearch(raw: string): ParsedSearch {
  const out = emptyParse();
  if (!raw || !raw.trim()) return out;
  const priced = extractPrice(normalise(raw));
  out.priceMin = priced.priceMin;
  out.priceMax = priced.priceMax;

  const words = priced.text.replace(/[£-]/g, ' ').replace(/\.(?!\d)/g, ' ').split(' ').filter(Boolean);
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let n = Math.min(MAX_KEY_WORDS, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      const term = lookup(phrase);
      if (!term) continue;
      push(out.categories, term.categories);
      push(out.colours, term.colours);
      push(out.occasions, term.occasions);
      push(out.fabrics, term.fabrics);
      push(out.sizes, term.sizes);
      push(out.conditions, term.conditions);
      if (term.gender && !out.gender) out.gender = term.gender;
      i += n;
      matched = true;
      break;
    }
    if (matched) continue;
    const word = words[i];
    if (!STOPWORDS.has(word) && !/^\p{N}+$/u.test(word)) out.residual.push(word);
    i += 1;
  }
  return out;
}

/** True when the dictionary placed nothing at all, so the phrase is a plain text search. */
export function isEmptyParse(p: ParsedSearch): boolean {
  return p.categories.length === 0 && p.colours.length === 0 && p.occasions.length === 0 && p.fabrics.length === 0
    && p.sizes.length === 0 && p.conditions.length === 0 && p.gender === null && p.priceMin === null && p.priceMax === null;
}

/** The remote parse takes over the leftovers; everything the dictionary placed stays. */
export function mergeParsed(local: ParsedSearch, remote: ParsedSearch): ParsedSearch {
  const out: ParsedSearch = { ...local, categories: [...local.categories], colours: [...local.colours], occasions: [...local.occasions], fabrics: [...local.fabrics], sizes: [...local.sizes], conditions: [...local.conditions] };
  push(out.categories, remote.categories);
  push(out.colours, remote.colours);
  push(out.occasions, remote.occasions);
  push(out.fabrics, remote.fabrics);
  push(out.sizes, remote.sizes);
  push(out.conditions, remote.conditions);
  out.gender = local.gender ?? remote.gender;
  out.priceMin = local.priceMin ?? remote.priceMin;
  out.priceMax = local.priceMax ?? remote.priceMax;
  out.residual = remote.residual;
  return out;
}

/** Shape-checks a parse that arrived over the network against the theme lists; anything odd is dropped. */
export function coerceParsed(raw: unknown): ParsedSearch {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, allowed: readonly string[]) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)))].slice(0, 3) : [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(MAX_PRICE, v) : null);
  const g = r.gender;
  return {
    categories: pick(r.categories, Categories),
    colours: pick(r.colours, Colours),
    occasions: pick(r.occasions, Occasions),
    fabrics: pick(r.fabrics, Fabrics),
    sizes: pick(r.sizes, Sizes),
    conditions: pick(r.conditions, Conditions),
    gender: g === 'Men' || g === 'Women' ? g : null,
    priceMin: num(r.priceMin),
    priceMax: num(r.priceMax),
    residual: Array.isArray(r.residual)
      ? [...new Set(r.residual
          .filter((x): x is string => typeof x === 'string')
          .map(x => x.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '').slice(0, 30))
          .filter(w => w && !STOPWORDS.has(w) && !/^\p{N}+$/u.test(w)))].slice(0, 6)
      : [],
  };
}

/**
 * The key the server caches parses under. Kept identical to normaliseQueryKey
 * in supabase/functions/_shared/searchParsePrompt.ts, which a test asserts.
 */
export function searchQueryKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s£.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
