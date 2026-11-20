/**
 * @jest-environment node
 */

/**
 * 新規登録API Route テスト
 */

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

import { OTP_CONFIG } from '@/constants/otp';

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

/**
 * ⚠️ `compare` は「同じパスワードでのやり直しか」の判定に使う（#1325）。
 *
 * 既定は **false**（＝違うパスワード＝係争）。`register` の既存ユーザー分岐は
 * 「他人の未検証登録を上書きした」とみなして `password_contested` を立てる。
 * 同一パスワードのケースを見たいテストだけが `true` に差し替える。
 */
const mockBcryptCompare = jest.fn().mockResolvedValue(false);
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: (...args: unknown[]) => mockBcryptCompare(...args),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
const mockReleaseRateLimit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  releaseRateLimit: (...args: unknown[]) => mockReleaseRateLimit(...args),
}));

// 漏洩パスワード照合（HIBP）。既定では「漏洩していない」として通す
const mockIsPasswordPwned = jest.fn().mockResolvedValue(false);
jest.mock('@/lib/auth/pwnedPassword', () => ({
  isPasswordPwned: (...args: unknown[]) => mockIsPasswordPwned(...args),
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
      eq: () => ({
        single: () => ({
          data: null,
          // 行が無いときに PostgREST が返すのは PGRST116。`error: null` に
          // していると、実装が「本当に新規」と「読み取り失敗」を分ける
          // 分岐を検証できず、**全新規登録が 500 になる退行**を素通りさせる
          // （#1164）
          error: { code: 'PGRST116', message: 'not found' },
        }),
      }),
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

  /**
   * コードの有効期限は定数から来る（#1258）
   *
   * 10分だった頃は、メールの遅延や迷惑メールを探しているうちに切れ、
   * 再送を繰り返して日次5通を使い切る経路があった。使い切ると登録を
   * 完了する手段が無くなる。
   *
   * ⚠️ ここをベタ書きの分数で固定しないこと。定数を変えたときに落ちて
   * しまい、「テストを直す」方向に倒れる
   */
  it('OTPの有効期限を OTP_CONFIG.EXPIRY_MINUTES で保存する', async () => {
    let savedExpiry: string | undefined;

    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    // 既存ユーザーなし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: 'PGRST116', message: 'not found' },
          }),
        }),
      }),
    });
    // ユーザーINSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({ data: { id: 'user-123' }, error: null }),
        }),
      }),
    });
    // OTP INSERT。渡された expires_at を捕まえる
    mockFrom.mockReturnValueOnce({
      insert: (values: Record<string, unknown>) => {
        savedExpiry = values.expires_at as string;
        return { error: null };
      },
    });

    const before = Date.now();
    await POST(
      createRequest({ email: 'test@example.com', password: 'Password1234' }),
    );
    const after = Date.now();

    expect(savedExpiry).toBeDefined();

    const expiresAt = new Date(savedExpiry as string).getTime();
    const windowMs = OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000;

    // expires_at は POST 中のどこかの時刻 + 期限。前後の実測時刻で挟む
    expect(expiresAt).toBeGreaterThanOrEqual(before + windowMs);
    expect(expiresAt).toBeLessThanOrEqual(after + windowMs);
  });

  it('正常に登録でき、OTPメールが送信される', async () => {
    setupSuccessMocks();

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1234',
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
        password: 'Password1234',
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

  /**
   * DB障害を「新規メール」に化かさない（#1164）
   *
   * 握り潰すと新規扱いで INSERT へ進み、一意制約違反で 500 になる。
   * 結果の 500 は同じでも、**既存アカウントへ INSERT を試みる**経路を
   * 通るのは意図と違う。読めなかった時点で止める
   */
  it('既存ユーザーの読み取りに失敗したら、新規扱いで作成を試みない', async () => {
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
      createRequest({ email: 'new@example.com', password: 'Password1234' }),
    );

    expect(response.status).toBe(500);
    // 既存チェックのSELECTだけで止まり、INSERT へ進んでいない
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('既存メール時のレスポンス形状が新規登録時と区別できない', async () => {
    // 新規登録の成功レスポンス
    setupSuccessMocks();
    const newUserRes = await POST(
      createRequest({ email: 'new@example.com', password: 'Password1234' }),
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
      createRequest({
        email: 'existing@example.com',
        password: 'Password1234',
      }),
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
        password: 'Password1234',
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

    // ロールバック: OTPレコード削除（#1267 で条件を絞った）
    //
    // ⚠️ `eq` と `is` を**別々に**記録する。同じ配列に積むと、
    // `.is('verified_at', null)` を `.eq('verified_at', null)` に変えても
    // 通ってしまう。PostgREST では `eq.null` は NULL 一致にならないので、
    // 実際には1行も消えずロールバックが無効化される
    // 自身を返すチェーンなので、型注釈が無いと TS7022 になる
    const otpDeleteChain: { eq: jest.Mock; is: jest.Mock } = {
      eq: jest.fn(() => otpDeleteChain),
      is: jest.fn(() => otpDeleteChain),
    };
    const mockOtpDelete = jest.fn().mockReturnValue(otpDeleteChain);
    mockFrom.mockReturnValueOnce({ delete: mockOtpDelete });
    // ロールバック: ユーザーレコード削除
    const mockUserDelete = jest.fn().mockReturnValue({ eq: jest.fn() });
    mockFrom.mockReturnValueOnce({ delete: mockUserDelete });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1234',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    // ロールバックが実行されたことを確認
    expect(mockOtpDelete).toHaveBeenCalled();
    // ⚠️ `email` だけで消さない（#1267）。全 action_type の、しかも
    // **検証済みの行まで**巻き込むと、OTPログインとパスワード変更が
    // 参照している検証済みトークンが失われる。
    //
    // 呼び出し順には依存させない（生成されるSQLは同じ）
    expect(otpDeleteChain.eq).toHaveBeenCalledWith('email', 'test@example.com');
    expect(otpDeleteChain.eq).toHaveBeenCalledWith(
      'action_type',
      'registration',
    );
    expect(otpDeleteChain.is).toHaveBeenCalledWith('verified_at', null);
    // email だけに戻すと落ちる
    expect(otpDeleteChain.eq).toHaveBeenCalledTimes(2);
    expect(mockUserDelete).toHaveBeenCalled();
    // 日次送信枠も戻す（#1260）。行だけ消して枠を残すと、1通も届かないまま
    // 5回で「本日の送信上限に達しました」に変わる
    expect(mockReleaseRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
    );
  });

  it('レート制限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 3600,
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1234',
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
        password: 'Password1234',
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
    // ⚠️ `clearAllMocks` は呼び出し履歴を消すだけで**実装は残す**。
    // 1本が `mockResolvedValue(true)` に差し替えると以降すべてに漏れるので、
    // 既定（＝違うパスワード＝係争）へ毎回戻す
    mockBcryptCompare.mockResolvedValue(false);
  });

  /**
   * 未検証の既存ユーザーが見つかる状態のモック
   *
   * `password_hash` を渡せる（#1325）。渡した値と今回のパスワードが
   * 一致するかで「係争」かどうかが決まるため、係争の有無を切り替えたい
   * テストはここに本物の bcrypt ハッシュを渡す。
   * 省略時は NULL ＝ 比較対象が無いので**係争扱い**になる
   */
  const mockUnverifiedExistingUser = (passwordHash: string | null = null) => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              id: 'squatted-user-id',
              is_verified: false,
              password_hash: passwordHash,
            },
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

  /**
   * 旧OTP削除 → OTP INSERT のモック
   *
   * `captured` を渡すと INSERT の中身を記録する（#1325 の
   * `password_contested` を観測するため）
   */
  const mockOtpReissue = (captured?: { otpRow?: Record<string, unknown> }) => {
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({ eq: () => ({ is: () => ({ error: null }) }) }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      insert: (row: Record<string, unknown>) => {
        if (captured) captured.otpRow = row;
        return { error: null };
      },
    });
  };

  /**
   * 名前を入れずにやり直しても既存の表示名を消さない（#1253）
   *
   * ユーザー名は**任意**入力なので、やり直すときに入れ忘れるのが普通。
   * #645 の目的は第三者が設定した `password_hash` を消すことで、
   * 名前を消す必要はない
   */
  /**
   * 係争中のパスワードに印を付ける（#1325）
   *
   * 「被害者が未検証で登録 → 第三者が同じアドレスで register」の順だと、
   * `password_hash` は第三者のものに上書きされる。第三者の register は
   * 被害者宛の未検証コードを DELETE するので、被害者は「コードが違う」を
   * 見て**再送**し、そのコードで検証を終える。再送は `password_hash` に
   * 触らないため、第三者のハッシュを載せたまま `is_verified` が立っていた。
   *
   * ここで印を付けておき、`auth/otp/verify` が昇格と同時に失効させる。
   */
  describe('パスワードの係争判定', () => {
    it('未検証ユーザーを別のパスワードで上書きしたら係争として印を付ける', async () => {
      const captured: { otpRow?: Record<string, unknown> } = {};
      // 既存ハッシュはあるが、今回のパスワードとは一致しない
      mockBcryptCompare.mockResolvedValue(false);
      mockUnverifiedExistingUser('$2a$04$existing.hash.of.victim.password');
      mockUserUpdate({});
      mockOtpReissue(captured);

      await POST(
        createRequest({
          email: 'victim@example.com',
          password: 'AttackerPass1',
        }),
      );

      expect(captured.otpRow?.password_contested).toBe(true);
    });

    /**
     * ⚠️ 本人が同じパスワードでやり直しただけなら失効させない。
     *
     * これを係争扱いにすると、登録をやり直した本人が検証後に
     * パスワードを失う。攻撃者は被害者のパスワードを知らないので、
     * この抜け道は使えない（使えるなら最初から乗っ取る必要がない）。
     */
    it('同じパスワードでのやり直しは係争にしない', async () => {
      const captured: { otpRow?: Record<string, unknown> } = {};
      mockBcryptCompare.mockResolvedValue(true);
      mockUnverifiedExistingUser('$2a$04$existing.hash.of.victim.password');
      mockUserUpdate({});
      mockOtpReissue(captured);

      await POST(
        createRequest({
          email: 'victim@example.com',
          password: 'Password1234',
        }),
      );

      expect(captured.otpRow?.password_contested).toBe(false);
    });

    /**
     * ⚠️ 比較対象が無いときは係争側へ倒す。
     *
     * `password_hash` が NULL になるのは OAuth のみの利用者か、
     * #1302 / 本件で既に失効させた後。どちらも「本人が設定した値」の
     * 証拠が無いので、安全側に寄せる。
     */
    it('既存のパスワードが未設定なら係争として扱う', async () => {
      const captured: { otpRow?: Record<string, unknown> } = {};
      mockUnverifiedExistingUser(null);
      mockUserUpdate({});
      mockOtpReissue(captured);

      await POST(
        createRequest({
          email: 'victim@example.com',
          password: 'Password1234',
        }),
      );

      expect(captured.otpRow?.password_contested).toBe(true);
      // 比較対象が無いので bcrypt.compare は呼ばない
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });
  });

  describe('表示名の扱い', () => {
    it('名前が未入力なら name を更新しない', async () => {
      const captured: { payload?: unknown } = {};
      mockUnverifiedExistingUser();
      mockUserUpdate(captured);
      mockOtpReissue();

      await POST(
        createRequest({
          email: 'victim@example.com',
          password: 'Password1234',
        }),
      );

      // password_hash は必ず上書きする（#645 の目的）
      expect(captured.payload).toHaveProperty('password_hash');
      // name はペイロードに含めない（既存値が残る）
      expect(captured.payload).not.toHaveProperty('name');
    });

    it('名前が入力されていれば更新する', async () => {
      const captured: { payload?: unknown } = {};
      mockUnverifiedExistingUser();
      mockUserUpdate(captured);
      mockOtpReissue();

      await POST(
        createRequest({
          email: 'victim@example.com',
          password: 'Password1234',
          name: '新しい表示名',
        }),
      );

      expect(captured.payload).toMatchObject({ name: '新しい表示名' });
    });

    it('空文字の名前でも既存値を消さない', async () => {
      // フォームが空文字を送ってくるケース
      const captured: { payload?: unknown } = {};
      mockUnverifiedExistingUser();
      mockUserUpdate(captured);
      mockOtpReissue();

      await POST(
        createRequest({
          email: 'victim@example.com',
          password: 'Password1234',
          name: '',
        }),
      );

      expect(captured.payload).not.toHaveProperty('name');
    });
  });

  it('未検証ユーザーが居ても登録を完了できる（締め出しが起きない）', async () => {
    mockUnverifiedExistingUser();
    mockUserUpdate({});
    mockOtpReissue();

    const response = await POST(
      createRequest({ email: 'victim@example.com', password: 'Password1234' }),
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
      createRequest({ email: 'victim@example.com', password: 'Password1234' }),
    );

    // #1253 で name を含めなくなった。#645 の目的は password_hash を
    // 消すことで、表示名まで巻き込む必要はない
    expect(captured.payload).toEqual({ password_hash: 'hashed_password' });
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
      createRequest({ email: 'victim@example.com', password: 'Password1234' }),
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
      createRequest({ email: 'owner@example.com', password: 'Password1234' }),
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
    //
    // ⚠️ チェーンを3段にすること（#1267）。1段のままだと新実装の2段目で
    // TypeError になり、外側の catch で 500 になって**テストは緑のまま
    // 通る**。だが users の削除に到達していないだけなので、
    // 「`!existingUser` のガードが効いた」ことを検証できていない
    const rollbackEq = jest.fn();
    const rollbackIs = jest.fn();
    mockFrom.mockImplementation(() => ({
      delete: () => {
        deletedTables.push('delete');
        const chain: { eq: jest.Mock; is: jest.Mock } = {
          eq: jest.fn((column: string, value: unknown) => {
            rollbackEq(column, value);
            return chain;
          }),
          is: jest.fn((column: string, value: unknown) => {
            rollbackIs(column, value);
            return { error: null };
          }),
        };
        return chain;
      },
    }));

    const response = await POST(
      createRequest({ email: 'victim@example.com', password: 'Password1234' }),
    );

    expect(response.status).toBe(500);
    // otp_codes の1回だけ（users の削除が走っていない）
    expect(deletedTables).toHaveLength(1);
    // 上書き経路でも削除条件を絞っていること
    expect(rollbackEq).toHaveBeenCalledWith('email', 'victim@example.com');
    expect(rollbackEq).toHaveBeenCalledWith('action_type', 'registration');
    expect(rollbackIs).toHaveBeenCalledWith('verified_at', null);
    // 送信枠も戻すこと（#1260）。TypeError で手前が落ちていると実行されない
    expect(mockReleaseRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'victim@example.com',
      'otp_send_daily',
    );
  });

  // === レート制限の識別子と送信カウンタ ===

  it('登録試行はアカウント×送信元で数える', async () => {
    setupSuccessMocks();

    await POST(
      createRequestFromIp(
        { email: 'test@example.com', password: 'Password1234' },
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
        { email: 'test@example.com', password: 'Password1234' },
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
      createRequest({ email: 'test@example.com', password: 'Password1234' }),
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
      createRequest({ email: 'test@example.com', password: 'Password1234' }),
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
      createRequest({ email: 'TeSt@ExAmPle.COM', password: 'Password1234' }),
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

  // === 漏洩パスワードの照合（#652） ===

  it('漏洩パスワードは400で拒否し、ユーザー行もOTPも作らない', async () => {
    mockIsPasswordPwned.mockResolvedValueOnce(true);

    const response = await POST(
      createRequest({ email: 'test@example.com', password: 'Password1234' }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe(
      'このパスワードは過去の情報漏洩で確認されています。別のパスワードを設定してください',
    );
    // DBに一切触れていない（既存ユーザー検索すら走らない）
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('漏洩照合はレート制限を通過した後にだけ行う（外部APIの踏み台にしない）', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', password: 'Password1234' }),
    );

    expect(response.status).toBe(429);
    expect(mockIsPasswordPwned).not.toHaveBeenCalled();
  });

  it('照合できなかった場合（API障害）は登録を止めない', async () => {
    // isPasswordPwned は障害時に false を返す（fail-open）
    mockIsPasswordPwned.mockResolvedValueOnce(false);
    setupSuccessMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', password: 'Password1234' }),
    );

    expect(response.status).toBe(201);
    expect(mockSendOtpEmail).toHaveBeenCalled();
  });

  it('72バイトを超えるパスワードはバリデーションで弾く', async () => {
    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: `Aa1${'x'.repeat(70)}`,
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // === 送信元単位のブレーキ（#1331） ===
  //
  // このルートは1リクエストで `register`（email|ip）と `otp_send_daily`（email）の
  // 2行を作る。どちらも「同一の宛先で何回試せるか」しか抑えておらず、
  // 宛先を変えるだけで `rate_limits` の行を無制限に増やせた。
  // 置き換えではなく手前に1層重ねている。
  describe('送信元単位の上限（register_ip）', () => {
    it('検証より前に消費する — 入力が不正でも上限超過なら429を返す', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 3600,
      });

      const response = await POST(
        createRequestFromIp(
          { email: 'not-an-email', password: 'Password1234' },
          '203.0.113.10',
        ),
      );

      // 400 が返るなら IP層が検証の後ろに落ちている
      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        '203.0.113.10',
        'register_ip',
        expect.anything(),
        expect.anything(),
      );
    });

    it('送信元が特定できないときは消費しない（fail-open）', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      // createRequest は転送ヘッダを付けないため getClientIp は 'unknown'
      await POST(
        createRequest({ email: 'user@example.com', password: 'Password1234' }),
      );

      expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'register_ip',
        expect.anything(),
        expect.anything(),
      );
    });

    it('上限内なら通し、メール単位の層まで進む', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      await POST(
        createRequestFromIp(
          { email: 'user@example.com', password: 'Password1234' },
          '203.0.113.10',
        ),
      );

      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'user@example.com|203.0.113.10',
        'register',
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
    // ⚠️ ここで見ているのは**2層目以降**（register / otp_send_daily）の順序。
    // 1層目の `register_ip` は検証より前にある（上の describe）。
    // createRequest は転送ヘッダを持たないため1層目はスキップされる
    it('バリデーションエラー時はレート制限を消費しない', async () => {
      const response = await POST(
        createRequest({ email: 'not-an-email', password: 'Password1234' }),
      );

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('レート制限超過中でも、メール形式が不正なら400を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await POST(
        createRequest({ email: 'not-an-email', password: 'Password1234' }),
      );

      expect(response.status).toBe(400);
    });
  });
});
