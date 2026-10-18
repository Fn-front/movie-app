/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

import { requireSecondFactor } from './totpGuard';

// --- Mocks ---

const mockIsTotpEnabled = jest.fn();
const mockVerifySecondFactor = jest.fn();
jest.mock('@/lib/auth/totpVerification', () => ({
  ...jest.requireActual('@/lib/auth/totpVerification'),
  isTotpEnabled: (...args: unknown[]) => mockIsTotpEnabled(...args),
  verifySecondFactor: (...args: unknown[]) => mockVerifySecondFactor(...args),
}));

const mockCheckRateLimit = jest.fn();
const mockResetRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  resetRateLimit: (...args: unknown[]) => mockResetRateLimit(...args),
}));

// --- Tests ---

describe('requireSecondFactor', () => {
  const supabase = {} as SupabaseClient;
  const USER_ID = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTotpEnabled.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockVerifySecondFactor.mockResolvedValue('success');
  });

  it('正しいコードなら null を返して通す', async () => {
    await expect(
      requireSecondFactor(supabase, USER_ID, '123456'),
    ).resolves.toBeNull();
  });

  it('成功時にレート制限をリセットする', async () => {
    await requireSecondFactor(supabase, USER_ID, '123456');

    expect(mockResetRateLimit).toHaveBeenCalledWith(
      supabase,
      USER_ID,
      'totp_verify',
    );
  });

  it('二段階認証が無効なら400を返す', async () => {
    mockIsTotpEnabled.mockResolvedValue(false);

    const response = await requireSecondFactor(supabase, USER_ID, '123456');
    const json = await response!.json();

    expect(response!.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.NOT_CONFIGURED);
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('誤ったコードなら400を返す', async () => {
    mockVerifySecondFactor.mockResolvedValue('invalid');

    const response = await requireSecondFactor(supabase, USER_ID, '000000');
    const json = await response!.json();

    expect(response!.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.INVALID_CODE);
  });

  it('使い回したコードなら使用済みとして拒否する', async () => {
    mockVerifySecondFactor.mockResolvedValue('reused');

    const response = await requireSecondFactor(supabase, USER_ID, '123456');
    const json = await response!.json();

    expect(response!.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.CODE_ALREADY_USED);
  });

  it('試行上限を超えたら検証せず429を返す', async () => {
    // ここが総当たりの入口になるため、検証に入る前に止める
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const response = await requireSecondFactor(supabase, USER_ID, '123456');

    expect(response!.status).toBe(429);
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('ログイン時と同じ厳しさで制限する', async () => {
    await requireSecondFactor(supabase, USER_ID, '123456');

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      supabase,
      USER_ID,
      'totp_verify',
      5,
      15,
    );
  });

  it('失敗時はレート制限をリセットしない', async () => {
    mockVerifySecondFactor.mockResolvedValue('invalid');

    await requireSecondFactor(supabase, USER_ID, '000000');

    expect(mockResetRateLimit).not.toHaveBeenCalled();
  });
});
