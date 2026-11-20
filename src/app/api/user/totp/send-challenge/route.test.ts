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
  /**
   * ⚠️ これはソースに対する不変条件テスト（#1287）
   *
   * もとは `expect(mockCheckRateLimit).not.toHaveBeenCalledWith(...)` だったが、
   * **このルートは `checkRateLimit` を import していない**ので、
   * モックの呼び出しは全テストで0回。つまり**空のハンドラでも通る**
   * アサーションになっていた。
   *
   * 唯一のレート制限 `TWO_FACTOR_SEND` は `sendSecondFactorCode` の中にあり、
   * そのモジュールはここでモックされている。実行時に観測できるものが無いため、
   * 「消費しないこと」はソースを読んで固定するしかない。
   */
  it('TOTP_SETTINGS_VERIFY を消費しない（レート制限を一切持ち込まない）', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');

    const routeSource = fs.readFileSync(
      path.join(__dirname, 'route.ts'),
      'utf8',
    );
    // コメントで理由を説明しているので、コードだけを見る
    const code = routeSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    // 送信系と検証系でカウンタを重ねると、メールOTP の利用者は無効化のたびに
    // 2枠使い、2回しくじるだけで15分間すべての二段階認証操作が 429 になる
    expect(code).not.toContain('TOTP_SETTINGS_VERIFY');
    expect(code).not.toContain('checkSecondFactorRateLimit');
    expect(code).not.toContain('checkRateLimit');
    // requireSecondFactor は TOTP_SETTINGS_VERIFY を消費する側
    expect(code).not.toContain('requireSecondFactor');
  });

  /**
   * 上の不変条件と対になる。「何も消費しない」のではなく、
   * **`sendSecondFactorCode` の中の `TWO_FACTOR_SEND` 1本だけ**が効く。
   * 呼び出しが消えると送信そのものが無くなるので、ここで到達を固定する。
   */
  it('レート制限は sendSecondFactorCode の中の1本だけ', async () => {
    mockSendSecondFactorCode.mockResolvedValue('sent');

    await POST();

    expect(mockSendSecondFactorCode).toHaveBeenCalledTimes(1);
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
