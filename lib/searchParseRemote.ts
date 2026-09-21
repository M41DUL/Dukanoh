/**
 * The network half of search parsing. The dictionary (lib/searchParse.ts)
 * runs first on the phone; when words are left over, the whole phrase goes to
 * the parse-search Edge Function, which answers from its cache or asks Claude
 * once.
 *
 * One answer per phrase for the life of the app session: a prefetch started
 * while the member was still typing is the same promise the results screen
 * later awaits, so a phrase is never asked twice and a finished prefetch
 * means no wait at all. A failed answer is dropped so the next search can
 * try again. The results screen never waits longer than its timeout: on a
 * slow answer the dictionary's parse is used on its own.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import { coerceParsed, parseSearch, searchQueryKey, type ParsedSearch } from '@/lib/searchParse';
import type { ParseSource } from '@/lib/searchParams';

export interface RemoteParse {
  parse: ParsedSearch;
  source: ParseSource;
}

const answers = new Map<string, Promise<RemoteParse | null>>();
const MAX_ANSWERS = 30;

async function invokeParse(term: string): Promise<RemoteParse | null> {
  try {
    const res = await supabase.functions.invoke('parse-search', { body: { query: term } });
    if (!res || res.error || !res.data || typeof res.data !== 'object') return null;
    const data = res.data as { parse?: unknown; source?: unknown };
    if (!data.parse) return null;
    return { parse: coerceParsed(data.parse), source: data.source === 'cache' ? 'cache' : 'claude' };
  } catch {
    return null;
  }
}

function askOnce(term: string): Promise<RemoteParse | null> | null {
  const key = searchQueryKey(term);
  if (!key) return null;
  const existing = answers.get(key);
  if (existing) return existing;
  const pending = invokeParse(term).then(result => {
    if (result === null) answers.delete(key);
    return result;
  });
  answers.set(key, pending);
  if (answers.size > MAX_ANSWERS) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) answers.delete(oldest);
  }
  return pending;
}

/**
 * Starts the remote parse in the background when the dictionary leaves words
 * over. Safe to call on every pause while typing: a phrase already asked is
 * not asked again.
 */
export function prefetchRemoteParse(term: string): void {
  if (parseSearch(term).residual.length === 0) return;
  askOnce(term);
}

/** Waits for the phrase's answer (reusing a prefetch if one is running), up to timeoutMs. */
export async function fetchRemoteParse(term: string, timeoutMs = 3000): Promise<RemoteParse | null> {
  const pending = askOnce(term);
  if (!pending) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
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
