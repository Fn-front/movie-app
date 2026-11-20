/**
 * @jest-environment node
 */

/**
 * OTP送信API Route テスト
 */

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

import { sendOtpEmail } from '@/lib/otp';

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
const mockReleaseRateLimit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  releaseRateLimit: (...args: unknown[]) => mockReleaseRateLimit(...args),
}));

jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => '123456',
  sendOtpEmail: jest.fn().mockResolvedValue(true),
  randomDelay: jest.fn().mockResolvedValue(undefined),
  hashOtpCode: (code: string, email: string) => `hashed:${email}:${code}`,
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * 送信元IPが取れるリクエスト。
 * Vercel のエッジが付与する x-vercel-forwarded-for はクライアントから改変できない
 * ため、getClientIp はこれを最優先で採用する。
 */
const createRequestFromIp = (body: Record<string, unknown>, ip: string) =>
  new Request('http://localhost/api/auth/otp/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vercel-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });

/**
 * password_change の宛先解決で引く `users.email` をモックする。
 * ボディの email ではなくセッションユーザーのメールを使う仕様（#641）のため、
 * この取得が最初のクエリになる。
 */
const mockSessionUserEmail = (email: string | null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        single: () => ({
          data: email ? { email } : null,
          error: email ? null : { code: 'PGRST116' },
        }),
      }),
    }),
  });
};

/**
 * 前回送信なし + 既存OTP削除 + OTP INSERT成功 のモックを設定
 */
const setupOtpFlowMocks = () => {
  // 前回送信チェック（なし）
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              single: () => ({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      }),
    }),
  });
  // 既存OTP削除
  mockFrom.mockReturnValueOnce({
    delete: () => ({
      eq: () => ({
        eq: () => ({ is: () => ({ data: null, error: null }) }),
      }),
    }),
  });
  // OTP挿入
  mockFrom.mockReturnValueOnce({
    insert: () => ({ error: null }),
  });
};

// --- Tests ---

