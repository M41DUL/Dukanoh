/**
 * Carries a parsed search from the search tab to the listings screen as route
 * parameters, and reads it back. Categories, occasion and query already
 * existed as parameters; the rest are new. Pure and unit tested.
 */
import type { Gender, ParsedSearch } from '@/lib/searchParse';

export type ParseSource = 'rules' | 'claude' | 'cache';

export type SearchParams = Record<string, string>;
type RawParams = Record<string, string | string[] | undefined>;

const LIST_KEYS = ['categories', 'colours', 'occasions', 'fabrics', 'sizes', 'conditions'] as const;

export function parsedToParams(term: string, p: ParsedSearch, source: ParseSource): SearchParams {
  const params: SearchParams = { title: `“${term.trim()}”`, term: term.trim(), src: source };
  for (const key of LIST_KEYS) if (p[key].length > 0) params[key] = p[key].join(',');
  if (p.gender) params.gender = p.gender;
  if (p.priceMin !== null) params.priceMin = String(p.priceMin);
  if (p.priceMax !== null) params.priceMax = String(p.priceMax);
  if (p.residual.length > 0) params.query = p.residual.join(' ');
  return params;
}

export interface ReadSearchParams {
  categories: string[];
  colours: string[];
  occasions: string[];
  fabrics: string[];
  sizes: string[];
  conditions: string[];
  gender: Gender | null;
  priceMin: number | null;
  priceMax: number | null;
  /** The words still to text-match, as one string. */
  query: string;
  /** What the member typed, for the search log. */
  term: string;
  source: ParseSource | null;
}

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');
const list = (v: string | string[] | undefined): string[] => first(v).split(',').map(s => s.trim()).filter(Boolean);
const num = (v: string | string[] | undefined): number | null => {
  const n = Number(first(v));
  return first(v) !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

export function readSearchParams(params: RawParams): ReadSearchParams {
  const gender = first(params.gender);
  const src = first(params.src);
  return {
    categories: list(params.categories),
    colours: list(params.colours),
    occasions: list(params.occasions),
    fabrics: list(params.fabrics),
    sizes: list(params.sizes),
    conditions: list(params.conditions),
    gender: gender === 'Men' || gender === 'Women' ? gender : null,
    priceMin: num(params.priceMin),
    priceMax: num(params.priceMax),
    query: first(params.query).trim(),
    term: first(params.term).trim(),
    source: src === 'rules' || src === 'claude' || src === 'cache' ? src : null,
  };
}
