import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * UK PIRRR 2023 / DAC7. The legal threshold is 30 sales or €2,000 in a
 * calendar year. Sales counts are fixed (ask at 29 so the 30th cannot happen
 * without a TIN; warn from 25). The sterling stand-in for €2,000 lives in
 * platform_settings so it can be adjusted each January without a build:
 *   tax_gross_threshold_gbp — pause listings / ask for details (default 1690)
 *   tax_warn_gross_gbp      — show the approaching-threshold banner (default 1500)
 * The database triggers read the same setting.
 */
export const TAX_COUNT_THRESHOLD = 29;
export const TAX_WARN_COUNT = 25;
export const DEFAULT_TAX_GROSS_GBP = 1690;
export const DEFAULT_TAX_WARN_GBP = 1500;

export interface TaxThresholds {
  grossGbp: number;
  warnGbp: number;
}

export async function fetchTaxThresholds(): Promise<TaxThresholds> {
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['tax_gross_threshold_gbp', 'tax_warn_gross_gbp']);
  const row = (k: string) => data?.find(r => r.key === k)?.value;
  const gross = parseFloat(row('tax_gross_threshold_gbp') ?? '');
  const warn = parseFloat(row('tax_warn_gross_gbp') ?? '');
  return {
    grossGbp: Number.isFinite(gross) && gross > 0 ? gross : DEFAULT_TAX_GROSS_GBP,
    warnGbp: Number.isFinite(warn) && warn > 0 ? warn : DEFAULT_TAX_WARN_GBP,
  };
}

export function useTaxThresholds(): TaxThresholds {
  const [t, setT] = useState<TaxThresholds>({ grossGbp: DEFAULT_TAX_GROSS_GBP, warnGbp: DEFAULT_TAX_WARN_GBP });
  useEffect(() => {
    let cancelled = false;
    fetchTaxThresholds().then(v => { if (!cancelled) setT(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return t;
}

export interface TaxStatus {
  yearSales: number;
  yearCount: number;
  hasTin: boolean;
  taxHold: boolean;
  thresholds: TaxThresholds;
}

export function useTaxStatus(userId: string | undefined) {
  const [status, setStatus] = useState<TaxStatus | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const [userRes, ordersRes, thresholds] = await Promise.all([
      supabase
        .from('users')
        .select('tax_id_collected_at, tax_hold')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id, item_price')
        .eq('seller_id', userId)
        .eq('status', 'completed')
        .gte('created_at', yearStart),
      fetchTaxThresholds(),
    ]);
    const orders = (ordersRes.data ?? []) as { id: string; item_price: number }[];
    const yearCount = orders.length;
    const yearSales = orders.reduce((s, o) => s + (o.item_price ?? 0), 0);
    const hasTin = !!userRes.data?.tax_id_collected_at;
    const taxHold = !!userRes.data?.tax_hold;
    const overThreshold = yearCount >= TAX_COUNT_THRESHOLD || yearSales >= thresholds.grossGbp;

    // The hold itself is applied by the apply_tax_hold_on_threshold trigger
    // on `orders`, which reads the same setting. `overThreshold` drives the
    // banner immediately, without waiting for the next completed order.

    setStatus({
      yearCount,
      yearSales,
      hasTin,
      taxHold: taxHold || (overThreshold && !hasTin),
      thresholds,
    });
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { taxStatus: status, reloadTaxStatus: fetch };
}
