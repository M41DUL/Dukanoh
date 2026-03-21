import { lightColors, BorderRadius } from './theme';

/** Shared input styling for auth screens (dark background) */
export const AUTH_INPUT_STYLE = {
  inputContainerStyle: {
    backgroundColor: lightColors.overlay,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.medium,
  },
  placeholderColor: 'rgba(255,255,255,0.4)',
  hintColor: 'rgba(255,255,255,0.5)',
  style: { color: '#FFFFFF' },
} as const;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TIMEOUT_MS = 30000;

/** Wraps a promise with a timeout */
export function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('__TIMEOUT__')), ms),
    ),
  ]);
}

/** Returns a user-friendly error message, detecting network and timeout failures */
export function getAuthError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.message === '__TIMEOUT__') {
      return 'Request timed out. Please check your connection and try again.';
    }
    if (err.message.includes('Network request failed')) {
      return 'No internet connection. Please check your network and try again.';
    }
  }
  return fallback;
}