describe('POST /api/auth/otp/send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks は mockReturnValueOnce のキューを捨てない（捨てるのは
    // mockReset）。途中で返るテストが使い残したキューが次のテストへ漏れると、
    // 以降すべてのモック応答が1つずれて不可解な失敗になる。
    // 他のAPIテスト（settings / password-reset）は既にこうしている
    mockFrom.mockReset();

    // ⚠️ 同じ理由でこの2つもリセットする。
    // `mockResolvedValue`（Once なし）は**永続**なので、1つのテストが
    // 設定すると以降すべてが汚染される（`:765` が実際にそう）。
    // Once 版も、早期 return で消費されないまま次へ漏れる
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (sendOtpEmail as jest.Mock).mockReset();
    (sendOtpEmail as jest.Mock).mockResolvedValue(true);
  });

  it('registration: 正常にOTPを送信できる', async () => {
    // ユーザー検索（未認証ユーザー）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({ email: 'invalid', action: 'unknown' }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('registration: 存在しないメールでも成功レスポンスを返す（メール列挙防止）', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'nouser@example.com', action: 'registration' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('確認コードを送信しました。');
  });

  it('registration: 既に認証済みでも成功レスポンスを返す（メール列挙防止）', async () => {
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
      createRequest({ email: 'verified@example.com', action: 'registration' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('確認コードを送信しました。');
  });

  /**
   * DB障害を「存在しないメール」に化かさない（#1164）
   *
   * 上の2本は**意図した仕様**（メール列挙防止）で、未登録でも成功を返す。
   * ところが `.single()` は読み取りに失敗しても `data: null` を返すため、
   * DB の一時障害まで同じ応答になる。利用者には「送信しました」と出るが
   * **メールは1通も送られない**ので、届かないコードを待ち続ける。
   *
   * 列挙防止は維持すること。「本当に存在しない」は従来どおり 200 のまま、
   * **DB エラーだけ**を 500 に分ける
   */
  it('registration: ユーザーの読み取りに失敗したら、送っていないのに成功を返さない', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: '57P01', message: 'connection terminated' },
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(500);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('login: ユーザーの読み取りに失敗したら、送っていないのに成功を返さない', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: '57P01', message: 'connection terminated' },
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );

    expect(response.status).toBe(500);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  /**
   * 再送クールダウンの読み取り失敗を「前回送信なし」に化かさない（#1164）
   *
   * 握り潰すと、DB が詰まっている間だけ 1分の再送間隔が素通りする。
   * メールボックスへの連投を止める仕組みなので、効かない窓を作らない
   */
  it('再送間隔の読み取りに失敗したらクールダウンを素通りさせない', async () => {
    // ユーザー検索（存在する・未認証）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    // 前回送信チェックが落ちる
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({
                  data: null,
                  error: { code: '57P01', message: 'connection terminated' },
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // ⚠️ この先のモックも積んでおく。積まないと `mockFrom` が undefined を
    // 返して TypeError で 500 になり、**ガードが無くても通ってしまう**
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ data: null, error: null }) }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: () => ({ error: null }) });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(500);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('再送間隔が短すぎる場合429を返す', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    // 前回送信（直近）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({
                  data: { created_at: new Date().toISOString() },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(429);
  });

  it('login: 存在しないメールでも成功レスポンスを返す（メール列挙防止）', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'nouser@example.com', action: 'login' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('確認コードを送信しました。');
  });

  it('password_change: 未認証の場合401を返す', async () => {
    const { getAuthSession } = await import('@/helpers/auth');
    (getAuthSession as jest.Mock).mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        action: 'password_change',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('password_change: 認証済みの場合正常にOTPを送信できる', async () => {
    mockSessionUserEmail('session-user@example.com');
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({
        email: 'session-user@example.com',
        action: 'password_change',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('password_change: ボディの email を無視しセッションユーザー宛に送る（#641）', async () => {
    mockSessionUserEmail('session-user@example.com');
    setupOtpFlowMocks();

    const { sendOtpEmail } = await import('@/lib/otp');

    const response = await POST(
      createRequest({
        // 第三者のアドレスを指定しても、ここへは送られない
        email: 'victim@example.com',
        action: 'password_change',
      }),
    );

    expect(response.status).toBe(200);
    expect(sendOtpEmail).toHaveBeenCalledWith(
      'session-user@example.com',
      '123456',
      'password_change',
    );
    expect(sendOtpEmail).not.toHaveBeenCalledWith(
      'victim@example.com',
      expect.anything(),
      expect.anything(),
    );
  });

  it('password_change: 日次送信上限もセッションユーザーのメールで数える（#641）', async () => {
    mockSessionUserEmail('session-user@example.com');
    setupOtpFlowMocks();

    await POST(
      createRequest({
        email: 'victim@example.com',
        action: 'password_change',
      }),
    );

    // 第三者のアドレスで他人の枠を消費できないこと
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'session-user@example.com',
      'otp_send_daily',
      expect.anything(),
      expect.anything(),
    );
  });

  it('password_change: セッションのユーザーがDBに存在しない場合401を返す', async () => {
    mockSessionUserEmail(null);

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        action: 'password_change',
      }),
    );

    expect(response.status).toBe(401);
  });

  /**
   * DB障害を「未認証」に化かさない（#1165）
   *
   * `.single()` はどんなエラーでも `data: null` を返すため、`error` を
   * 見ないと読み取り失敗が上のテストと同じ 401 になる。セッションは
   * 有効なので本来は 500。このルートは axios 経由（`src/lib/api/auth/auth.ts`）
   * なので、#1157 以前は**その場で強制ログアウト**していた
   */
  it('password_change: セッションユーザーの読み取りに失敗したら401ではなく500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: '57P01', message: 'connection terminated' },
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        action: 'password_change',
      }),
    );

    expect(response.status).toBe(500);
    // 宛先が決まらないまま先へ進んでいないこと。メールも送らず、
    // 日次送信枠（メールボックス保護）も消費しない
    const { sendOtpEmail } = await import('@/lib/otp');
    expect(sendOtpEmail).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('login: 正常にOTPを送信できる', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('OTP挿入時のDBエラーで500を返す', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    // 前回送信チェック（なし）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        }),
      }),
    });
    // 既存OTP削除
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ data: null, error: null }) }),
        }),
      }),
    });
    // OTP挿入失敗
    mockFrom.mockReturnValueOnce({
      insert: () => ({ error: new Error('Insert failed') }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('メール送信失敗で500を返す', async () => {
    // sendOtpEmailをfalseに変更
    const { sendOtpEmail } = await import('@/lib/otp');
    (sendOtpEmail as jest.Mock).mockResolvedValueOnce(false);

    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(500);
  });

  // === 日次送信上限 ===

  it('日次送信上限超過で429を返す', async () => {
    // 上限チェックは「実際に送る直前」まで降りてから行うため、
    // ユーザー検索と再送間隔チェックのモックが先に必要になる
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    // 前回送信なし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        }),
      }),
    });
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 86400,
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('86400');
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.message).toBe(
      '本日の送信上限に達しました。明日再度お試しください。',
    );
  });

  it('日次送信上限チェックがemail単位でotp_send_dailyとして呼ばれる', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    setupOtpFlowMocks();

    await POST(createRequest({ email: 'test@example.com', action: 'login' }));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
      5,
      1440,
    );
  });

  // === 送信しないパスでは日次上限を消費しない ===
  // 枠の目的はメールボックスの保護なので、1通も送らないリクエストで減らさない。
  // 減っていると、第三者が被害者のアドレスを叩くだけで本人の受け取れる通数を削れる。

  it('ユーザーが存在しない場合は日次上限を消費しない', async () => {
    // ユーザー検索（不在）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'nobody@example.com', action: 'login' }),
    );

    expect(response.status).toBe(200);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('既に認証済みの場合は日次上限を消費しない', async () => {
    // ユーザー検索（認証済み）
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
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(200);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('再送間隔内で弾かれる場合は日次上限を消費しない', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    // 直前に送信済み（再送間隔内）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({
                  data: { created_at: new Date().toISOString() },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );

    expect(response.status).toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  // === メールアドレスの正規化 ===

  it('大小文字が異なる表記でも同じカウンタ・同じ宛先に正規化される', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const { sendOtpEmail } = await import('@/lib/otp');

    await POST(
      createRequest({ email: '  TeSt@ExAmPle.COM  ', action: 'login' }),
    );

    // レート制限の識別子が正規化済みであること（表記を変えても枠を分けられない）
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
      5,
      1440,
    );
    // 送信先も正規化済みであること
    expect(sendOtpEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.any(String),
      'login',
    );
  });

  // === 送信元単位のブレーキ（#1341） ===
  //
  // ⚠️ 他の `*_IP` とは塞いでいる穴が違う。このルートは未登録アドレスだと
  // 列挙防止の early return に落ちて `OTP_SEND_DAILY` を消費しないため、
  // `rate_limits` の行は増えない。守っているのは
  // 「1リクエストごとの users SELECT と randomDelay() の 200〜500ms」。
  describe('送信元単位の上限（otp_send_ip）', () => {
    it('検証より前に消費する — 入力が不正でも上限超過なら429を返す', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 3600,
      });

      const response = await POST(
        createRequestFromIp(
          { email: 'not-an-email', action: 'login' },
          '203.0.113.10',
        ),
      );

      // 400 が返るなら IP層が検証の後ろに落ちている
      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        '203.0.113.10',
        'otp_send_ip',
        expect.anything(),
        expect.anything(),
      );
    });

    it('送信元が特定できないときは消費しない（fail-open）', async () => {
      // users の SELECT をモックしないと 500 に落ちる（上のテストのコメント参照）。
      // 否定アサーションなので 500 でも緑になってしまう
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => ({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      });
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      // createRequest は転送ヘッダを付けないため getClientIp は 'unknown'
      const response = await POST(
        createRequest({ email: 'user@example.com', action: 'login' }),
      );

      expect(response.status).toBe(200);
      expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'otp_send_ip',
        expect.anything(),
        expect.anything(),
      );
    });

    it('未登録アドレスでも消費する（列挙防止の early return より前にある）', async () => {
      // ここが肝。未登録だと OTP_SEND_DAILY は消費されないが、
      // IP層は**その手前**にあるので必ず数える。
      // 数えないと users の SELECT と randomDelay を無制限に踏ませられる
      //
      // ⚠️ users の SELECT を必ずモックすること。`beforeEach` の
      // `mockFrom.mockReset()` で `from()` が undefined を返すため、
      // モックしないと `route.ts` の users 検索で例外 → catch → **500** になる。
      // 500 でも `toHaveBeenNthCalledWith(1, ...)` は通ってしまうので、
      // 列挙防止の早期return へ到達しないまま緑になる（レビューで実測）
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => ({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      });
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      const response = await POST(
        createRequestFromIp(
          { email: 'unknown@example.com', action: 'login' },
          '203.0.113.11',
        ),
      );

      // 列挙防止の早期return を通っている（500 ではない）
      expect(response.status).toBe(200);

      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        '203.0.113.11',
        'otp_send_ip',
        expect.anything(),
        expect.anything(),
      );

      // ここが主張の本体。IP層の1回だけで、OTP_SEND_DAILY は消費していない
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });
  });

  describe('処理順', () => {
    // バリデーション → … → レート制限（#940 の例外1・例外2の両方）。
    // 識別子が検証済みのメールアドレスであること、守る資源がメールボックスで
    // 送信の実行と1対1に対応させる必要があることの2つが理由
    // （`.claude/rules/api-route.md`）
    //
    // ⚠️ ここで見ているのは**2層目**（OTP_SEND_DAILY）の順序。1層目の
    // `otp_send_ip` は検証より前にある（上の describe）。
    // createRequest は転送ヘッダを持たないため1層目はスキップされる
    it('バリデーションエラー時はレート制限を消費しない', async () => {
      const response = await POST(
        createRequest({ email: 'not-an-email', action: 'login' }),
      );

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('レート制限超過中でも、メール形式が不正なら400を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        retryAfter: 3600,
      });

      const response = await POST(
        createRequest({ email: 'not-an-email', action: 'login' }),
      );

      expect(response.status).toBe(400);
    });
  });

  /**
   * 送信に失敗したら数えた分を戻す（#1260）
   *
   * 戻さないと「送信に失敗しました」を5回見た時点で「本日の送信上限に
   * 達しました」に変わる。1通も届いていないのに上限扱いになり、
   * #1258 の行き止まり（最大24時間なにもできない）へ落ちる
   */
  describe('送信失敗時の後始末', () => {
    /** login のユーザー検索（存在する）を積む */
    const mockUserFound = () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => ({ data: { id: 'user-1' }, error: null }),
          }),
        }),
      });
    };

    /** 送信が失敗する状態にして POST を叩く */
    const postWithFailedSend = async () => {
      mockUserFound();
      setupOtpFlowMocks();
      // OTP行の削除（ロールバック）
      mockFrom.mockReturnValueOnce({
        delete: () => ({ eq: () => ({ data: null, error: null }) }),
      });
      (sendOtpEmail as jest.Mock).mockResolvedValueOnce(false);

      return POST(
        createRequest({ email: 'test@example.com', action: 'login' }),
      );
    };

    it('日次送信枠を戻す', async () => {
      const response = await postWithFailedSend();

      expect(response.status).toBe(500);
      expect(mockReleaseRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'otp_send_daily',
      );
    });

    /**
     * ⚠️ **挿入した OTP 行は消さない**
     *
     * 60秒の再送間隔チェックはこの行の `created_at` だけを根拠にしている。
     * 消すと次のリクエストが「前回送信なし」で素通りし、日次枠も戻して
     * いるので**この経路の保護が全部無くなる**。送信が失敗し続ける状況で
     * 無制限に Resend を叩かせられる
     */
    it('作ったOTP行は消さない（60秒間隔の根拠を残す）', async () => {
      await postWithFailedSend();

      const otpOps = mockFrom.mock.calls.filter(
        (call) => call[0] === 'otp_codes',
      );

      // 前回送信チェック（select）→ 既存削除 → insert の3回だけ。
      // ロールバック用の delete が増えていないこと
      expect(otpOps).toHaveLength(3);
    });

    it('次のリクエストは再送間隔で弾かれる', async () => {
      // 本題。行が残っていれば60秒は通らない
      await postWithFailedSend();

      // 1回目の使い残しを持ち越さない（キューの取り違えを避ける）
      mockFrom.mockReset();
      mockUserFound();
      // 直前に送信した行が見つかる
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: { created_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const second = await POST(
        createRequest({ email: 'test@example.com', action: 'login' }),
      );

      expect(second.status).toBe(429);
      // Resend へは1回しか到達しない
      expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    });

    /**
     * ⚠️ 戻す枠は**セッションユーザー**のもの（#641 と同じ理屈）
     *
     * ボディ由来のアドレスで戻すと、アカウントを1つ持つだけで
     * **任意のアドレスの枠を減らせる**
     */
    it('password_change ではセッションユーザーの枠を戻す', async () => {
      mockSessionUserEmail('session-user@example.com');
      setupOtpFlowMocks();
      (sendOtpEmail as jest.Mock).mockResolvedValueOnce(false);

      const response = await POST(
        createRequest({
          email: 'victim@example.com',
          action: 'password_change',
        }),
      );

      expect(response.status).toBe(500);
      expect(mockReleaseRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'session-user@example.com',
        'otp_send_daily',
      );
      expect(mockReleaseRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        'victim@example.com',
        expect.anything(),
      );
    });

    it('挿入に失敗したときも戻す', async () => {
      // DB が一時的に詰まっただけで利用者の日次枠を削らない
      mockUserFound();
      // 前回送信チェック（なし）
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({ data: null, error: { code: 'PGRST116' } }),
                }),
              }),
            }),
          }),
        }),
      });
      // 既存OTP削除
      mockFrom.mockReturnValueOnce({
        delete: () => ({
          eq: () => ({ eq: () => ({ is: () => ({ error: null }) }) }),
        }),
      });
      // OTP挿入が失敗する
      mockFrom.mockReturnValueOnce({
        insert: () => ({
          error: { code: '57P01', message: 'connection terminated' },
        }),
      });

      const response = await POST(
        createRequest({ email: 'test@example.com', action: 'login' }),
      );

      expect(response.status).toBe(500);
      expect(mockReleaseRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'otp_send_daily',
      );
      // 送信は試みていない
      expect(sendOtpEmail).not.toHaveBeenCalled();
    });

    it('送信に成功したときは戻さない', async () => {
      mockUserFound();
      setupOtpFlowMocks();

      const response = await POST(
        createRequest({ email: 'test@example.com', action: 'login' }),
      );

      expect(response.status).toBe(200);
      expect(mockReleaseRateLimit).not.toHaveBeenCalled();
    });
  });
});

