// syncProEntitlement — unit tests
// Mocks: react-native-purchases, @/lib/supabase, @/lib/errorReporting

import { ENTITLEMENT_ID , syncProEntitlement } from '../lib/revenuecat';

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

const mockReportError = jest.fn();
jest.mock('../lib/errorReporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
  initErrorReporting: jest.fn(),
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
  mockSingle.mockResolvedValue({ data: { seller_tier: tier }, error: null });
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
  // The function intentionally does NOT write to users.seller_tier from the
  // client — RLS locks those columns and only the revenuecat-webhook edge
  // function (service role) is authorised to update them. Drift between RC
  // and DB is reported via reportError so it surfaces in monitoring.

  describe('when RC and DB agree', () => {
    test('does not report drift when RC active and DB pro', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
      setupDb('pro');

      await syncProEntitlement('user-123');

      expect(mockReportError).not.toHaveBeenCalled();
    });

    test('does not report drift when RC inactive and DB free', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockReportError).not.toHaveBeenCalled();
    });

    test('treats founder as active (no drift when RC is also active)', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
      setupDb('founder');

      await syncProEntitlement('user-123');

      expect(mockReportError).not.toHaveBeenCalled();
    });
  });

  describe('when RC and DB disagree', () => {
    test('reports drift when RC active and DB free', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockReportError).toHaveBeenCalledWith(
        expect.any(Error),
        'syncProEntitlement',
      );
    });

    test('reports drift when RC inactive and DB pro', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('pro');

      await syncProEntitlement('user-123');

      expect(mockReportError).toHaveBeenCalledWith(
        expect.any(Error),
        'syncProEntitlement',
      );
    });

    test('reports drift when RC inactive and DB founder', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('founder');

      await syncProEntitlement('user-123');

      expect(mockReportError).toHaveBeenCalledWith(
        expect.any(Error),
        'syncProEntitlement',
      );
    });
  });

  describe('does not write tier columns from the client', () => {
    test('never calls supabase.update even on drift (RC active, DB free)', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
      setupDb('free');

      await syncProEntitlement('user-123');

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('never calls supabase.update even on drift (RC inactive, DB pro)', async () => {
      mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
      setupDb('pro');

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
  });
});
