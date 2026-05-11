import {
  shouldShowMarketingConsentSheet,
  isFirstSaveAction,
  type MarketingConsentProfile,
} from '../lib/marketingConsent';

// Convenience builder so each test reads like its scenario, not its setup.
function profile(overrides: Partial<MarketingConsentProfile> = {}): MarketingConsentProfile {
  return {
    onboarding_completed: true,
    marketing_prompted_at: null,
    marketing_push_consent: false,
    ...overrides,
  };
}

// ─── shouldShowMarketingConsentSheet ────────────────────────

describe('shouldShowMarketingConsentSheet', () => {
  test('returns true for the canonical "ready to ask" profile', () => {
    expect(shouldShowMarketingConsentSheet(profile())).toBe(true);
  });

  describe('blocks when onboarding is unfinished', () => {
    test('false when onboarding_completed is false', () => {
      expect(shouldShowMarketingConsentSheet(profile({ onboarding_completed: false }))).toBe(false);
    });

    test('false when onboarding_completed is null (legacy rows)', () => {
      expect(shouldShowMarketingConsentSheet(profile({ onboarding_completed: null }))).toBe(false);
    });
  });

  describe('blocks when we have already asked', () => {
    test('false when marketing_prompted_at is a recent ISO string', () => {
      expect(
        shouldShowMarketingConsentSheet(profile({ marketing_prompted_at: '2026-05-11T10:00:00Z' })),
      ).toBe(false);
    });

    test('false even for a long-ago timestamp — any non-null blocks', () => {
      expect(
        shouldShowMarketingConsentSheet(profile({ marketing_prompted_at: '2020-01-01T00:00:00Z' })),
      ).toBe(false);
    });
  });

  test('blocks when the user is already opted in', () => {
    expect(
      shouldShowMarketingConsentSheet(profile({ marketing_push_consent: true })),
    ).toBe(false);
  });

  test('blocks if multiple gates fail at once', () => {
    expect(
      shouldShowMarketingConsentSheet(
        profile({
          onboarding_completed: false,
          marketing_prompted_at: '2026-01-01T00:00:00Z',
          marketing_push_consent: true,
        }),
      ),
    ).toBe(false);
  });

  test('does not treat an empty-string timestamp as "asked" — defensive', () => {
    // Postgres won't return empty strings for TIMESTAMPTZ, but if a buggy
    // caller passes one, the gate currently treats it as falsy → shows the
    // sheet. Lock the behaviour in so future changes are intentional.
    expect(
      shouldShowMarketingConsentSheet(profile({ marketing_prompted_at: '' })),
    ).toBe(true);
  });
});

// ─── isFirstSaveAction ──────────────────────────────────────

describe('isFirstSaveAction', () => {
  test('true when the user has no saves and is adding one', () => {
    expect(isFirstSaveAction(0, false)).toBe(true);
  });

  test('false when the user already has saves', () => {
    expect(isFirstSaveAction(1, false)).toBe(false);
    expect(isFirstSaveAction(50, false)).toBe(false);
  });

  test('false when the action is an unsave', () => {
    expect(isFirstSaveAction(0, true)).toBe(false);
    expect(isFirstSaveAction(1, true)).toBe(false);
  });

  test('false when both saved count > 0 and action is an unsave', () => {
    expect(isFirstSaveAction(3, true)).toBe(false);
  });
});
