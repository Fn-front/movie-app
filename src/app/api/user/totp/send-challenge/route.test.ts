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
/**
 * ⚠️ どのテストもこれを assert しない。
 *
 * このルートは `checkRateLimit` を import していないので、**呼び出しは常に
 * 0回**。それを `not.toHaveBeenCalledWith` で確かめても、空のハンドラでも
 * 通るアサーションにしかならない（#1287）。
 *
 * 「消費しないこと」は下のソース不変条件テストが見る。ここでモックを
 * 残しているのは、将来 import された場合に**実際のレート制限が走るのを
 * 防ぐ**ため（テストが本番の経路へ落ちないようにする安全弁）。
 */
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
    // コメントで理由を説明しているので、コードだけを見る。
    //
    // ⚠️ 文字列リテラル中の `//`（`'https://…'` 等）も行コメント開始と
    //   見なして削ってしまう。いまは禁止語が import 行に出るため実害は
    //   無いが、完全な字句解析ではないことを承知で使っている
    const code = routeSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    // ⚠️ 大文字小文字を潰してから見る。`TOTP_SETTINGS_VERIFY`（定数）だけを
    //   見ていると、小文字のリテラル `'totp_settings_verify'` を素通りさせる
    const normalized = code.toUpperCase();

    // 送信系と検証系でカウンタを重ねると、メールOTP の利用者は無効化のたびに
    // 2枠使い、2回しくじるだけで15分間すべての二段階認証操作が 429 になる
    expect(normalized).not.toContain('TOTP_SETTINGS_VERIFY');

    // ⚠️ レート制限の入口は `.claude/rules/api-route.md` の棚卸し表にある
    //   **5つすべて**を見る。`checkRateLimit` だけ見ていた頃は
    //   `enforcePublicRateLimit(..., 'totp_settings_verify')` を足しても
    //   緑のままだった（レビューで実測）
    const RATE_LIMIT_ENTRY_POINTS = [
      'checkRateLimit',
      'checkSecondFactorRateLimit',
      'enforcePublicRateLimit',
      'createInMemoryRateLimiter',
      // requireSecondFactor は TOTP_SETTINGS_VERIFY を消費する側
      'requireSecondFactor',
    ];

    for (const entryPoint of RATE_LIMIT_ENTRY_POINTS) {
      expect(normalized).not.toContain(entryPoint.toUpperCase());
    }
  });

  /**
   * 上の不変条件と対になる。「何も消費しない」のではなく、
   * **`sendSecondFactorCode` の中の `TWO_FACTOR_SEND` 1本だけ**が効く。
   * 呼び出しが消えると送信そのものが無くなるので、ここで到達を固定する。
   */
  it('TWO_FACTOR_SEND を持つ sendSecondFactorCode に必ず到達する', async () => {
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
