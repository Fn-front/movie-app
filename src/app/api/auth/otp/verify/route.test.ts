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
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
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
    // usersテーブル更新。
    // ⚠️ `.select('id')` まで繋ぐ（#1325）。失効の有無を呼び出し側が
    // 知るために件数を見ているので、ここを省くと 500 に落ちる
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          select: () => ({ data: [{ id: 'user-1' }], error: null }),
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

  it('login: 正常にOTPを検証して検証済みフラグを設定できる', async () => {
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
    // users の is_verified 更新（#1257）。トークン発行より前に走る
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ data: [{ id: 'user-1' }], error: null }),
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
        action: 'login',
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

  /**
   * LOGIN の検証でもメール認証済みにする（#1257）
   *
   * 登録して確認コードを入れる前に離脱した人が「メールでログイン」を選ぶと、
   * **正しいコードを入れたのに最後の signIn で弾かれて**いた。しかもその
   * 送信で日次枠を1つ消費済みで、案内される「新規登録をやり直す」も同じ
   * 枠を使う
   */
  describe('LOGIN のメール認証', () => {
    /** OTP行の取得を積む */
    /**
     * @param actionType - OTP の action
     * @param passwordContested - 係争中の印（#1325）。REGISTRATION の
     *   検証でこれが true だと `password_hash` を失効させる
     */
    const mockOtpFetch = (actionType: string, passwordContested = false) => {
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
                        password_contested: passwordContested,
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

    /** otp_codes の検証済み更新を積む（users 更新より後に走る） */
    const mockOtpCodeUpdate = () => {
      mockFrom.mockReturnValueOnce({
        update: () => ({ eq: () => ({ data: null, error: null }) }),
      });
    };

    /**
     * users の更新を積み、ペイロード・絞り込み条件・返却列を記録する
     *
     * ⚠️ `.eq` の引数まで記録する。記録しないと、対象を別のメールアドレスへ
     * 差し替えても、`is_verified = false` の条件を別のカラムに変えても
     * **テストが緑のまま通る**（レビューの変異で実測）
     *
     * @param options.error - 更新時に返すエラー
     * @param options.promoted - 実際に昇格した行があったか（#1302 の通知判定）
     */
    const captureUsersUpdate = ({
      error = null,
      promoted = true,
    }: { error?: unknown; promoted?: boolean } = {}) => {
      const captured: {
        values?: Record<string, unknown>;
        eq: unknown[][];
        selected?: string;
      } = { eq: [] };

      mockFrom.mockReturnValueOnce({
        update: (values: Record<string, unknown>) => {
          captured.values = values;
          const chain = {
            eq: (column: string, value: unknown) => {
              captured.eq.push([column, value]);
              return captured.eq.length < 2
                ? chain
                : {
                    select: (columns: string) => {
                      captured.selected = columns;
                      return {
                        data: promoted ? [{ id: 'user-1' }] : [],
                        error,
                      };
                    },
                  };
            },
          };
          return chain;
        },
      });

      return captured;
    };

    it('users を is_verified = true に更新し、password_hash を失効させる', async () => {
      mockOtpFetch('login');
      const usersUpdate = captureUsersUpdate();
      mockOtpCodeUpdate();

      const response = await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'login',
        }),
      );

      expect(response.status).toBe(200);
      // password_hash の失効まで固定する（#1302）。未検証の間に設定された
      // パスワードは第三者のものかもしれず、出自を区別する手段が無い
      expect(usersUpdate.values).toEqual({
        is_verified: true,
        password_hash: null,
      });
      // 対象の絞り込みまで固定する。宛先のアドレスで引き、既に認証済みの
      // 行は触らない。**この条件が外れると認証済みユーザーのパスワードまで
      // 消える**ので、無駄な書き込みの回避ではなく安全性の要になっている
      expect(usersUpdate.eq).toEqual([
        ['email', 'test@example.com'],
        ['is_verified', false],
      ]);
      // 返却列も固定する。昇格の有無はここで返る件数でしか判定できないため、
      // `.select()` を落とすと通知が送られなくなる
      expect(usersUpdate.selected).toBe('id');
      expect(mockFrom.mock.calls.map((c) => c[0])).toContain('users');
    });

    /**
     * ⚠️ 握り潰さない。失敗したまま進むと、検証済みトークンは発行された
     * のに `authorize` が `email_not_verified` で弾く（#1247）という
     * 噛み合わない状態になる
     */
    it('更新に失敗したら500を返す', async () => {
      mockOtpFetch('login');
      captureUsersUpdate({
        error: { code: '57P01', message: 'connection terminated' },
      });

      const response = await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'login',
        }),
      );

      expect(response.status).toBe(500);
    });

    it('password_change では更新しない', async () => {
      // ログイン中の本人確認なので対象は必ず認証済み。
      // 「どの操作で認証済みになるか」を広げない
      mockOtpFetch('password_change');
      mockOtpCodeUpdate();

      const response = await POST(
        createRequest({
          email: 'test@example.com',
          code: '123456',
          action: 'password_change',
        }),
      );

      expect(response.status).toBe(200);
      // OTP行の取得と更新だけ。users への UPDATE は無い
      const tables = mockFrom.mock.calls.map((c) => c[0]);
      expect(tables.filter((t) => t === 'users')).toHaveLength(0);
      expect(mockSendPasswordInvalidatedEmail).not.toHaveBeenCalled();
    });

    /**
     * パスワードの失効（#1302）
     *
     * 「被害者が未検証で登録 → 離脱 → 第三者が同じアドレスで register」の順だと
     * `password_hash` は第三者のものに上書きされている（#645）。認証済みへ
     * 昇格すると register 側の上書きが止まるため、自動回復ループも閉じる。
     * 昇格と同時に失効させて、第三者のパスワードでログインできない状態にする。
     */
    describe('パスワードの失効', () => {
      it('昇格した行があれば失効を通知する', async () => {
        mockOtpFetch('login');
        captureUsersUpdate({ promoted: true });
        mockOtpCodeUpdate();

        const response = await POST(
          createRequest({
            email: 'test@example.com',
            code: '123456',
            action: 'login',
          }),
        );

        expect(response.status).toBe(200);
        // 伝えないと、利用者は次のパスワードログインが
        // 「メールアドレスまたはパスワードが正しくありません。」で弾かれる
        // 理由を知るすべがない
        expect(mockSendPasswordInvalidatedEmail).toHaveBeenCalledWith(
          'test@example.com',
        );
      });

      it('既に認証済みで昇格しなかったときは通知しない', async () => {
        // `.eq('is_verified', false)` に当たらず0件。パスワードは消えて
        // いないので、通知すると「無効にした」という嘘になる
        mockOtpFetch('login');
        captureUsersUpdate({ promoted: false });
        mockOtpCodeUpdate();

        const response = await POST(
          createRequest({
            email: 'test@example.com',
            code: '123456',
            action: 'login',
          }),
        );

        expect(response.status).toBe(200);
        expect(mockSendPasswordInvalidatedEmail).not.toHaveBeenCalled();
      });

      it('通知の送信に失敗してもログインは成功する', async () => {
        // 失効そのものは済んでおり保護は効いている。ここで 500 にすると
        // 正しいコードを入れた利用者がログインできない行き止まりになる
        mockSendPasswordInvalidatedEmail.mockResolvedValue(false);
        mockOtpFetch('login');
        captureUsersUpdate({ promoted: true });
        mockOtpCodeUpdate();

        const response = await POST(
          createRequest({
            email: 'test@example.com',
            code: '123456',
            action: 'login',
          }),
        );
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.data.verificationToken).toEqual(expect.any(String));
      });

      /**
       * registration の失効は **`password_contested` で選ぶ**（#1325）
       *
       * LOGIN と違って無条件には消せない。通常の新規登録が毎回パスワード
       * 無しで終わってしまうため。
       */
      describe('registration の失効（#1325）', () => {
        /** users の UPDATE を記録する（registration 分岐は eq 1つ + select） */
        const captureRegistrationUpdate = (promoted = true) => {
          const captured: { values?: Record<string, unknown> } = {};

          mockFrom.mockReturnValueOnce({
            update: (values: Record<string, unknown>) => {
              captured.values = values;
              return {
                eq: () => ({
                  select: () => ({
                    data: promoted ? [{ id: 'user-1' }] : [],
                    error: null,
                  }),
                }),
              };
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
          mockOtpFetch('registration', false);
          const captured = captureRegistrationUpdate();

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
          mockOtpFetch('registration', true);
          const captured = captureRegistrationUpdate();

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
          });
        });

        it('係争中に失効させたら通知する', async () => {
          // 伝えないと、利用者は次のパスワードログインが弾かれる理由を
          // 知るすべがない
          mockOtpFetch('registration', true);
          captureRegistrationUpdate(true);

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
          mockOtpFetch('registration', true);
          captureRegistrationUpdate(false);

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
          mockOtpFetch('registration', true);
          captureRegistrationUpdate(true);

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
    });
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
      mockFrom.mockReturnValueOnce({
        update: () => ({ eq: () => ({ data: null, error: null }) }),
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

    it('上限に達していても試行回数は加算する', async () => {
      // 加算を省くと、入口の判定（次のリクエスト）が効かなくなる
      let updated: Record<string, unknown> | null = null;

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
                        attempts: 4,
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
      mockFrom.mockReturnValueOnce({
        update: (values: Record<string, unknown>) => {
          updated = values;
          return { eq: () => ({ data: null, error: null }) };
        },
      });

      await postWrongCode();

      expect(updated).toEqual({ attempts: 5 });
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
        action: 'login',
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
    // usersテーブル更新。`.select('id')` まで繋ぐ（#1325）
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({
          select: () => ({ data: [{ id: 'user-1' }], error: null }),
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
        { email: 'victim@example.com', code: '000000', action: 'login' },
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
        action: 'login',
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
        { email: 'TeSt@ExAmPle.COM', code: '000000', action: 'login' },
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
          { email: 'not-an-email', code: '123456', action: 'login' },
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
          action: 'login',
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
          { email: 'test@example.com', code: '123456', action: 'login' },
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
          action: 'login',
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
          action: 'login',
        }),
      );

      expect(response.status).toBe(400);
    });
  });
});
