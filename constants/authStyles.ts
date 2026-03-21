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

/** Returns a user-friendly error message, detecting network failures */
export function getAuthError(err: unknown, fallback: string): string {
  if (err instanceof TypeError && err.message.includes('Network request failed')) {
    return 'No internet connection. Please check your network and try again.';
  }
  return fallback;
}
