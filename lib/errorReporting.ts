import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';

// ── Internal sender ───────────────────────────────────────────
// Fire-and-forget. Never throws — a crash in the crash reporter
// would be catastrophic.

async function send(
  message: string,
  stack: string | null,
  isFatal: boolean,
): Promise<void> {
  try {
    await supabase.from('app_errors').insert({
      error_message: message.slice(0, 1000),
      stack_trace:   stack?.slice(0, 5000) ?? null,
      platform:      Platform.OS,
      os_version:    String(Platform.Version),
      app_version:   APP_VERSION,
      is_fatal:      isFatal,
    });
  } catch {
    // Intentionally swallowed — never crash the crash reporter
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Call once in the root layout (_layout.tsx) to activate global
 * error catching. No-op in development — errors surface normally
 * via the Expo dev overlay.
 */
export function initErrorReporting(): void {
  if (__DEV__) return;

  // Unhandled JS errors (hard crashes)
  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    send(error?.message ?? String(error), error?.stack ?? null, isFatal ?? false);
    previousHandler?.(error, isFatal);
  });

  // Unhandled promise rejections
  const prevRejectionHandler = (global as any).onunhandledrejection;
  (global as any).onunhandledrejection = (event: PromiseRejectionEvent) => {
    const err =
      event?.reason instanceof Error
        ? event.reason
        : new Error(String(event?.reason ?? 'Unhandled promise rejection'));
    send(err.message, err.stack ?? null, false);
    prevRejectionHandler?.(event);
  };
}

/**
 * Manually report a caught error from a try/catch block.
 * Pass a context string to make it easy to find in the dashboard.
 *
 * @example
 * try {
 *   await confirmCheckout();
 * } catch (e) {
 *   reportError(e, 'checkout/confirm');
 * }
 */
export function reportError(error: unknown, context?: string): void {
  if (__DEV__) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const message = context ? `[${context}] ${err.message}` : err.message;
  send(message, err.stack ?? null, false);
}
