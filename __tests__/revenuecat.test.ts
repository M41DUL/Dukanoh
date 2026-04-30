// syncProEntitlement — unit tests
// Mocks: react-native-purchases and @/lib/supabase

import { ENTITLEMENT_ID } from '../lib/revenuecat';

// Import AFTER mocks are registered
import { syncProEntitlement } from '../lib/revenuecat';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetCustomerInfo = jest.fn();
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args) },
  LOG_LEVEL: { VERBOSE: 'VERBOSE' },
}));

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();

// Build a chainable mock: .from().select().eq().single() and .from().update().eq()
const mockFrom = jest.fn((_table: string) => ({
  select: mockSelect.mockReturnValue({
    eq: mockEq.mockReturnValue({
      single: mockSingle,
    }),
  }),
  update: mockUpdate.mockReturnValue({
    eq: mockEq,
  }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCustomerInfo(active: boolean, expiryDate: string | null = '2027-01-01') {
  return {
    entitlements: {
      active: active
        ? { [ENTITLEMENT_ID]: { expirationDate: expiryDate } }
        : {},
    },
  };
}

function setupDb(tier: string) {
  mockSingle.mockResolvedValue({ data: { seller_tier: tier, pro_expires_at: null }, error: null });
  mockEq.mockReturnValue({ single: mockSingle });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockReturnValue({
    select: mockSelect.mockReturnValue({ eq: mockEq.mockReturnValue({ single: mockSingle }) }),
    update: mockUpdate.mockReturnValue({ eq: mockEq }),
  });
});

describe('ENTITLEMENT_ID', () => {
  test('is dukanoh_pro', () => {
    expect(ENTITLEMENT_ID).toBe('dukanoh_pro');
  });
});

describe('syncProEntitlement', () => {
  describe('when RevenueCat says active and DB says free', () => {
    test('updates seller_tier to pro', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true, '2027-06-01'));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ seller_tier: 'pro', had_free_trial: true })
      );
    });

    test('writes the expiry date from RevenueCat', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true, '2027-06-01'));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ pro_expires_at: '2027-06-01' })
      );
    });

    test('handles null expiry date gracefully', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true, null));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ pro_expires_at: null })
      );
    });
  });

  describe('when RevenueCat says not active and DB says pro', () => {
    test('downgrades seller_tier to free', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('pro');

      await syncProEntitlement('user-123');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ seller_tier: 'free', pro_expires_at: null })
      );
    });

    test('also downgrades if DB tier is founder', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('founder');

      await syncProEntitlement('user-123');

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ seller_tier: 'free' })
      );
    });
  });

  describe('when there is no mismatch', () => {
    test('does not write to DB when RC active and DB already pro', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
      setupDb('pro');

      await syncProEntitlement('user-123');

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('does not write to DB when RC inactive and DB already free', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('does not throw when getCustomerInfo rejects', async () => {
      mockGetCustomerInfo.mockRejectedValue(new Error('RC unavailable'));
      setupDb('free');

      await expect(syncProEntitlement('user-123')).resolves.toBeUndefined();
    });

    test('does not throw when supabase select fails', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
      mockSingle.mockResolvedValue({ data: null, error: new Error('DB error') });

      await expect(syncProEntitlement('user-123')).resolves.toBeUndefined();
    });

    test('does not throw when supabase update fails', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true, '2027-01-01'));
      setupDb('free');
      mockEq.mockReturnValueOnce({ single: mockSingle }).mockReturnValueOnce(
        Promise.reject(new Error('update failed'))
      );

      await expect(syncProEntitlement('user-123')).resolves.toBeUndefined();
    });
  });
});
