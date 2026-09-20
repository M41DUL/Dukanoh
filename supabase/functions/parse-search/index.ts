/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
/* eslint-enable import/no-unresolved */
import { DEFAULT_MODEL, modelOptions, parseJsonAnswer } from '../_shared/claudeRecognition.ts';
import {
  MAX_QUERY_CHARS,
  normaliseQueryKey,
  normaliseSearchParse,
  SEARCH_PARSE_SCHEMA,
  SEARCH_PARSE_SYSTEM_PROMPT,
  SEARCH_PARSE_VERSION,
  type SearchParse,
} from '../_shared/searchParsePrompt.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Search parse ─────────────────────────────────────────────────────────────
//
// The phone's dictionary (lib/searchParse.ts) turns most searches into filters
// on its own. When words are left over, the app sends the whole phrase here.
// The first time a phrase is seen, Claude maps it to the taxonomy and the
// answer is cached in search_parses by the normalised phrase; every later
// member typing the same thing gets the cached answer. No member id is stored.
//
// Request:  { query }
// Response: 200 { parse, source: 'cache' | 'claude' }   — parse is null when
//                                                        the model could not
//                                                        answer; the app then
//                                                        uses its own parse.
//           400 { error } · 401 { error }

async function askClaude(query: string, model: string): Promise<SearchParse | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  // One try and a short timeout: the member is waiting on the search bar.
  const client = new Anthropic({ apiKey, timeout: 6_000, maxRetries: 0 });
  const opts = modelOptions(model);
  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: SEARCH_PARSE_SCHEMA } };
  if (opts.output_config_effort) outputConfig.effort = opts.output_config_effort;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      system: [{ type: 'text', text: SEARCH_PARSE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Search: ${query}` }],
      output_config: outputConfig,
      ...(opts.thinking ? { thinking: opts.thinking } : {}),
    } as never);
    if (response.stop_reason === 'refusal') return null;
    const parsed = parseJsonAnswer(response.content);
    return parsed === null ? null : normaliseSearchParse(parsed);
  } catch (err) {
    console.error('Claude search parse error:', (err as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const body = await req.json();
    const raw = typeof body?.query === 'string' ? body.query : '';
    const key = normaliseQueryKey(raw);
    if (!key) return json({ error: 'No query' }, 400);
    if (raw.length > MAX_QUERY_CHARS * 4) return json({ error: 'Query too long' }, 400);

    const { data: hit } = await admin
      .from('search_parses')
      .select('parse, hits')
      .eq('query_norm', key)
      .maybeSingle();
    if (hit?.parse) {
      admin.from('search_parses')
        .update({ hits: (hit.hits ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq('query_norm', key)
        .then(() => {}, () => {});
      return json({ parse: hit.parse, source: 'cache' });
    }

    const { data: setting } = await admin.from('platform_settings').select('value').eq('key', 'recognition_model').maybeSingle();
    const model = setting?.value ?? DEFAULT_MODEL;
    const parse = await askClaude(key, model);
    if (parse) {
      admin.from('search_parses')
        .upsert({ query_norm: key, parse, model, version: SEARCH_PARSE_VERSION }, { onConflict: 'query_norm' })
        .then(() => {}, () => {});
    }
    return json({ parse, source: 'claude' });
  } catch (err) {
    console.error('parse-search error:', (err as Error).message);
    return json({ parse: null, source: 'claude' });
  }
});
