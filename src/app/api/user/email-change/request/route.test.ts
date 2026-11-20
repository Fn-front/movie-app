/**
 * @jest-environment node
 */

/**
 * メールアドレス変更: 確認コード送信 API Route テスト（#1359）
 *
 * ⚠️ **宛先はまだ本人のものでないアドレス。** 認証・パスワード照合・重複確認を
 * どれか1つでも飛ばすと、自サービス名義で任意の宛先へ送れるようになる。
 */

import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { EMAIL_CHANGE_MESSAGES } from '@/constants/emailChange';

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

const mockSendEmailChangeCode = jest.fn();
jest.mock('@/lib/auth/emailChange', () => ({
  ...jest.requireActual('@/lib/auth/emailChange'),
  sendEmailChangeCode: (...args: unknown[]) => mockSendEmailChangeCode(...args),
}));

const mockCompare = jest.fn();
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: (...args: unknown[]) => mockCompare(...args) },
}));

// --- Helpers ---

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/user/email-change/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const validBody = {
  newEmail: 'new@example.com',
  currentPassword: 'pw',
};

/**
 * users の2本のクエリをモックする
 *
 * 1本目: 自分の行（email / password_hash）
 * 2本目: 新アドレスの重複確認（count）
 */
const mockQueries = (options: {
  passwordHash?: string | null;
  currentEmail?: string;
  existingCount?: number;
  countError?: unknown;
  userError?: unknown;
}) => {
  const {
    passwordHash = 'hashed',
    currentEmail = 'old@example.com',
    existingCount = 0,
    countError = null,
    userError = null,
  } = options;

  mockFrom
    .mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: userError
                ? null
                : { email: currentEmail, password_hash: passwordHash },
              error: userError,
            }),
        }),
      }),
    })
    .mockReturnValueOnce({
      select: () => ({
        eq: () =>
          Promise.resolve({
            count: countError ? null : existingCount,
            error: countError,
          }),
      }),
    });
};

// --- Tests ---

describe('POST /api/user/email-change/request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // ⚠️ `clearAllMocks` は **`mockReturnValueOnce` の積みを消さない**。
    //    前のテストが使い残した応答があると順序がずれ、別の分岐に入る
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCompare.mockResolvedValue(true);
    mockSendEmailChangeCode.mockResolvedValue('sent');
  });

  describe('認証', () => {
    it('未認証で401を返し、送信しない', async () => {
      mockGetAuthSession.mockResolvedValue(null);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(401);
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });
  });

  describe('入力の検証', () => {
    it.each([
      ['アドレスが不正', { newEmail: 'not-an-email', currentPassword: 'pw' }],
      ['パスワードが空', { newEmail: 'new@example.com', currentPassword: '' }],
      ['アドレスが無い', { currentPassword: 'pw' }],
    ])('%s なら400を返し、送信しない', async (_label, body) => {
      const response = await POST(createRequest(body));

      expect(response.status).toBe(400);
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });

    it('壊れたJSONでも400を返す', async () => {
      const response = await POST(createRequest('{"newEmail":'));

      expect(response.status).toBe(400);
    });
  });

  describe('パスワードの確認', () => {
    it('違えば400を返し、送信しない', async () => {
      mockQueries({});
      mockCompare.mockResolvedValue(false);

      const response = await POST(createRequest(validBody));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
      );
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ ソーシャル連携のみの利用者は対象外。
     *
     * アプリ側の `users.email` だけ変えると provider 側のアドレスと食い違い、
     * 次回のソーシャルログインで何が起きるか読めない。
     */
    it('パスワードを持たない利用者は対象外', async () => {
      mockQueries({ passwordHash: null });

      const response = await POST(createRequest(validBody));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(EMAIL_CHANGE_MESSAGES.PASSWORD_REQUIRED);
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });
  });

  describe('宛先の確認', () => {
    it('今と同じアドレスなら送らない', async () => {
      mockQueries({ currentEmail: 'new@example.com' });

      const response = await POST(createRequest(validBody));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(EMAIL_CHANGE_MESSAGES.SAME_AS_CURRENT);
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **重複はここで弾く。**
     *
     * 検証まで遅らせると、他人が使っているアドレスへ確認コードを送って
     * しまう（自サービス名義の迷惑メール）。
     */
    it('既に使われているアドレスへは送らない', async () => {
      mockQueries({ existingCount: 1 });

      const response = await POST(createRequest(validBody));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(EMAIL_CHANGE_MESSAGES.ALREADY_USED);
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ `error` を捨てると「空いている」に化け、DB障害中だけ重複を許す。
     * 通ってしまうと UNIQUE 違反まで気づけない。
     */
    it('重複の確認に失敗したら送らず500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockQueries({ countError: { message: 'db down' } });

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(500);
      expect(mockSendEmailChangeCode).not.toHaveBeenCalled();
    });
  });

  describe('送信', () => {
    it('正規化したアドレスへ送る', async () => {
      mockQueries({});

      const response = await POST(
        createRequest({ ...validBody, newEmail: 'New@Example.COM' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe(EMAIL_CHANGE_MESSAGES.CODE_SENT);
      // ⚠️ 識別子はセッションの利用者ID。宛先で数えると掛け算できる
      expect(mockSendEmailChangeCode).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'new@example.com',
      );
    });

    it.each([
      ['送信枠を使い切った', 'limit_exceeded', 429],
      ['再送間隔の内側', 'throttled', 429],
      ['送信そのものに失敗', 'send_failed', 500],
    ])('%s なら %s を返す', async (_label, result, status) => {
      if (status === 500) {
        jest.spyOn(console, 'error').mockImplementation(() => {});
      }
      mockQueries({});
      mockSendEmailChangeCode.mockResolvedValue(result);

      const response = await POST(createRequest(validBody));

      expect(response.status).toBe(status);
    });
  });
});
