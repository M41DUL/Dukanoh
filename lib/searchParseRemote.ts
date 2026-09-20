/**
 * The network half of search parsing. The dictionary (lib/searchParse.ts)
 * runs first on the phone; when words are left over, the whole phrase goes to
 * the parse-search Edge Function, which answers from its cache or asks Claude
 * once. The member never waits longer than the timeout: on a slow or failed
 * answer the dictionary's parse is used on its own.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import { coerceParsed, searchQueryKey, type ParsedSearch } from '@/lib/searchParse';
import type { ParseSource } from '@/lib/searchParams';

export interface RemoteParse {
  parse: ParsedSearch;
  source: ParseSource;
}

export async function fetchRemoteParse(term: string, timeoutMs = 3000): Promise<RemoteParse | null> {
  try {
    const invoke = supabase.functions.invoke('parse-search', { body: { query: term } });
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
    const res = await Promise.race([invoke, timeout]);
    if (!res || res.error || !res.data || typeof res.data !== 'object') return null;
    const data = res.data as { parse?: unknown; source?: unknown };
    if (!data.parse) return null;
    return { parse: coerceParsed(data.parse), source: data.source === 'cache' ? 'cache' : 'claude' };
  } catch {
    return null;
  }
}

/**
 * One row per search the app ran: the phrase, how it was read, which layer
 * read it and how many results came back. No member id. The zero-result
 * phrases are what to add to the dictionary next. Fire and forget.
 */
export function recordSearchEvent(args: { term: string; parse: object; source: ParseSource; resultCount: number }): void {
  const key = searchQueryKey(args.term);
  if (!key) return;
  supabase
    .from('search_events')
    .insert({ query_norm: key, parse: args.parse as unknown as Json, source: args.source, result_count: args.resultCount })
    .then(() => {}, () => {});
}
