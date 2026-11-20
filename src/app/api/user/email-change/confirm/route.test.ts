/**
 * @jest-environment node
 */

/**
 * メールアドレス変更: 確認コード検証 API Route テスト（#1359）
 *
 * ⚠️ **成功するとログイン識別子が変わる。** 通知は旧アドレスへ送る。
 */

import { EMAIL_CHANGE_MESSAGES } from '@/constants/emailChange';

import { POST } from './route';

// --- Mocks ---

const mockRpc = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
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
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockConsumeEmailChangeCode = jest.fn();
jest.mock('@/lib/auth/emailChange', () => ({
  ...jest.requireActual('@/lib/auth/emailChange'),
  consumeEmailChangeCode: (...args: unknown[]) =>
    mockConsumeEmailChangeCode(...args),
}));

const mockSendEmailChangedNotice = jest.fn();
jest.mock('@/lib/auth/sendEmailChangedNotice', () => ({
  sendEmailChangedNotice: (...args: unknown[]) =>
    mockSendEmailChangedNotice(...args),
}));

// --- Helpers ---

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/user/email-change/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const validBody = { newEmail: 'new@example.com', code: '123456' };

// --- Tests ---

describe('POST /api/user/email-change/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockConsumeEmailChangeCode.mockResolvedValue('success');
    mockRpc.mockResolvedValue({ data: 'old@example.com', error: null });
    mockSendEmailChangedNotice.mockResolvedValue(true);
  });

  describe('認証', () => {
    it('未認証で401を返し、差し替えない', async () => {
      mockGetAuthSession.mockResolvedValue(null);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(401);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('レート制限', () => {
    /**
     * ⚠️ `otp_codes.attempts`（上限5）は**コード1本あたり**しか数えない。
     * コードを作り直しながらの総当たりはこちらで抑える。
     */
    it('上限超過で429を返し、検証もしない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(429);
      expect(mockConsumeEmailChangeCode).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **送信枠と別のカウンタであること。** 同じにすると、失敗した検証が
     * 送信枠を食って**コードを送り直せなくなる**。
     */
    it('検証用のカウンタで数える', async () => {
      await POST(createRequest(validBody));

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'email_change_verify',
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  /**
   * 認証 → レート制限 → バリデーション の順であることの回帰テスト（#940）。
   * 識別子が `session.user.id` なので検証より前に確定している。
   */
  describe('処理順', () => {
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await POST(createRequest({ newEmail: 'x', code: '' }));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('上限超過と不正入力が重なったら429を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await POST(createRequest({ newEmail: 'x', code: '' }));

      expect(response.status).toBe(429);
    });
  });

  describe('コードの検証', () => {
    it('不正なら400を返し、差し替えない', async () => {
      mockConsumeEmailChangeCode.mockResolvedValue('invalid');

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('正規化したアドレスで照合する', async () => {
      await POST(createRequest({ ...validBody, newEmail: 'New@Example.COM' }));

      expect(mockConsumeEmailChangeCode).toHaveBeenCalledWith(
        expect.anything(),
        'new@example.com',
        '123456',
      );
    });
  });

  describe('差し替え', () => {
    it('RPC をセッションの利用者IDと新アドレスで呼ぶ', async () => {
      const response = await POST(createRequest(validBody));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe(EMAIL_CHANGE_MESSAGES.CHANGED);
      expect(mockRpc).toHaveBeenCalledWith('change_user_email', {
        p_user_id: 'user-1',
        p_new_email: 'new@example.com',
      });
    });

    /**
     * ⚠️ **旧アドレスへ送る。** 新アドレスへ送っても乗っ取った側に届くだけ。
     * 旧アドレスの持ち主が気づける唯一の手段。
     */
    it('旧アドレスへ通知する', async () => {
      await POST(createRequest(validBody));

      expect(mockSendEmailChangedNotice).toHaveBeenCalledWith(
        'old@example.com',
        'new@example.com',
      );
    });

    /**
     * ⚠️ **通知の結果で止めない。** 変更はもう確定しており、500 にすると
     * 正しいコードを入れた利用者が同じ操作を繰り返す行き止まりになる。
     */
    it('通知に失敗しても200を返す', async () => {
      mockSendEmailChangedNotice.mockResolvedValue(false);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(200);
    });

    /**
     * ⚠️ 事前チェックと UPDATE の間に別の利用者が同じアドレスを取った場合。
     * 500 だと何が起きたか伝わらない。
     */
    it('一意制約違反は利用者向けの文言に変える', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });

      const response = await POST(createRequest(validBody));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(EMAIL_CHANGE_MESSAGES.ALREADY_USED);
      expect(mockSendEmailChangedNotice).not.toHaveBeenCalled();
    });

    it('それ以外のDBエラーは500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: '57P01', message: 'connection terminated' },
      });

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(500);
      expect(mockSendEmailChangedNotice).not.toHaveBeenCalled();
    });
  });
});
