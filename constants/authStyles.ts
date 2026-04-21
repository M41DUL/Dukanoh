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

export const USERNAME_REGEX = /^[a-z0-9_]+$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 6;

/** Returns password strength label and colour, or null for empty input */
export function getPasswordStrength(pw: string): { label: string; color: string } | null {
  if (pw.length === 0) return null;
  if (pw.length < PASSWORD_MIN) return { label: `At least ${PASSWORD_MIN} characters`, color: lightColors.error };
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  const variety = [hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  if (pw.length >= 10 && variety >= 3) return { label: 'Strong password', color: lightColors.success };
  if (pw.length >= 8 && variety >= 2) return { label: 'Good. Try adding numbers or symbols', color: lightColors.secondary };
  return { label: 'Weak. Use 8+ characters with numbers or symbols', color: '#FFA500' };
}

/** Validates a username and returns an error string, or empty string if valid */
export function validateUsername(value: string): string {
  if (value.length === 0) return '';
  if (value.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters`;
  if (value.length > USERNAME_MAX) return `Maximum ${USERNAME_MAX} characters`;
  if (!USERNAME_REGEX.test(value)) return 'Only lowercase letters, numbers, and underscores';
  return '';
}

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
