/**
 * @jest-environment node
 */

/**
 * 新規登録API Route テスト
 */

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockGenerateOtpCode = jest.fn().mockReturnValue('123456');
const mockSendOtpEmail = jest.fn().mockResolvedValue(true);
const mockRandomDelay = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => mockGenerateOtpCode(),
  sendOtpEmail: (...args: unknown[]) => mockSendOtpEmail(...args),
  randomDelay: () => mockRandomDelay(),
  // 保存値はハッシュ。実装と同じ形（hex 64文字）にしておく
  hashOtpCode: (code: string, email: string) => `hashed:${email}:${code}`,
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * 送信元IPが取れるリクエスト。
 * Vercel のエッジが付与する x-vercel-forwarded-for はクライアントから改変できない。
 */
const createRequestFromIp = (body: Record<string, unknown>, ip: string) =>
  new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vercel-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });

/**
 * 既存ユーザーなし + INSERT成功 + OTP INSERT成功 のモックを設定
 */
const setupSuccessMocks = () => {
  // 既存ユーザーなし
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ single: () => ({ data: null, error: null }) }),
    }),
  });
  // ユーザーINSERT成功
  mockFrom.mockReturnValueOnce({
    insert: () => ({
      select: () => ({
        single: () => ({
          data: { id: 'user-123' },
          error: null,
        }),
      }),
    }),
  });
  // OTP INSERT成功
  mockFrom.mockReturnValueOnce({
    insert: () => ({ error: null }),
  });
};

// --- Tests ---

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常に登録でき、OTPメールが送信される', async () => {
    setupSuccessMocks();

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.userId).toBe('user-123');
    expect(mockGenerateOtpCode).toHaveBeenCalled();
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'test@example.com',
      '123456',
      'registration',
    );
    // タイミング均一化: 新規成功パスも randomDelay を通す
    expect(mockRandomDelay).toHaveBeenCalledTimes(1);
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({
        email: 'invalid',
        password: '123',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('既存メールでも新規登録と区別できない成功レスポンス（201）を返す（列挙防止）', async () => {
    // 既存ユーザーあり
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'existing', is_verified: true },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'existing@example.com',
        password: 'Password1',
      }),
    );
    const json = await response.json();

    // 新規作成時（201・success:true・data.userId・message）と同一形状
    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(typeof json.data.userId).toBe('string');
    expect(json.message).toBe('確認コードをメールに送信しました。');

    // 内部では新規ユーザー・OTPを作成せず、メールも送信しない
    expect(mockFrom).toHaveBeenCalledTimes(1); // 既存チェックのSELECTのみ
    expect(mockGenerateOtpCode).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
    // タイミング均一化: 既存メール分岐も randomDelay を通す
    expect(mockRandomDelay).toHaveBeenCalledTimes(1);
  });

  it('既存メール時のレスポンス形状が新規登録時と区別できない', async () => {
    // 新規登録の成功レスポンス
    setupSuccessMocks();
    const newUserRes = await POST(
      createRequest({ email: 'new@example.com', password: 'Password1' }),
    );
    const newUserJson = await newUserRes.json();

    jest.clearAllMocks();

    // 既存メールのレスポンス
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'existing', is_verified: true },
            error: null,
          }),
        }),
      }),
    });
    const existingRes = await POST(
      createRequest({ email: 'existing@example.com', password: 'Password1' }),
    );
    const existingJson = await existingRes.json();

    // ステータス・キー構成・型が一致（userId 値のみ異なるダミー）
    expect(existingRes.status).toBe(newUserRes.status);
    expect(Object.keys(existingJson).sort()).toEqual(
      Object.keys(newUserJson).sort(),
    );
    expect(Object.keys(existingJson.data).sort()).toEqual(
      Object.keys(newUserJson.data).sort(),
    );
    expect(existingJson.success).toBe(newUserJson.success);
    expect(existingJson.message).toBe(newUserJson.message);
    expect(typeof existingJson.data.userId).toBe(
      typeof newUserJson.data.userId,
    );
  });

  it('ユーザーINSERT失敗で500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: null,
            error: new Error('DB error'),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(500);
  });

  it('OTPメール送信失敗で500を返し、ユーザー・OTPレコードを削除する', async () => {
    // 既存ユーザーなし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    // ユーザーINSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: { id: 'user-123' },
            error: null,
          }),
        }),
      }),
    });
    // OTP INSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({ error: null }),
    });

    mockSendOtpEmail.mockResolvedValueOnce(false);

    // ロールバック: OTPレコード削除
    const mockOtpDelete = jest.fn().mockReturnValue({ eq: jest.fn() });
    mockFrom.mockReturnValueOnce({ delete: mockOtpDelete });
    // ロールバック: ユーザーレコード削除
    const mockUserDelete = jest.fn().mockReturnValue({ eq: jest.fn() });
    mockFrom.mockReturnValueOnce({ delete: mockUserDelete });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    // ロールバックが実行されたことを確認
    expect(mockOtpDelete).toHaveBeenCalled();
    expect(mockUserDelete).toHaveBeenCalled();
  });

  it('レート制限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 3600,
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('OTP INSERT失敗で500を返す', async () => {
    // 既存ユーザーなし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    // ユーザーINSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: { id: 'user-123' },
            error: null,
          }),
        }),
      }),
    });
    // OTP INSERT失敗
    mockFrom.mockReturnValueOnce({
      insert: () => ({ error: new Error('OTP insert error') }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(500);
  });
});

