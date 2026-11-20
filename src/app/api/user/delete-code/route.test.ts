/**
 * @jest-environment node
 */

/**
 * 退会の確認コード送信 API Route テスト（#1362）
 *
 * ⚠️ 固定したいのは**宛先を外から指定させないこと**と、
 * **送信枠を削除の試行枠と混ぜないこと**。
 */

import { ACCOUNT_DELETE_CODE_MESSAGES } from '@/constants/accountDeleteCode';
import { ACCOUNT_DELETE_MESSAGES } from '@/constants/auth';

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
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockSendAccountDeleteCode = jest.fn();
jest.mock('@/lib/auth/accountDeleteCode', () => ({
  ...jest.requireActual('@/lib/auth/accountDeleteCode'),
  sendAccountDeleteCode: (...args: unknown[]) =>
    mockSendAccountDeleteCode(...args),
}));

// --- Helpers ---

/** `users` の1行を返す */
const mockUserQuery = (
  user: {
    email: string;
    username: string | null;
    password_hash?: string | null;
  } | null,
  error: unknown = null,
) => {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: error ? null : user, error }),
      }),
    }),
  });
};

// --- Tests ---

describe('POST /api/user/delete-code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendAccountDeleteCode.mockResolvedValue('sent');
    mockUserQuery({
      email: 'owner@example.com',
      username: null,
      password_hash: null,
    });
  });

  describe('認証', () => {
    it('未認証で401を返し、送信しない', async () => {
      mockGetAuthSession.mockResolvedValue(null);

      const response = await POST();

      expect(response.status).toBe(401);
      expect(mockSendAccountDeleteCode).not.toHaveBeenCalled();
    });
  });

  describe('レート制限', () => {
    it('上限超過で429を返し、送信しない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await POST();

      expect(response.status).toBe(429);
      expect(mockSendAccountDeleteCode).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **削除の試行（`account_delete`）とは別カウンタ。**
     *
     * 同じにすると、コードを送り直すだけで削除の試行枠を食い尽くし、
     * **正しいコードを持っていても消せなくなる**。
     */
    it('削除の試行枠とは別のカウンタで数える', async () => {
      await POST();

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'account_delete_code_send',
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'account_delete',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('宛先', () => {
    /**
     * ⛔ **ボディを読まない。**
     *
     * 宛先を受け付けると、アカウントを1つ持つだけで任意のアドレスへ
     * 自サービス名義の「退会の確認コード」を送れる（#641）。
     */
    it('users から引いたアドレスへ送る', async () => {
      await POST();

      expect(mockSendAccountDeleteCode).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'owner@example.com',
      );
    });

    /**
     * ⚠️ **コードが要らない利用者には送らない**（レビュー指摘）。
     *
     * `DELETE /api/user` はパスワードを持つ利用者にパスワードを要求し、
     * このコードを使わない。送ると「アカウントの削除」という件名のメールが
     * 無駄に届き、セッションを奪った第三者が被害者の受信箱へ
     * 5通/60分を送り込む経路にもなる。
     */
    it('パスワードを持つ利用者には送らない', async () => {
      mockUserQuery({
        email: 'owner@example.com',
        username: null,
        password_hash: 'hashed',
      });

      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        ACCOUNT_DELETE_CODE_MESSAGES.CODE_NOT_REQUIRED,
      );
      expect(mockSendAccountDeleteCode).not.toHaveBeenCalled();
    });

    /**
     * ⛔ **第2要素の有無では出し分けない**（`DELETE /api/user` と同じ条件）。
     * 第2要素はセッションだけで自己登録できるため、独立した再確認として
     * 数えない。
     */
    it('第2要素を持っていても送る', async () => {
      const response = await POST();

      expect(response.status).toBe(200);
      expect(mockSendAccountDeleteCode).toHaveBeenCalled();
    });

    it('行が無ければ404を返し、送信しない', async () => {
      mockUserQuery(null, { code: 'PGRST116' });

      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.message).toBe(ACCOUNT_DELETE_MESSAGES.NOT_FOUND);
      expect(mockSendAccountDeleteCode).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ admin が発行したアカウントは `users.email` が `.invalid` TLD
     * （RFC 2606、絶対に名前解決されない）なので、送っても永久に届かない。
     * 黙って送ると「待っても来ない」行き止まりになる。
     */
    it('コードが届かないアカウントには送らず、窓口へ誘導する', async () => {
      mockUserQuery({
        email: 'abc@def.invalid',
        username: 'K7M2QXPT9WFN',
        password_hash: null,
      });

      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        ACCOUNT_DELETE_CODE_MESSAGES.EMAIL_UNAVAILABLE,
      );
      expect(mockSendAccountDeleteCode).not.toHaveBeenCalled();
    });
  });

  describe('送信の結果', () => {
    it('送れたら200を返す', async () => {
      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe(ACCOUNT_DELETE_CODE_MESSAGES.CODE_SENT);
    });

    // 二度押しでメールボックスへ連投しない
    it('再送間隔の内側なら429を返す', async () => {
      mockSendAccountDeleteCode.mockResolvedValue('throttled');

      const response = await POST();

      expect(response.status).toBe(429);
    });

    it('送信に失敗したら500を返す', async () => {
      mockSendAccountDeleteCode.mockResolvedValue('send_failed');

      const response = await POST();

      expect(response.status).toBe(500);
    });

    it('例外は500に丸める', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSendAccountDeleteCode.mockRejectedValue(new Error('db down'));

      const response = await POST();

      expect(response.status).toBe(500);

      spy.mockRestore();
    });
  });
});
