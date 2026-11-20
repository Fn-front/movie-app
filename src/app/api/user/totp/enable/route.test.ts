/**
 * @jest-environment node
 */

/**
 * 二段階認証の有効化API Route テスト
 */

import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

const mockGetSecondFactorMethod = jest.fn();
jest.mock('@/lib/auth/secondFactor', () => ({
  ...jest.requireActual('@/lib/auth/secondFactor'),
  getSecondFactorMethod: (...args: unknown[]) =>
    mockGetSecondFactorMethod(...args),
}));

const mockSendEnabledNotice = jest.fn();
jest.mock('@/lib/auth/sendSecondFactorEnabledNotice', () => ({
  sendSecondFactorEnabledNotice: (...args: unknown[]) =>
    mockSendEnabledNotice(...args),
}));

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

const mockCheckRateLimit = jest.fn();
const mockResetRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  resetRateLimit: (...args: unknown[]) => mockResetRateLimit(...args),
}));

const mockConfirmSecondFactorSetup = jest.fn();
jest.mock('@/lib/auth/totpSetup', () => ({
  confirmSecondFactorSetup: (...args: unknown[]) =>
    mockConfirmSecondFactorSetup(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/totp/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('POST /api/user/totp/enable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockGetSecondFactorMethod.mockResolvedValue('totp');
    mockSendEnabledNotice.mockResolvedValue(true);
    // メールOTP の照合に本人のアドレスが要るため users を引く
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: { email: 'user@example.com' } }),
        }),
      }),
    });
    mockConfirmSecondFactorSetup.mockResolvedValue({
      codes: ['ABCDE-FGHJK', 'MNPQR-STWXY'],
      method: 'totp',
    });
  });

  it('正しいコードで有効化しリカバリーコードを返す', async () => {
    const response = await POST(createRequest({ code: '123456' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe(TOTP_ERROR_MESSAGES.ENABLED);
    expect(json.data.recoveryCodes).toEqual(['ABCDE-FGHJK', 'MNPQR-STWXY']);
  });

  /**
   * ⛔ **身に覚えのない登録に気づける唯一の手段**（#1368）。
   *
   * 第2要素が登録されると以降のログインにそのコードが要る。攻撃者が
   * 登録した場合、被害者は自分が設定していない第2要素を求められ、
   * リカバリーコードも持っていない。
   */
  it('有効化したら登録アドレスへ知らせる', async () => {
    await POST(createRequest({ code: '123456' }));

    expect(mockSendEnabledNotice).toHaveBeenCalledWith(
      'user@example.com',
      'totp',
    );
  });

  /**
   * ⛔ **方式は `confirmSecondFactorSetup` の返り値から取る**（#1368 のレビュー）。
   *
   * 以前はここで `getSecondFactorMethod` を呼び直していたが、あれは DB エラーで
   * **throw する**。有効化はもう確定しているので、投げられると 500 になり
   * **平文のリカバリーコードを一度も表示できない**まま終わる。
   */
  it('方式を取り直さずに知らせる（メールOTP）', async () => {
    mockConfirmSecondFactorSetup.mockResolvedValue({
      codes: ['ABCDE-FGHJK'],
      method: 'email_otp',
    });

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(200);
    expect(mockSendEnabledNotice).toHaveBeenCalledWith(
      'user@example.com',
      'email_otp',
    );
  });

  /**
   * ⚠️ **戻り値で止めない。** 有効化はもう確定しており、ここで 500 にすると
   * **リカバリーコードを一度も表示できない**まま終わる（平文はこの応答に
   * しか出ない）。
   */
  it('通知に失敗しても200を返し、リカバリーコードを出す', async () => {
    mockSendEnabledNotice.mockResolvedValue(false);

    const response = await POST(createRequest({ code: '123456' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.recoveryCodes).toBeDefined();
  });

  // 有効化に失敗したら通知しない（嘘の通知を送らない）
  it('有効化に失敗したら知らせない', async () => {
    mockConfirmSecondFactorSetup.mockResolvedValue(null);

    await POST(createRequest({ code: '000000' }));

    expect(mockSendEnabledNotice).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 照合に使うアドレスは **`users` から引いた値**（#641 / #1287）。
   *
   * セッションの `user.email` やボディの値を使うと、第三者が宛先を差し替えて
   * 自分のメールボックスに届いたコードで他人の二段階認証を有効化できる。
   * ボディに紛れ込ませたアドレスが**使われないこと**も併せて固定する。
   */
  it('照合に使うアドレスは users から引いた値（セッションもボディも見ない）', async () => {
    // ⚠️ セッションにも**別の**アドレスを持たせる。ここを空にしておくと
    // `session.user.email ?? user.email` のような実装でも落ちない（実測）
    mockGetAuthSession.mockResolvedValue({
      user: { id: 'user-1', email: 'session@example.com' },
    });

    await POST(
      createRequest({ code: '123456', email: 'attacker@example.com' }),
    );

    expect(mockConfirmSecondFactorSetup).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      '123456',
      'user@example.com',
    );
  });

  /**
   * ⚠️ 読み取りに失敗したら 401 を返さない。
   *
   * axios のインターセプタが 401 を「未認証」と解釈して強制ログアウトへ
   * 倒すため、DB障害で利用者が蹴り出される。
   */
  it('users の読み取りに失敗したら500（401にしない）', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: 'connection terminated' },
              }),
          }),
        }),
      });

      const response = await POST(createRequest({ code: '123456' }));

      expect(response.status).toBe(500);
      expect(mockConfirmSecondFactorSetup).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('成功時にレート制限をリセットする', async () => {
    await POST(createRequest({ code: '123456' }));

    expect(mockResetRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'totp_settings_verify',
    );
  });

  it('誤ったコードなら400を返す', async () => {
    mockConfirmSecondFactorSetup.mockResolvedValue(null);

    const response = await POST(createRequest({ code: '000000' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.INVALID_CODE);
  });

  it.each([
    ['コード未指定', {}],
    ['桁数が足りない', { code: '12345' }],
    ['桁数が多い', { code: '1234567' }],
    ['数字以外', { code: 'abcdef' }],
    ['リカバリーコード形式', { code: 'ABCDE-FGHJK' }],
  ])('%s は400を返す', async (_label, body) => {
    // 有効化は認証アプリのコードに限る。リカバリーコードはまだ発行されていない
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    expect(mockConfirmSecondFactorSetup).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(401);
  });

  it('試行上限を超えたら検証せず429を返す', async () => {
    // 6桁 = 100万通り。上限が無いと総当たりで有効化できてしまう
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(429);
    expect(mockConfirmSecondFactorSetup).not.toHaveBeenCalled();
  });

  it('例外時は500を返す', async () => {
    mockConfirmSecondFactorSetup.mockRejectedValue(new Error('db error'));

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(500);
  });

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション（#940）。
    // 識別子が session.user.id なので検証より前に確定している。
    // 逆順だと、桁数を崩したコードを挟むだけでカウンタを消費せずに
    // 6桁の総当たりを続けられる（`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await POST(createRequest({ code: 'abcdef' }));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、コードが不正でも429を返す（検証より先に判定する）', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

      const response = await POST(createRequest({ code: 'abcdef' }));

      expect(response.status).toBe(429);
    });
  });
});
