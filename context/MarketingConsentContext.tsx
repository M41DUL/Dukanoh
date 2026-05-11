import React, { createContext, useCallback, useContext, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { MarketingConsentSheet } from '@/components/MarketingConsentSheet';
import { shouldShowMarketingConsentSheet } from '@/lib/marketingConsent';

interface MarketingConsentContextValue {
  // Call from a "moment of value" (currently first save). The provider
  // checks the gate (not yet asked, not yet opted in, onboarding done) and
  // shows the sheet at most once per user. Safe to call from anywhere.
  requestShow: () => Promise<void>;
}

const MarketingConsentContext = createContext<MarketingConsentContextValue>({
  requestShow: async () => {},
});

export function MarketingConsentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  const requestShow = useCallback(async () => {
    if (!user || visible) return;

    const { data } = await supabase
      .from('users')
      .select('marketing_push_consent, marketing_prompted_at, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (!data) return;
    if (!shouldShowMarketingConsentSheet(data)) return;

    setVisible(true);
  }, [user, visible]);

  const handleAnswer = useCallback(async (consent: boolean) => {
    setVisible(false);
    if (!user) return;
    await supabase
      .from('users')
      .update({
        marketing_push_consent: consent,
        marketing_prompted_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }, [user]);

  return (
    <MarketingConsentContext.Provider value={{ requestShow }}>
      {children}
      <MarketingConsentSheet visible={visible} onAnswer={handleAnswer} />
    </MarketingConsentContext.Provider>
  );
}

export function useMarketingConsent() {
  return useContext(MarketingConsentContext);
}
