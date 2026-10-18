/**
 * @jest-environment node
 */

/**
 * パスワード再設定API Route テスト
 */

import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockConsumeToken = jest.fn();
jest.mock('@/lib/auth/passwordResetToken', () => ({
  consumePasswordResetToken: (...args: unknown[]) => mockConsumeToken(...args),
}));

const mockCompare = jest.fn();
const mockHash = jest.fn();
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    compare: (...args: unknown[]) => mockCompare(...args),
    hash: (...args: unknown[]) => mockHash(...args),
  },
}));

// --- Helpers ---

const VALID_PASSWORD = 'NewPassword1';

const createRequest = (
  body: Record<string, unknown>,
  clientIp = '203.0.113.1',
) =>
  new Request('http://localhost/api/auth/password-reset/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(clientIp ? { 'x-vercel-forwarded-for': clientIp } : {}),
    },
    body: JSON.stringify(body),
  });

/** users の取得と更新をモックする */
const mockUserAndUpdate = (
  user: { id: string; password_hash: string | null } | null,
  updateError: unknown = null,
) => {
  const updateSpy = jest.fn(() => ({
    eq: () => Promise.resolve({ error: updateError }),
  }));

  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: user }) }),
    }),
  });
  mockFrom.mockReturnValueOnce({ update: updateSpy });

  return updateSpy;
};

// --- Tests ---

describe('POST /api/auth/password-reset/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks は mockReturnValueOnce のキューを消さない。
    // 途中で返るテストが使い残したキューが次のテストへ漏れる
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockConsumeToken.mockResolvedValue('user-1');
    mockCompare.mockResolvedValue(false);
    mockHash.mockResolvedValue('new-hash');
  });

  describe('正常系', () => {
    it('パスワードを再設定できる', async () => {
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe(PASSWORD_RESET_MESSAGES.RESET_COMPLETED);
    });

    it('password_changed_at を更新して既存セッションを失効させる', async () => {
      // リセットは「アカウントを取り戻す」操作。奪われていた側の
      // セッションを残してはいけない
      const updateSpy = mockUserAndUpdate({
        id: 'user-1',
        password_hash: 'old-hash',
      });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          password_hash: 'new-hash',
          password_changed_at: expect.any(String),
        }),
      );
    });

    it('二段階認証には触れない', async () => {
      // 解除できると、メール受信箱を押さえただけで第2要素を外せてしまう（#642）
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      const touchedTables = mockFrom.mock.calls.map((call) => call[0]);

      expect(touchedTables).not.toContain('user_totp');
      expect(touchedTables).not.toContain('totp_recovery_codes');
    });

    it('パスワード未設定のアカウントにも設定できる', async () => {
      // ソーシャルログイン専用のユーザー。
      // 「ソーシャル専用です」と返すとアカウント種別が漏れるため同じ扱いにする
      mockUserAndUpdate({ id: 'user-1', password_hash: null });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(200);
      expect(mockCompare).not.toHaveBeenCalled();
    });
  });

  describe('トークンの検証', () => {
    it.each([
      ['無効', null],
      ['期限切れ', null],
      ['使用済み', null],
    ])('%s なトークンは400を返す', async (_label, consumed) => {
      mockConsumeToken.mockResolvedValue(consumed);

      const response = await POST(
        createRequest({ token: 'bad-token', password: VALID_PASSWORD }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(PASSWORD_RESET_MESSAGES.INVALID_TOKEN);
    });

    it('トークンが無効ならパスワードを更新しない', async () => {
      mockConsumeToken.mockResolvedValue(null);

      await POST(
        createRequest({ token: 'bad-token', password: VALID_PASSWORD }),
      );

      expect(mockHash).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('トークンの消費はパスワード更新より先に行う', async () => {
      // 更新してから消費すると、同じリンクを同時に2回開かれて両方通る
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(mockConsumeToken.mock.invocationCallOrder[0]).toBeLessThan(
        mockHash.mock.invocationCallOrder[0],
      );
    });

    it('トークンに対応するユーザーが消えていたら400を返す', async () => {
      mockUserAndUpdate(null);

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('入力バリデーション', () => {
    it.each([
      ['トークン未指定', { password: VALID_PASSWORD }],
      ['パスワード未指定', { token: 'valid-token' }],
      ['トークンが空文字', { token: '', password: VALID_PASSWORD }],
      ['パスワードが短い', { token: 'valid-token', password: 'Ab1' }],
      ['大文字なし', { token: 'valid-token', password: 'password1' }],
      ['小文字なし', { token: 'valid-token', password: 'PASSWORD1' }],
      ['数字なし', { token: 'valid-token', password: 'PasswordAb' }],
    ])('%s は400を返す', async (_label, body) => {
      const response = await POST(createRequest(body));

      expect(response.status).toBe(400);
    });

    it('バリデーションエラー時はトークンを消費しない', async () => {
      await POST(createRequest({ token: 'valid-token', password: 'short' }));

      expect(mockConsumeToken).not.toHaveBeenCalled();
    });

    it('新旧パスワードが同じなら400を返す', async () => {
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });
      mockCompare.mockResolvedValue(true);

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(PASSWORD_RESET_MESSAGES.SAME_PASSWORD);
    });
  });

  describe('レート制限', () => {
    it('送信元単位で制限する', async () => {
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        '203.0.113.1',
        'password_reset_confirm',
        10,
        15,
      );
    });

    it('上限を超えたら429を返しトークンを消費しない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('900');
      expect(mockConsumeToken).not.toHaveBeenCalled();
    });

    it('送信元が特定できない場合は制限せずに進む', async () => {
      // IPが取れないだけで正当な利用者を締め出さない
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }, ''),
      );

      expect(mockCheckRateLimit).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe('エラー応答', () => {
    it('更新に失敗したら500を返す', async () => {
      mockUserAndUpdate(
        { id: 'user-1', password_hash: 'old-hash' },
        { message: 'db error' },
      );

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(500);
    });

    it('トークン消費が例外になったら500を返す', async () => {
      mockConsumeToken.mockRejectedValue(new Error('db error'));

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(500);
    });
  });
});
