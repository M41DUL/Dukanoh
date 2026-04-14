import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { WalletSheet } from '@/components/WalletSheet';

// Thin route wrapper — opens the WalletSheet immediately on mount.
// Handles deep links from stripe-onboarding and settings that push /wallet.
export default function WalletRoute() {
  const [visible, setVisible] = useState(true);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => router.back(), 250);
  };

  return (
    <ScreenWrapper>
      <WalletSheet visible={visible} onClose={handleClose} />
    </ScreenWrapper>
  );
}
