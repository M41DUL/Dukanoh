import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

// Refetch when a screen regains React Navigation focus.
// Skips the first focus because useQuery already fetched on mount —
// without that guard you get a duplicate fetch on initial render.
export function useRefreshOnFocus<T>(refetch: () => Promise<T>) {
  const firstTimeRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstTimeRef.current) {
        firstTimeRef.current = false;
        return;
      }
      refetch();
    }, [refetch])
  );
}
