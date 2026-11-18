/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { TOTP_ERROR_MESSAGES } from '@/constants/totp';
import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';

import {
  checkSecondFactorRateLimit,
  requireSecondFactor,
} from './secondFactorGuard';

// --- Mocks ---

const mockGetSecondFactorMethod = jest.fn();
const mockVerifySecondFactor = jest.fn();
jest.mock('@/lib/auth/secondFactor', () => ({
  ...jest.requireActual('@/lib/auth/secondFactor'),
  getSecondFactorMethod: (...args: unknown[]) =>
    mockGetSecondFactorMethod(...args),
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
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockVerifySecondFactor.mockResolvedValue('success');
  });

  it('正しいコードなら null を返して通す', async () => {
    await expect(
      requireSecondFactor(supabase, USER_ID, '123456'),
    ).resolves.toBeNull();
  });

  // ガードは方式に依存しない。分岐は verifySecondFactor の中にある
  it('method=email_otp でも、正しいコードなら通す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.EMAIL_OTP);

    await expect(
      requireSecondFactor(supabase, USER_ID, '123456'),
    ).resolves.toBeNull();
    expect(mockVerifySecondFactor).toHaveBeenCalledWith(
      supabase,
      USER_ID,
      '123456',
    );
  });

  it('成功時にレート制限をリセットする', async () => {
    await requireSecondFactor(supabase, USER_ID, '123456');

    expect(mockResetRateLimit).toHaveBeenCalledWith(
      supabase,
      USER_ID,
      'totp_settings_verify',
    );
  });

  it('二段階認証が無効なら400を返す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(null);

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

  it('失敗時はレート制限をリセットしない', async () => {
    mockVerifySecondFactor.mockResolvedValue('invalid');

    await requireSecondFactor(supabase, USER_ID, '000000');

    expect(mockResetRateLimit).not.toHaveBeenCalled();
  });

  it('レート制限は自身では行わない（呼び出し側が先に通す）', async () => {
    // #940 で checkSecondFactorRateLimit へ切り出した。
    // ここで数えると、リクエストの検証より後ろにしか置けない
    await requireSecondFactor(supabase, USER_ID, '123456');

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});

describe('checkSecondFactorRateLimit', () => {
  const supabase = {} as SupabaseClient;
  const USER_ID = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it('上限内なら null を返して通す', async () => {
    await expect(
      checkSecondFactorRateLimit(supabase, USER_ID),
    ).resolves.toBeNull();
  });

  it('試行上限を超えたら429を返す', async () => {
    // ここが総当たりの入口になるため、検証に入る前に止める
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const response = await checkSecondFactorRateLimit(supabase, USER_ID);

    expect(response!.status).toBe(429);
  });

  it('ログイン時と同じ厳しさで制限する', async () => {
    await checkSecondFactorRateLimit(supabase, USER_ID);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      supabase,
      USER_ID,
      'totp_settings_verify',
      5,
      15,
    );
  });

  it('ログインの totp_verify とはカウンタを分ける', async () => {
    // 共有していた頃は、設定画面でコード欄を空のまま5回送るだけで
    // ログインの第2要素まで15分ロックされた。resetRateLimit は検証成功時に
    // しか走らないため、利用者が自力で解除する手段も無かった（#940）
    await checkSecondFactorRateLimit(supabase, USER_ID);

    expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
      supabase,
      USER_ID,
      'totp_verify',
      expect.anything(),
      expect.anything(),
    );
  });

  it('二段階認証の設定有無を問わず数える', async () => {
    // #940 以前は getSecondFactorMethod の後で数えていた。画面からここへ到達できるのは
    // 設定済みの利用者だけなので、先に数えても実害は無い
    await checkSecondFactorRateLimit(supabase, USER_ID);

    expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });
});