describe('POST /api/auth/register — 未検証ユーザーの上書き（#645）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendOtpEmail.mockResolvedValue(true);
    mockGenerateOtpCode.mockReturnValue('123456');
  });

  /** 未検証の既存ユーザーが見つかる状態のモック */
  const mockUnverifiedExistingUser = () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'squatted-user-id', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
  };

  /** users の UPDATE を記録しつつ成功させるモック */
  const mockUserUpdate = (captured: { payload?: unknown }) => {
    mockFrom.mockReturnValueOnce({
      update: (payload: unknown) => {
        captured.payload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: () => ({ data: { id: 'squatted-user-id' }, error: null }),
            }),
          }),
        };
      },
    });
  };

  /** 旧OTP削除 → OTP INSERT のモック */
  const mockOtpReissue = () => {
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({ eq: () => ({ is: () => ({ error: null }) }) }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: () => ({ error: null }) });
  };

  it('未検証ユーザーが居ても登録を完了できる（締め出しが起きない）', async () => {
    mockUnverifiedExistingUser();
    mockUserUpdate({});
    mockOtpReissue();

    const response = await POST(
      createRequest({ email: 'victim@example.com', password: 'Password1' }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    // ダミーUUIDではなく実際のユーザーIDが返る
    expect(json.data.userId).toBe('squatted-user-id');
    // 確認コードが実際に送信される（従来は何もせず成功を装っていた）
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'victim@example.com',
      '123456',
      'registration',
    );
  });

  it('第三者が設定した password_hash を上書きする（乗っ取り経路の封鎖）', async () => {
    const captured: { payload?: unknown } = {};
    mockUnverifiedExistingUser();
    mockUserUpdate(captured);
    mockOtpReissue();

    await POST(
      createRequest({ email: 'victim@example.com', password: 'Password1' }),
    );

    expect(captured.payload).toEqual({
      password_hash: 'hashed_password',
      name: null,
    });
  });

  it('上書き時に旧い未検証OTPを削除する（有効なコードを1つに保つ）', async () => {
    const deleteCalls: string[] = [];
    mockUnverifiedExistingUser();
    mockUserUpdate({});
    mockFrom.mockReturnValueOnce({
      delete: () => {
        deleteCalls.push('otp_codes.delete');
        return { eq: () => ({ eq: () => ({ is: () => ({ error: null }) }) }) };
      },
    });
    mockFrom.mockReturnValueOnce({ insert: () => ({ error: null }) });

    await POST(
      createRequest({ email: 'victim@example.com', password: 'Password1' }),
    );

    expect(deleteCalls).toContain('otp_codes.delete');
  });

  it('認証済みユーザーの場合は上書きせず列挙防止レスポンスを返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'verified-user', is_verified: true },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'owner@example.com', password: 'Password1' }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    // 実IDは漏らさない
    expect(json.data.userId).not.toBe('verified-user');
    // 上書きもメール送信も行わない
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('上書き時のメール送信失敗では既存の users 行を削除しない', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    const deletedTables: string[] = [];
    mockUnverifiedExistingUser();
    mockUserUpdate({});
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({ eq: () => ({ is: () => ({ error: null }) }) }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: () => ({ error: null }) });
    // ロールバック: otp_codes の削除のみが呼ばれるはず
    mockFrom.mockImplementation(() => ({
      delete: () => {
        deletedTables.push('delete');
        return { eq: () => ({ error: null }) };
      },
    }));

    const response = await POST(
      createRequest({ email: 'victim@example.com', password: 'Password1' }),
    );

    expect(response.status).toBe(500);
    // otp_codes の1回だけ（users の削除が走っていない）
    expect(deletedTables).toHaveLength(1);
  });

  // === レート制限の識別子と送信カウンタ ===

  it('登録試行はアカウント×送信元で数える', async () => {
    setupSuccessMocks();

    await POST(
      createRequestFromIp(
        { email: 'test@example.com', password: 'Password1' },
        '203.0.113.10',
      ),
    );

    // 識別子にメール単独を使うと、第三者が被害者のメールで数回POSTするだけで
    // 本人を60分間登録不能にできる（#644と同種）
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com|203.0.113.10',
      'register',
      5,
      60,
    );
  });

  it('確認コード送信前に日次送信上限（メール単位）を消費する', async () => {
    setupSuccessMocks();

    await POST(
      createRequestFromIp(
        { email: 'test@example.com', password: 'Password1' },
        '203.0.113.10',
      ),
    );

    // メールボックス保護の枠は送信元で割らない（IPを変えても掛け算できない）
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
      5,
      1440,
    );
  });

  it('日次送信上限を超えたら429を返し、ユーザー行を作らない', async () => {
    // 既存ユーザーなし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    // 1回目（register）は許可、2回目（otp_send_daily）で拒否
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 86400 });

    const response = await POST(
      createRequest({ email: 'test@example.com', password: 'Password1' }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('Retry-After')).toBe('86400');
    // 枠切れでユーザー行やOTPを作らない（INSERTは既存ユーザー検索の1回のみ）
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('認証済みメールの早期returnでは日次送信上限を消費しない', async () => {
    // 既存ユーザー（認証済み）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: true },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', password: 'Password1' }),
    );

    // 列挙防止のため 201 を返すが、メールは送らないので枠も減らさない
    expect(response.status).toBe(201);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
      expect.anything(),
      expect.anything(),
    );
  });

  // === メールアドレスの正規化 ===

  it('大小文字が異なる表記でも同じ送信カウンタに正規化される', async () => {
    setupSuccessMocks();

    await POST(
      createRequest({ email: 'TeSt@ExAmPle.COM', password: 'Password1' }),
    );

    // 表記を変えても枠を分けられない＝同一メールボックスへの多重送信を塞ぐ
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
      5,
      1440,
    );
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.any(String),
      'registration',
    );
  });
});
