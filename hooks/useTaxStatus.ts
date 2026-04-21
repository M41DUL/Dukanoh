import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface TaxStatus {
  yearSales: number;
  yearCount: number;
  hasTin: boolean;
  taxHold: boolean;
}

export function useTaxStatus(userId: string | undefined) {
  const [status, setStatus] = useState<TaxStatus | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const [userRes, ordersRes] = await Promise.all([
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
    ]);
    const orders = (ordersRes.data ?? []) as { id: string; item_price: number }[];
    const yearCount = orders.length;
    const yearSales = orders.reduce((s, o) => s + (o.item_price ?? 0), 0);
    const hasTin = !!userRes.data?.tax_id_collected_at;
    const taxHold = !!userRes.data?.tax_hold;
    const overThreshold = yearCount >= 29 || yearSales >= 1690;

    // Auto-set tax_hold in DB when threshold is crossed and no TIN on file
    if (overThreshold && !hasTin && !taxHold) {
      await supabase.from('users').update({ tax_hold: true }).eq('id', userId);
    }

    setStatus({
      yearCount,
      yearSales,
      hasTin,
      taxHold: taxHold || (overThreshold && !hasTin),
    });
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { taxStatus: status, reloadTaxStatus: fetch };
}
