import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_FEE_PERCENT, DEFAULT_FEE_FLAT } from '@/lib/paymentHelpers';

interface FeeConfig {
  feePercent: number;
  feeFlat: number;
}

const DEFAULT_CONFIG: FeeConfig = { feePercent: DEFAULT_FEE_PERCENT, feeFlat: DEFAULT_FEE_FLAT };
const FeeConfigContext = createContext<FeeConfig>(DEFAULT_CONFIG);

export function FeeConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<FeeConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['protection_fee_percent', 'protection_fee_flat'])
      .then(({ data }) => {
        if (!data) return;
        const row = (k: string) => data.find(r => r.key === k)?.value;
        const percent = parseFloat(row('protection_fee_percent') ?? '');
        const flat = parseFloat(row('protection_fee_flat') ?? '');
        setConfig({
          feePercent: isNaN(percent) ? DEFAULT_FEE_PERCENT : percent,
          feeFlat: isNaN(flat) ? DEFAULT_FEE_FLAT : flat,
        });
      });
  }, []);

  return <FeeConfigContext.Provider value={config}>{children}</FeeConfigContext.Provider>;
}

export const useFeeConfig = () => useContext(FeeConfigContext);
