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
