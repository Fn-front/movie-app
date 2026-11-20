/**
 * @jest-environment node
 */

/**
 * OTP検証API Route テスト
 */

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

import { POST } from './route';
import { hashOtpCode } from '@/lib/otp';
import { OTP_ERROR_MESSAGES } from '@/constants/otp';

// --- Mocks ---

const mockFrom = jest.fn();
/**
 * `increment_otp_attempts` RPC（#1284）
 *
 * ⚠️ 既定は「加算後 1」。加算後の値で上限を判定しているため（#1248）、
 * 境界のテストはここを上書きして返す値を決める。
 */
const mockRpc = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom, rpc: mockRpc }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
const mockResetRateLimit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  resetRateLimit: (...args: unknown[]) => mockResetRateLimit(...args),
}));

const mockSendPasswordInvalidatedEmail = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/auth/sendPasswordInvalidatedEmail', () => ({
  sendPasswordInvalidatedEmail: (...args: unknown[]) =>
    mockSendPasswordInvalidatedEmail(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/otp/verify', {
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
  new Request('http://localhost/api/auth/otp/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vercel-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });

const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();

// --- Tests ---

describe('POST /api/auth/otp/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // ⚠️ clearAllMocks は mockReturnValueOnce のキューを消さない。
    // 消し忘れると、消費しきれなかった分が**後続のテストに漏れて**
    // 関係ないテストが落ちる（実測）
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: 1, error: null });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendPasswordInvalidatedEmail.mockResolvedValue(true);
  });

  it('registration: 正常にOTPを検証して認証完了できる', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      action_type: 'registration',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // users の係争フラグ読み取り（#1325）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { password_contested: false }, error: null }),
        }),
      }),
    });
    // usersテーブル更新。
    // ⚠️ `.eq()` 2つ（email / is_verified）＋ `.select('id')` まで繋ぐ（#1325）。
    // 失効の有無を呼び出し側が件数で見ているので、省くと 500 に落ちる
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ data: [{ id: 'user-1' }], error: null }),
          }),
        }),
      }),
    });
    // OTPレコード削除
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('メール認証');
    // 検証成功時にレート制限がリセットされる
    expect(mockResetRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_verify',
    );
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({
        email: 'invalid',
        code: '12',
        action: 'unknown',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('OTPレコードが見つからない場合400を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('有効期限切れの場合400を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      attempts: 0,
                      expires_at: pastDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toContain('有効期限');
  });

  it('試行回数超過の場合429を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      attempts: 5,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(429);
  });

  it('コードが不一致の場合400を返す', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      attempts: 2,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // attempts更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '999999',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.details).toBeUndefined();
  });

  /**
   * REGISTRATION 分岐のパスワード失効（#1325）
   *
   * ⚠️ **#1361 でメールOTPログインを消したとき、この describe を巻き添えで
   * 消した。** 旧 `LOGIN のメール認証` の中に入れ子になっていたためだが、
   * 中身は**いまも生きている REGISTRATION 分岐**のテストだった。
   * 変異テストで `passwordContested = false` を当てても誰も落ちない状態に
   * なっていた（レビューで実測）。
   */
  /** OTP行の取得を積む */
  const mockOtpFetch = (actionType: string) => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      action_type: actionType,
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
  };

  describe('registration の失効（#1325）', () => {
    /**
     * REGISTRATION 分岐のモックを積む
     *
     * ⚠️ 印は **`users`** から読む。`otp_codes` に持たせると、
     * 攻撃者が同じ register を2回送るだけで印の付いた行ごと消えて
     * 印なしの行に置き換わる（レビューで実測した critical）。
     *
     * @param contested - `users.password_contested`
     * @param promoted - UPDATE が行を返すか（`is_verified=false` に
     *   当たったか）
     * @returns UPDATE に渡された値と、`.eq()` の呼び出し履歴
     */
    const mockRegistrationBranch = (contested: boolean, promoted = true) => {
      const captured: {
        values?: Record<string, unknown>;
        eq: unknown[][];
      } = { eq: [] };

      // users の印を読む
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: { password_contested: contested },
              error: null,
            }),
          }),
        }),
      });

      // users の UPDATE（eq 2つ + select）
      mockFrom.mockReturnValueOnce({
        update: (values: Record<string, unknown>) => {
          captured.values = values;
          const chain = {
            eq: (column: string, value: unknown) => {
              captured.eq.push([column, value]);
              return captured.eq.length < 2
                ? chain
                : {
                    select: () => ({
                      data: promoted ? [{ id: 'user-1' }] : [],
                      error: null,
                    }),
                  };
            },
          };
          return chain;
        },
      });

      // OTPレコード削除
      mockFrom.mockReturnValueOnce({
        delete: () => ({ eq: () => ({ data: null, error: null }) }),
      });

      return captured;
    };

    it('係争していなければ失効させない（通常の新規登録）', async () => {
      // 利用者がいま登録フォームで決めたパスワード。消すと通常の
      // 新規登録が毎回パスワード無しで終わる
      mockOtpFetch('registration');
      const captured = mockRegistrationBranch(false);

      const response = await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      );

      expect(response.status).toBe(200);
      expect(captured.values).toEqual({ is_verified: true });
      expect(mockSendPasswordInvalidatedEmail).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ ここが #1325 の本体。
     *
     * 第三者に上書きされたパスワードを載せたまま昇格させると、
     * 攻撃者が `victim@example.com / AttackerPass` でログインできる。
     */
    it('係争中なら昇格と同時にパスワードを失効させる', async () => {
      mockOtpFetch('registration');
      const captured = mockRegistrationBranch(true);

      const response = await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      );

      expect(response.status).toBe(200);
      expect(captured.values).toEqual({
        is_verified: true,
        password_hash: null,
        // 印も一緒に下ろす。残すと意味が「過去に係争があった」へずれる
        password_contested: false,
      });
    });

    /**
     * ⚠️ LOGIN 分岐と同じ不変条件（`.eq('is_verified', false)`）。
     *
     * これが無いと、別経路（メールでログイン）で先に昇格した後に古い
     * REGISTRATION のコードを投入して、**認証済みユーザーの
     * `password_hash` を NULL にできる**。
     */
    it('既に認証済みのユーザーには当たらない（is_verified=false で絞る）', async () => {
      mockOtpFetch('registration');
      const captured = mockRegistrationBranch(true);

      await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      );

      expect(captured.eq).toEqual([
        ['email', 'test@example.com'],
        ['is_verified', false],
      ]);
    });

    it('係争中に失効させたら通知する', async () => {
      // 伝えないと、利用者は次のパスワードログインが弾かれる理由を
      // 知るすべがない
      mockOtpFetch('registration');
      mockRegistrationBranch(true, true);

      await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      );

      expect(mockSendPasswordInvalidatedEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('更新対象が0件なら通知しない', async () => {
      // パスワードは消えていないので、通知すると「無効にした」という嘘になる
      mockOtpFetch('registration');
      mockRegistrationBranch(true, false);

      await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      );

      expect(mockSendPasswordInvalidatedEmail).not.toHaveBeenCalled();
    });

    it('通知の送信に失敗しても検証は成功する', async () => {
      // 失効そのものは済んでおり保護は効いている。ここで 500 にすると
      // 正しいコードを入れた利用者が行き止まりに入る
      mockSendPasswordInvalidatedEmail.mockResolvedValue(false);
      mockOtpFetch('registration');
      mockRegistrationBranch(true, true);

      const response = await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      );

      expect(response.status).toBe(200);
    });
  });

  /**
   * 上限ちょうどの回を「間違っています」で終わらせない（#1248）
   *
   * 入口の判定（`route.ts:136`）は**前回までの** attempts しか見ないため、
   * 上限に達した回は通常の失敗として返っていた。利用者は必ず1回、もう
   * 使えないコードを打つことになる
   */
  describe('試行上限の境界', () => {
    /** 指定の attempts を持つ OTP 行と、その更新をモックする */
    const mockOtpWithAttempts = (attempts: number) => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: () => ({
                    single: () => ({
                      data: {
                        id: 'otp-1',
                        code_hash: hashOtpCode('123456', 'test@example.com'),
                        attempts,
                        expires_at: futureDate,
                        verified_at: null,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });
      // ⚠️ 上限の判定は**加算後**の値で行う（#1248）。その値を返すのは
      //    RPC なので、ここで returnする値が境界そのものになる（#1284）
      mockRpc.mockResolvedValue({
        data: Math.min(attempts + 1, 5),
        error: null,
      });
    };

    const postWrongCode = () =>
      POST(
        createRequest({
          email: 'test@example.com',
          code: '999999',
          action: 'registration',
        }),
      );

    it('加算後に上限へ達したら、その回で上限として返す', async () => {
      // attempts=4 → 加算して 5（MAX_ATTEMPTS）
      mockOtpWithAttempts(4);

      const response = await postWrongCode();
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error.message).toBe(OTP_ERROR_MESSAGES.MAX_ATTEMPTS_EXCEEDED);
    });

    it('上限の手前なら通常の失敗として返す', async () => {
      // attempts=3 → 加算して 4。まだ1回残っている
      mockOtpWithAttempts(3);

      const response = await postWrongCode();
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(OTP_ERROR_MESSAGES.INVALID_CODE);
    });

    /**
     * 加算を省くと、入口の判定（次のリクエスト）が効かなくなる。
     *
     * ⛔ **read-then-write で書き戻さない**（#1284）。N 並列だと全員が
     * 同じ `attempts` を読んで同じ値を書くため、**0→1 が N 回**起きる
     * だけになり、5回上限が機能しない。
     */
    it('上限に達していても試行回数は加算する', async () => {
      mockOtpWithAttempts(4);

      await postWrongCode();

      expect(mockRpc).toHaveBeenCalledWith('increment_otp_attempts', {
        p_id: 'otp-1',
      });
    });

    // ⚠️ 直接 UPDATE してはいけない（式は PostgREST から書けない）
    it('otp_codes を直接 UPDATE しない', async () => {
      const update = jest.fn(() => ({
        eq: () => ({ data: null, error: null }),
      }));

      mockOtpWithAttempts(2);
      mockFrom.mockReturnValue({ update });

      await postWrongCode();

      expect(update).not.toHaveBeenCalled();
    });
  });

  it('registration: is_verified更新失敗で500を返す', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      action_type: 'registration',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // usersテーブル更新失敗
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: new Error('Update failed') }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('password_change: 正常にOTPを検証して検証済みフラグを設定できる', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      action_type: 'password_change',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // OTPレコード更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'password_change',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    // 検証成功時にレート制限がリセットされる
    expect(mockResetRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_verify',
    );
  });

  it('コード不一致（検証失敗）時はレート制限をリセットしない', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // attempts更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '999999',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockResetRateLimit).not.toHaveBeenCalled();
  });

  it('検証試行のレート制限超過の場合429を返し、コード照合をスキップする', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(response.headers.get('Retry-After')).toBe('600');
    // レート制限で早期リターンするため、otp_codes取得は行われない
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('検証試行のレート制限超過（retryAfterなし）でも429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeNull();
  });

  it('email単位でレート制限が掛かる（識別子・アクション種別・上限が正しい）', async () => {
    // OTPレコード取得（正常系にして通過させる）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      action_type: 'login',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // users の昇格（`.eq` 2段 + `.select`）
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          eq: () => ({ select: () => ({ data: [], error: null }) }),
        }),
      }),
    });
    // OTPレコード更新
    mockFrom.mockReturnValueOnce({
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    });

    await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'password_change',
      }),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_verify',
      10,
      10,
    );
  });

  // === レート制限の識別子（#644 と同種のロックアウト対策） ===

  it('送信元が取れる場合はアカウント×送信元で数える', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code_hash: hashOtpCode('123456', 'test@example.com'),
                      attempts: 0,
                      expires_at: futureDate,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // users の係争フラグ読み取り（#1325）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { password_contested: false }, error: null }),
        }),
      }),
    });
    // usersテーブル更新。eq 2つ + `.select('id')` まで繋ぐ（#1325）
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ data: [{ id: 'user-1' }], error: null }),
          }),
        }),
      }),
    });
    // OTPレコード削除
    mockFrom.mockReturnValueOnce({
      delete: () => ({ eq: () => ({ data: null, error: null }) }),
    });

    await POST(
      createRequestFromIp(
        { email: 'test@example.com', code: '123456', action: 'registration' },
        '203.0.113.10',
      ),
    );

    // 識別子にメール単独を使うと、コードを知らない第三者が誤ったコードを
    // 送り続けるだけで被害者の検証を封鎖できる。送信元を含めることで
    // ロックされるのは試行した本人だけになる。
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com|203.0.113.10',
      'otp_verify',
      10,
      10,
    );
    // 成功時のリセットも同じ識別子でなければ解除されない
    expect(mockResetRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com|203.0.113.10',
      'otp_verify',
    );
  });

  it('第三者が別の送信元から失敗を重ねても被害者の識別子は消費されない', async () => {
    // ⚠️ レート制限は2層ある（#1331）。1層目の `otp_verify_ip` を明示的に
    // 通してから2層目を落とす。`mockResolvedValueOnce` を1つだけ積むと
    // 1層目が消費して検証へ到達せず、固定したい2層目を何も見ないまま緑になる
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

    const response = await POST(
      createRequestFromIp(
        {
          email: 'victim@example.com',
          code: '000000',
          action: 'password_change',
        },
        '198.51.100.7',
      ),
    );

    expect(response.status).toBe(429);
    // ロック対象は攻撃者の送信元を含む識別子であって、被害者のメール単独ではない
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'victim@example.com|198.51.100.7',
      'otp_verify',
      10,
      10,
    );
    expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
      expect.anything(),
      'victim@example.com',
      'otp_verify',
      expect.anything(),
      expect.anything(),
    );
  });

  it('送信元が特定できない場合はメールアドレス単独にフォールバックする', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 600,
    });

    // createRequest は転送ヘッダを付けない（ローカル起動やヘッダ欠落の想定）
    await POST(
      createRequest({
        email: 'test@example.com',
        code: '000000',
        action: 'password_change',
      }),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_verify',
      10,
      10,
    );
  });

  // === メールアドレスの正規化 ===

  it('大小文字が異なる表記でも同じ識別子に正規化される', async () => {
    // 1層目（otp_verify_ip）を通してから2層目を落とす（#1331）
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

    await POST(
      createRequestFromIp(
        {
          email: 'TeSt@ExAmPle.COM',
          code: '000000',
          action: 'password_change',
        },
        '203.0.113.10',
      ),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com|203.0.113.10',
      'otp_verify',
      10,
      10,
    );
  });

  // === 送信元単位のブレーキ（#1331） ===
  //
  // メール単位の `otp_verify` は「同一の宛先で何回試せるか」しか抑えておらず、
  // 宛先を変えるだけで `rate_limits` の行を無制限に増やせた。
  // 置き換えではなく手前に1層重ねている。
  describe('送信元単位の上限（otp_verify_ip）', () => {
    it('検証より前に消費する — 入力が不正でも上限超過なら429を返す', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

      const response = await POST(
        createRequestFromIp(
          { email: 'not-an-email', code: '123456', action: 'password_change' },
          '203.0.113.10',
        ),
      );

      // 400 が返るなら IP層が検証の後ろに落ちている
      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        '203.0.113.10',
        'otp_verify_ip',
        expect.anything(),
        expect.anything(),
      );
    });

    it('送信元が特定できないときは消費しない（fail-open）', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      // createRequest は転送ヘッダを付けないため getClientIp は 'unknown'
      await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'password_change',
        }),
      );

      expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'otp_verify_ip',
        expect.anything(),
        expect.anything(),
      );
    });

    it('上限内なら通し、メール単位の層まで進む', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      await POST(
        createRequestFromIp(
          {
            email: 'test@example.com',
            code: '123456',
            action: 'password_change',
          },
          '203.0.113.10',
        ),
      );

      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'test@example.com|203.0.113.10',
        'otp_verify',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('処理順', () => {
    // バリデーション → レート制限（#940 の例外1）。
    // 識別子 `email|ip` が検証済みのボディ由来なので、検証より前には出せない。
    // IP単独に替えて前倒しすると、同じIPの別アカウントまで巻き込む
    // （`.claude/rules/api-route.md`）
    //
    // ⚠️ ここで見ているのは**2層目**（otp_verify）の順序。1層目の
    // `otp_verify_ip` は検証より前にある（上の describe）。
    // createRequest は転送ヘッダを持たないため1層目はスキップされ、
    // この describe では2層目だけが観測される
    it('バリデーションエラー時はレート制限を消費しない', async () => {
      const response = await POST(
        createRequest({
          email: 'not-an-email',
          code: '123456',
          action: 'password_change',
        }),
      );

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('レート制限超過中でも、メール形式が不正なら400を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await POST(
        createRequest({
          email: 'not-an-email',
          code: '123456',
          action: 'password_change',
        }),
      );

      expect(response.status).toBe(400);
    });
  });
});
