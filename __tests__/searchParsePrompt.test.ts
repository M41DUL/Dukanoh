// The Claude side of search: the prompt names every list value, the schema
// only allows those values, and the normaliser never lets a stray one through.
import { CATEGORIES, COLOURS, CONDITIONS, FABRICS, OCCASIONS, SIZES } from '../supabase/functions/_shared/garmentTaxonomy';
import {
  cleanResidual, normaliseQueryKey, normaliseSearchParse, SEARCH_PARSE_SCHEMA, SEARCH_PARSE_SYSTEM_PROMPT, SEARCH_PARSE_VERSION,
} from '../supabase/functions/_shared/searchParsePrompt';

describe('prompt and schema', () => {
  test('the prompt names every value the schema allows', () => {
    for (const v of [...CATEGORIES, ...COLOURS, ...OCCASIONS, ...FABRICS, ...SIZES, ...CONDITIONS]) {
      expect(SEARCH_PARSE_SYSTEM_PROMPT).toContain(v);
    }
    expect(SEARCH_PARSE_SYSTEM_PROMPT).toMatch(/Bengali, Devanagari, Gurmukhi or Urdu script/);
    expect(SEARCH_PARSE_SYSTEM_PROMPT).toMatch(/Never add a filter the member did not ask for/);
    expect(SEARCH_PARSE_SYSTEM_PROMPT).toMatch(/A category never implies a gender/);
    expect(SEARCH_PARSE_SYSTEM_PROMPT).toMatch(/filters cannot exclude/);
    expect(SEARCH_PARSE_SYSTEM_PROMPT).toMatch(/palazzo suit/);
    expect(SEARCH_PARSE_VERSION).toMatch(/^search-/);
  });
  test('the schema only allows taxonomy values', () => {
    const e = (k: string) => (SEARCH_PARSE_SCHEMA.properties as Record<string, { items?: { enum?: readonly string[] } }>)[k].items!.enum!;
    expect([...e('categories')]).toEqual([...CATEGORIES]);
    expect([...e('colours')]).toEqual([...COLOURS]);
    expect([...e('sizes')]).toEqual([...SIZES]);
    expect([...e('conditions')]).toEqual([...CONDITIONS]);
    expect(SEARCH_PARSE_SCHEMA.additionalProperties).toBe(false);
    expect(SEARCH_PARSE_SCHEMA.required).toContain('residual');
  });
});

describe('normaliseSearchParse', () => {
  test('a good answer maps straight across', () => {
    expect(normaliseSearchParse({
      categories: ['Lehenga'], colours: ['Red'], occasions: ['Wedding'], fabrics: [], sizes: ['M'], conditions: [],
      gender: 'Women', price_min: null, price_max: 150.456, residual: ['Sabyasachi'],
    })).toEqual({
      categories: ['Lehenga'], colours: ['Red'], occasions: ['Wedding'], fabrics: [], sizes: ['M'], conditions: [],
      gender: 'Women', priceMin: null, priceMax: 150.46, residual: ['sabyasachi'],
    });
  });
  test('values outside the lists are dropped, prices clamped and ordered', () => {
    const r = normaliseSearchParse({ categories: ['Abaya', 'Saree', 'Saree'], colours: ['Beige', 'Other'], fabrics: ['Other'], gender: 'Kids', price_min: 500, price_max: 100000, residual: 'x' });
    expect(r.categories).toEqual(['Saree']);
    expect(r.colours).toEqual([]);
    expect(r.fabrics).toEqual([]);
    expect(r.gender).toBeNull();
    expect(r.priceMin).toBe(500);
    expect(r.priceMax).toBe(2000);
    expect(r.residual).toEqual([]);
    expect(normaliseSearchParse({ price_min: 200, price_max: 50 })).toMatchObject({ priceMin: 50, priceMax: 200 });
  });
  test('garbage is an empty parse', () => {
    expect(normaliseSearchParse(null)).toEqual({ categories: [], colours: [], occasions: [], fabrics: [], sizes: [], conditions: [], gender: null, priceMin: null, priceMax: null, residual: [] });
  });
});

describe('cleanResidual and the cache key', () => {
  test('residual words are lowercased, split, stripped and capped', () => {
    expect(cleanResidual(['Sana Safinaz', 'lawn!', 'লেহেঙ্গা', '', 42, 'a b c d e f g'])).toEqual(['sana', 'safinaz', 'lawn', 'লেহেঙ্গা', 'a', 'b']);
  });
  test('the cache key ignores case, punctuation and spacing', () => {
    expect(normaliseQueryKey("  Men's  RED lehenga!!  ")).toBe('mens red lehenga');
    expect(normaliseQueryKey('lehenga under £150')).toBe('lehenga under £150');
    expect(normaliseQueryKey('x'.repeat(200))).toHaveLength(120);
  });
});
