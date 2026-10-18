/**
 * @jest-environment node
 */

/**
 * パスワードリセット発行API Route テスト
 */

process.env.NEXTAUTH_URL = 'https://movie.example.com';

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

const mockIssueToken = jest.fn();
jest.mock('@/lib/auth/passwordResetToken', () => ({
  issuePasswordResetToken: (...args: unknown[]) => mockIssueToken(...args),
}));

const mockSendEmail = jest.fn();
jest.mock('@/lib/auth/sendPasswordResetEmail', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockRandomDelay = jest.fn();
jest.mock('@/lib/otp', () => ({
  randomDelay: (...args: unknown[]) => mockRandomDelay(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** users の検索結果をモックする */
const mockUserLookup = (user: { id: string; is_verified: boolean } | null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: user }),
      }),
    }),
  });
};

// --- Tests ---

describe('POST /api/auth/password-reset/request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks は mockReturnValueOnce のキューを消さない
    mockFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockIssueToken.mockResolvedValue('plain-token');
    mockSendEmail.mockResolvedValue(true);
    mockRandomDelay.mockResolvedValue(undefined);
  });

  describe('正常系', () => {
    it('登録済みユーザーにリンクを送る', async () => {
      mockUserLookup({ id: 'user-1', is_verified: true });

      const response = await POST(createRequest({ email: 'user@example.com' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED);
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it('トークン付きのURLを設定値から組み立てる', async () => {
      // Host ヘッダを信用すると、攻撃者のホスト宛リンクをメールで配れてしまう
      mockUserLookup({ id: 'user-1', is_verified: true });

      await POST(createRequest({ email: 'user@example.com' }));

      expect(mockSendEmail).toHaveBeenCalledWith(
        'user@example.com',
        'https://movie.example.com/auth/reset-password?token=plain-token',
      );
    });

    it('メールアドレスを正規化して扱う', async () => {
      mockUserLookup({ id: 'user-1', is_verified: true });

      await POST(createRequest({ email: '  User@Example.COM  ' }));

      expect(mockSendEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
      );
    });
  });

  describe('アカウント列挙の防止', () => {
    it('未登録のメールでも同じ応答を返す', async () => {
      mockUserLookup(null);

      const response = await POST(
        createRequest({ email: 'nobody@example.com' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED);
    });

    it('未登録のメールにはリンクを送らない', async () => {
      mockUserLookup(null);

      await POST(createRequest({ email: 'nobody@example.com' }));

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockIssueToken).not.toHaveBeenCalled();
    });

    it('未登録のときも所要時間を揃えるため遅延を挟む', async () => {
      // 応答時間の差だけでも登録の有無を判別できる
      mockUserLookup(null);

      await POST(createRequest({ email: 'nobody@example.com' }));

      expect(mockRandomDelay).toHaveBeenCalled();
    });

    it('メール未確認のアカウントにはリンクを送らず同じ応答を返す', async () => {
      // 他人のアドレスで登録しておき、リセット経由で確認済み相当に
      // 昇格させる筋を残さない
      mockUserLookup({ id: 'user-1', is_verified: false });

      const response = await POST(createRequest({ email: 'user@example.com' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('入力バリデーション', () => {
    it.each([
      ['メール未入力', {}],
      ['メール形式が不正', { email: 'not-an-email' }],
      ['空文字', { email: '' }],
    ])('%s は400を返す', async (_label, body) => {
      const response = await POST(createRequest(body));

      expect(response.status).toBe(400);
    });

    it('バリデーションエラー時はユーザー検索もしない', async () => {
      await POST(createRequest({ email: 'bad' }));

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('レート制限', () => {
    it('メールアドレス単位で制限する', async () => {
      // 識別子にIPを混ぜるとIP数だけ掛け算でき、メールボックス保護が壊れる
      mockUserLookup({ id: 'user-1', is_verified: true });

      await POST(createRequest({ email: 'user@example.com' }));

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user@example.com',
        'password_reset_request',
        5,
        60,
      );
    });

    it('上限を超えたら429を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        retryAfter: 3600,
      });

      const response = await POST(createRequest({ email: 'user@example.com' }));

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('3600');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('エラー応答', () => {
    it('メール送信に失敗したら500を返す', async () => {
      mockUserLookup({ id: 'user-1', is_verified: true });
      mockSendEmail.mockResolvedValue(false);

      const response = await POST(createRequest({ email: 'user@example.com' }));

      expect(response.status).toBe(500);
    });

    it('トークン発行が例外になったら500を返す', async () => {
      mockUserLookup({ id: 'user-1', is_verified: true });
      mockIssueToken.mockRejectedValue(new Error('db error'));

      const response = await POST(createRequest({ email: 'user@example.com' }));

      expect(response.status).toBe(500);
    });
  });
});
