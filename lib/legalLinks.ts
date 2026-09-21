import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export const LEGAL_URLS = {
  terms: 'https://www.dukanoh.com/terms-and-conditions',
  privacy: 'https://www.dukanoh.com/privacy-policy',
} as const;

export type LegalPage = keyof typeof LEGAL_URLS;

/**
 * Opens a legal page in the in-app browser sheet (Safari view on iOS, Custom Tab
 * on Android) so the member stays inside Dukanoh, matching Settings. Falls back to
 * the system browser only if the in-app sheet can't be shown.
 */
export async function openLegalPage(page: LegalPage): Promise<void> {
  const url = LEGAL_URLS[page];
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url).catch(() => {});
  }
}
