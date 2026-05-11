// Pure logic for the marketing-consent prompt — extracted from
// MarketingConsentProvider and SavedContext so the rules can be unit-tested
// without mounting React or mocking Supabase.

export interface MarketingConsentProfile {
  onboarding_completed: boolean | null;
  marketing_prompted_at: string | null;
  marketing_push_consent: boolean;
}

/**
 * The sheet should appear only when all three are true:
 *  - the user has finished onboarding (we never interrupt that flow)
 *  - we have not previously asked them (any non-null timestamp blocks)
 *  - they are not already opted-in (no point asking again)
 */
export function shouldShowMarketingConsentSheet(profile: MarketingConsentProfile): boolean {
  if (!profile.onboarding_completed) return false;
  if (profile.marketing_prompted_at) return false;
  if (profile.marketing_push_consent) return false;
  return true;
}

/**
 * "Moment of value" trigger: the user is *adding* (not unsaving) and they
 * had no prior saves. Returning true is a signal — the gate above still
 * decides whether to actually show the sheet.
 */
export function isFirstSaveAction(savedCount: number, isCurrentlySaved: boolean): boolean {
  return savedCount === 0 && !isCurrentlySaved;
}
