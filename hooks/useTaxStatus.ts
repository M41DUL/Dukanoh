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

    // The hold itself is applied by the apply_tax_hold_on_threshold trigger
    // on `orders`. This used to write tax_hold from here, but tax_hold is a
    // pinned column and the write was silently refused every time — the
    // automatic hold never once applied. `overThreshold` below still drives
    // the banner immediately, without waiting for the next completed order.

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
