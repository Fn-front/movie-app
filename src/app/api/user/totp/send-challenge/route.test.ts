/**
 * @jest-environment node
 */

/**
 * 設定変更のための第2要素コード送信API Route テスト
 */

import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

const mockGetAuthSession = jest.fn();
jest.mock('@/helpers/auth', () => ({
  getAuthSession: () => mockGetAuthSession(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockGetSecondFactorMethod = jest.fn();
jest.mock('@/lib/auth/secondFactor', () => ({
  ...jest.requireActual('@/lib/auth/secondFactor'),
  getSecondFactorMethod: (...args: unknown[]) =>
    mockGetSecondFactorMethod(...args),
}));

const mockSendSecondFactorCode = jest.fn();
const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/auth/sendSecondFactorCode', () => ({
  ...jest.requireActual('@/lib/auth/sendSecondFactorCode'),
  sendSecondFactorCode: (...args: unknown[]) =>
    mockSendSecondFactorCode(...args),
}));
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  resetRateLimit: jest.fn(),
  releaseRateLimit: jest.fn(),
}));

// --- Helpers ---

/** users の取得をモックする */
const mockUserLookup = (email: string | null) => {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: email ? { email } : null }),
      }),
    }),
  });
};

// --- Tests ---

describe('POST /api/user/totp/send-challenge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.EMAIL_OTP);
    mockSendSecondFactorCode.mockResolvedValue('sent');
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockUserLookup('owner@example.com');
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  it('method=email_otp なら本人のアドレスへ送る', async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'owner@example.com',
    );
  });

  /**
   * TOTP は手元の認証アプリで作れるので送る必要がない。
   * 送れてしまうと「送信経路を1つ増やしただけ」になる。
   */
  it('method=totp には送らない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

    const response = await POST();

    expect(response.status).toBe(400);
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  it('二段階認証が未設定なら送らない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(400);
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 宛先をリクエストから取らないことを構造で保証する。
   *
   * ハンドラが `Request` を受け取らない＝ボディを読む手段が無い。
   * ボディを信用すると任意のアドレスへ自サービス名義のコードを送れる（#641）。
   */
  it('リクエストを受け取らない（ボディを読む手段が無い）', () => {
    expect(POST.length).toBe(0);
  });

  /**
   * ⚠️ 送信系と検証系でカウンタを重ねない。重ねると、メールOTP の利用者は
   * 無効化のたびに2枠使い、2回しくじるだけで15分間すべての二段階認証操作が
   * 429 になる。
   */
  it('TOTP_SETTINGS_VERIFY を消費しない', async () => {
    await POST();

    expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'totp_settings_verify',
      expect.anything(),
      expect.anything(),
    );
  });

  it('送信に失敗したら500を返す', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockSendSecondFactorCode.mockResolvedValue('send_failed');

      const response = await POST();

      expect(response.status).toBe(500);
    } finally {
      error.mockRestore();
    }
  });

  /**
   * 1通も送っていないので、コードを待たせずリカバリーコードへ誘導する。
   */
  it('送信上限に達したらリカバリーコードへ誘導する', async () => {
    mockSendSecondFactorCode.mockResolvedValue('limit_exceeded');

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.message).toMatch(/リカバリーコード/);
  });

  it('再送間隔に当たったら429を返す', async () => {
    mockSendSecondFactorCode.mockResolvedValue('throttled');

    const response = await POST();

    expect(response.status).toBe(429);
  });

  /**
   * 401 を返すと axios のインターセプタが「未認証」と解釈して強制ログアウト
   * へ倒す。DB の不調でセッションごと破棄されてしまう。
   */
  it('users の取得が DB エラーなら 401 ではなく500を返す', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: 'connection terminated', code: '57P01' },
              }),
          }),
        }),
      });

      const response = await POST();

      expect(response.status).toBe(500);
      expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