/**
 * 許可リストに無い action の二重の歯止め（#1287）
 *
 * 一次防御は zod（`PUBLIC_OTP_ACTIONS`）側にあるため、**通常の経路では
 * この分岐に到達しない**（カバレッジにも出ない）。zod をすり抜けた場合に
 * 何が起きるかを固定するため、スキーマだけを差し替えて直接叩く。
 *
 * この else が無かった頃は、許可リストに無い action がユーザー存在チェックも
 * 宛先固定も通らないまま INSERT と sendOtpEmail まで素通りした。公開ルート
 * なので未認証で到達でき、**任意のアドレスへ自サービス名義の確認コードを
 * 送れる**（#641 の穴の再発）。
 */
describe('許可リストに無い action（zod をすり抜けた場合）', () => {
  // ⚠️ `jest.isolateModules` を使う。この describe だけスキーマを緩めるので、
  // 同じモジュールを共有すると他のテストの一次防御まで外れる
  const postWithLooseSchema = async (body: Record<string, unknown>) => {
    let response!: Response;

    await jest.isolateModulesAsync(async () => {
      jest.doMock('@/schema/otp', () => ({
        otpSendSchema: {
          safeParse: (b: unknown) => ({ success: true, data: b }),
        },
      }));

      const { POST: loosePost } = await import('./route');
      response = await loosePost(createRequest(body));
    });

    return response;
  };

  // ⚠️ この describe は最上位の `describe` の外にあるため、
  // そちらの `beforeEach`（mockReset 一式）が効かない。自前で戻す
  beforeEach(() => {
    mockFrom.mockReset();
    mockCheckRateLimit.mockReset();
    (sendOtpEmail as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.dontMock('@/schema/otp');
  });

  it('400を返し、メールを送らない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });

    const response = await postWithLooseSchema({
      email: 'victim@example.com',
      action: 'two_factor',
    });

    expect(response.status).toBe(400);
    // ここが肝。1通も送らない
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('日次送信枠も消費しない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });

    await postWithLooseSchema({
      email: 'victim@example.com',
      action: 'two_factor',
    });

    expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'otp_send_daily',
      expect.anything(),
      expect.anything(),
    );
  });
});
