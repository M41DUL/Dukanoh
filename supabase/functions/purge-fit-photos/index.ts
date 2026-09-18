/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Nightly (pg_cron → pg_net, x-dukanoh-key = INTERNAL_API_KEY): deletes Dukanoh
// Fit photos older than the retention period, files and label rows together.
//
// Privacy §2/§4/§14 promise an unlinked copy is kept "up to 24 months". The
// photos carry no member id by design (garment_labels_fit_rows_unlinked), so
// this job is the only thing that can ever remove them. Files must go through
// the Storage API — deleting storage.objects rows in SQL leaves the bytes
// behind — hence an edge function rather than a plain SQL cron.
//
// Retention lives in platform_settings.fit_photo_retention_months (default 24)
// so it can change without a deploy.

const BUCKET = 'fit-training';
const PREFIX = `storage://${BUCKET}/`;
const DEFAULT_MONTHS = 24;
const BATCH = 100;

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const apiKey = Deno.env.get('INTERNAL_API_KEY');
  const providedKey = req.headers.get('x-dukanoh-key');
  if (!apiKey || !providedKey || !timingSafeEqual(providedKey, apiKey)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: setting } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'fit_photo_retention_months')
    .maybeSingle();
  const months = Number.parseInt(setting?.value ?? '', 10);
  const retentionMonths = Number.isFinite(months) && months > 0 ? months : DEFAULT_MONTHS;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);

  const { data: rows, error: selectError } = await admin
    .from('garment_labels')
    .select('id, image_url')
    .eq('source', 'fit')
    .lt('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true })
    .limit(1000);
  if (selectError) return json({ error: selectError.message }, 500);

  let filesRemoved = 0;
  let rowsDeleted = 0;
  const failures: string[] = [];

  for (let i = 0; i < (rows ?? []).length; i += BATCH) {
    const chunk = (rows ?? []).slice(i, i + BATCH);
    const paths = chunk
      .map(r => (r.image_url.startsWith(PREFIX) ? r.image_url.slice(PREFIX.length) : null))
      .filter((p): p is string => !!p);

    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
      if (removeError) {
        // Keep the rows so the next run retries; a row without its file is
        // worse than a file without its row.
        failures.push(removeError.message);
        continue;
      }
      filesRemoved += paths.length;
    }

    const { error: deleteError } = await admin
      .from('garment_labels')
      .delete()
      .in('id', chunk.map(r => r.id));
    if (deleteError) {
      failures.push(deleteError.message);
      continue;
    }
    rowsDeleted += chunk.length;
  }

  return json({
    retention_months: retentionMonths,
    cutoff: cutoff.toISOString(),
    candidates: rows?.length ?? 0,
    files_removed: filesRemoved,
    rows_deleted: rowsDeleted,
    failures,
  });
});
