import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface RecentSale {
  id: string;
  title: string;
  image: string;
  sellerUsername: string;
  soldAt: string;
}

const MIN_SALES = 2;
const ROTATE_MS = 6000;

export function useRecentSales() {
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('listings')
        .select('id, title, images, sold_at, seller:users!listings_seller_id_fkey(username)')
        .eq('status', 'sold')
        .not('sold_at', 'is', null)
        .gte('sold_at', since)
        .order('sold_at', { ascending: false })
        .limit(10);

      if (!data || data.length < MIN_SALES) return;

      setSales(
        data.map(d => ({
          id: d.id,
          title: d.title,
          image: (d.images as string[])?.[0] ?? '',
          sellerUsername: (d.seller as any)?.username ?? '',
          soldAt: d.sold_at as string,
        }))
      );
    })();
  }, []);

  useEffect(() => {
    if (sales.length < MIN_SALES || dismissed) return;

    intervalRef.current = setInterval(() => {
      setIndex(prev => (prev + 1) % sales.length);
    }, ROTATE_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sales, dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const currentSale = sales.length >= MIN_SALES && !dismissed ? sales[index] : null;

  return { currentSale, dismiss };
}
