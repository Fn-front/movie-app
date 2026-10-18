/**
 * @jest-environment node
 */

/**
 * 二段階認証の状態取得API Route テスト
 */

import { GET } from './route';

// --- Mocks ---

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: jest.fn() }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

const mockGetAuthSession = jest.fn();
jest.mock('@/helpers/auth', () => ({
  getAuthSession: () => mockGetAuthSession(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockIsTotpEnabled = jest.fn();
const mockCountUnusedRecoveryCodes = jest.fn();
jest.mock('@/lib/auth/totpVerification', () => ({
  isTotpEnabled: (...args: unknown[]) => mockIsTotpEnabled(...args),
  countUnusedRecoveryCodes: (...args: unknown[]) =>
    mockCountUnusedRecoveryCodes(...args),
}));

// --- Tests ---

describe('GET /api/user/totp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('有効なユーザーの状態と残数を返す', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);
    mockCountUnusedRecoveryCodes.mockResolvedValue(7);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ enabled: true, remainingRecoveryCodes: 7 });
  });

  it('無効なユーザーには残数を問い合わせない', async () => {
    // 無効なら残数に意味がない
    mockIsTotpEnabled.mockResolvedValue(false);

    const response = await GET();
    const json = await response.json();

    expect(json.data).toEqual({ enabled: false, remainingRecoveryCodes: 0 });
    expect(mockCountUnusedRecoveryCodes).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockIsTotpEnabled).not.toHaveBeenCalled();
  });

  it('例外時は500を返す', async () => {
    mockIsTotpEnabled.mockRejectedValue(new Error('db error'));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
