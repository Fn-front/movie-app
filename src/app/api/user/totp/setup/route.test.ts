/**
 * @jest-environment node
 */

/**
 * 二段階認証の設定開始API Route テスト
 */

import { TOTP_ERROR_MESSAGES } from '@/constants/totp';
import { SECOND_FACTOR_MESSAGES } from '@/constants/secondFactor';

import { TotpAlreadyEnabledError } from '@/lib/auth/totpSetup';

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

const mockStartSecondFactorSetup = jest.fn();
jest.mock('@/lib/auth/totpSetup', () => {
  // 実物の TotpAlreadyEnabledError を使う。ここを模造品にすると
  // ルート側の instanceof が常に false になり、テストが実態とずれる
  const actual = jest.requireActual('@/lib/auth/totpSetup');
  return {
    TotpAlreadyEnabledError: actual.TotpAlreadyEnabledError,
    startSecondFactorSetup: (...args: unknown[]) =>
      mockStartSecondFactorSetup(...args),
  };
});

// --- Helpers ---

/** users の取得をモックする */
const mockUserLookup = (
  email: string | null,
  username: string | null = null,
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({ data: email ? { email, username } : null }),
      }),
    }),
  });
};

/** users の取得が DB エラーで失敗する場合をモックする */
const mockUserLookupFailure = () => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: {
              message: 'connection terminated unexpectedly',
              code: '57P01',
            },
          }),
      }),
    }),
  });
};

const createRequest = (body: Record<string, unknown> = { method: 'totp' }) =>
  new Request('http://localhost/api/user/totp/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('POST /api/user/totp/setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockStartSecondFactorSetup.mockResolvedValue({
      otpauthUri: 'otpauth://totp/Movie%20App:user@example.com?secret=ABC',
      secret: 'ABCDEFGHIJKLMNOP',
    });
  });

  it('QRコードと手入力用の鍵を返す', async () => {
    mockUserLookup('user@example.com');

    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.secret).toBe('ABCDEFGHIJKLMNOP');
    expect(json.data.qrCodeDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('QRは data URI で返す（SVG文字列をそのまま渡さない）', async () => {
    // 文字列のまま渡すと受け取り側で dangerouslySetInnerHTML が必要になり、
    // XSSのsinkを1つ増やすことになる
    mockUserLookup('user@example.com');

    const response = await POST(createRequest());
    const json = await response.json();

    expect(json.data).not.toHaveProperty('qrCodeSvg');
    // デコードすると SVG になっている
    const svg = Buffer.from(
      json.data.qrCodeDataUri.split('base64,')[1],
      'base64',
    ).toString('utf8');
    expect(svg).toMatch(/^<svg/);
  });

  it('認証アプリの表示名にはDBのメールアドレスを使う', async () => {
    mockUserLookup('user@example.com');

    await POST(createRequest());

    expect(mockStartSecondFactorSetup).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'totp',
      'user@example.com',
      'user@example.com',
    );
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
  });

  it('ユーザーが見つからなければ401を返す', async () => {
    mockUserLookup(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
  });

  it('既に有効化済みなら400を返す', async () => {
    mockUserLookup('user@example.com');
    mockStartSecondFactorSetup.mockRejectedValue(new TotpAlreadyEnabledError());

    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.ALREADY_ENABLED);
  });

  it('users の取得が DB エラーなら 401 ではなく500を返す', async () => {
    // 401 を返すと axios のインターセプタが「未認証」と解釈して
    // 強制ログアウトへ倒す。DB の不調でセッションごと破棄されてしまう
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockUserLookupFailure();

      const response = await POST(createRequest());

      expect(response.status).toBe(500);
      expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('DB 障害は「既に有効」ではなく500を返す', async () => {
    // 例外をすべて 400 ALREADY_ENABLED に潰していると、接続断も
    // INSERT 失敗も「もう有効です」と表示されて切り分けができない
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockUserLookup('user@example.com');
      mockStartSecondFactorSetup.mockRejectedValue({
        message: 'connection terminated unexpectedly',
        code: '57P01',
      });

      const response = await POST(createRequest());
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.message).not.toBe(TOTP_ERROR_MESSAGES.ALREADY_ENABLED);
    } finally {
      error.mockRestore();
    }
  });

  it('試行上限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
  });

  describe('方式ごとの扱い', () => {
    /**
     * ⚠️ 画面だけの制限はAPIを直接叩けば抜けられる。
     * admin 発行アカウントは users.email が .invalid TLD（RFC 2606、
     * 絶対に名前解決されない）なので、選ばせるとコードが永久に届かない。
     */
    it('admin 発行アカウント（username あり）は email_otp を拒否する', async () => {
      mockUserLookup('abc@def.invalid', 'alice');

      const response = await POST(createRequest({ method: 'email_otp' }));

      expect(response.status).toBe(400);
      expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
    });

    it('admin 発行アカウントでも totp は選べる', async () => {
      mockUserLookup('abc@def.invalid', 'alice');

      const response = await POST(createRequest({ method: 'totp' }));

      expect(response.status).toBe(200);
    });

    it('通常のアカウントは email_otp を選べる', async () => {
      mockUserLookup('user@example.com');
      mockStartSecondFactorSetup.mockResolvedValue({
        method: 'email_otp',
        sendResult: 'sent',
      });

      const response = await POST(createRequest({ method: 'email_otp' }));

      expect(response.status).toBe(200);
      expect(mockStartSecondFactorSetup).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'email_otp',
        'user@example.com',
        'user@example.com',
      );
    });

    /**
     * ⚠️ 送れたときだけ「送信しました」と言う（#1285）
     *
     * SENT と THROTTLED はどちらも 200 だが、THROTTLED では**1通も
     * 送っていない**。同じ文言を返していたため、再送間隔に当たった利用者は
     * 届かないコードを待つか、受信箱の古いコードを入れて弾かれ続けた。
     */
    it('送信できたら CODE_SENT と throttled:false を返す', async () => {
      mockUserLookup('user@example.com');
      mockStartSecondFactorSetup.mockResolvedValue({
        method: 'email_otp',
        sendResult: 'sent',
      });

      const response = await POST(createRequest({ method: 'email_otp' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe(SECOND_FACTOR_MESSAGES.CODE_SENT);
      expect(json.data.throttled).toBe(false);
    });

    it('再送間隔に当たったら CODE_ALREADY_SENT と throttled:true を返す', async () => {
      mockUserLookup('user@example.com');
      mockStartSecondFactorSetup.mockResolvedValue({
        method: 'email_otp',
        sendResult: 'throttled',
      });

      const response = await POST(createRequest({ method: 'email_otp' }));
      const json = await response.json();

      // ⚠️ 429 にはしない。直前のコードはまだ有効で、利用者がやることは
      // 「受信箱を見る」であって「待つ」ではない
      expect(response.status).toBe(200);
      expect(json.message).toBe(SECOND_FACTOR_MESSAGES.CODE_ALREADY_SENT);
      expect(json.message).not.toBe(SECOND_FACTOR_MESSAGES.CODE_SENT);
      expect(json.data.throttled).toBe(true);
    });

    it('不正な方式は400で、設定を開始しない', async () => {
      mockUserLookup('user@example.com');

      const response = await POST(createRequest({ method: 'bogus' }));

      expect(response.status).toBe(400);
      expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
    });

    it('送信に失敗したら500を返す', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockUserLookup('user@example.com');
        mockStartSecondFactorSetup.mockResolvedValue({
          method: 'email_otp',
          sendResult: 'send_failed',
        });

        expect(
          (await POST(createRequest({ method: 'email_otp' }))).status,
        ).toBe(500);
      } finally {
        error.mockRestore();
      }
    });

    /**
     * ⚠️ まだ有効化していないのでリカバリーコードは存在しない。
     * 「リカバリーコードを入力してログインしてください」と出すと、
     * 指示された行動が物理的に実行できない。
     */
    it('送信上限では、存在しないリカバリーコードを案内しない', async () => {
      mockUserLookup('user@example.com');
      mockStartSecondFactorSetup.mockResolvedValue({
        method: 'email_otp',
        sendResult: 'limit_exceeded',
      });

      const response = await POST(createRequest({ method: 'email_otp' }));
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error.message).not.toMatch(/リカバリーコード/);
      expect(json.error.message).toMatch(/認証アプリ/);
    });

    /**
     * ⚠️ レート制限は**方式によらず**消費する。
     *
     * method=totp の分岐だけに置くと、メールOTP 側は
     * sendSecondFactorCode の中の TWO_FACTOR_SEND しか無くなる。
     * あちらは再送間隔に当たると checkRateLimit へ到達しないため、
     * 60秒以内の連打が1件もカウントされないまま user_totp の
     * DELETE + INSERT を繰り返せる。
     */
    it('method=email_otp でもレート制限を消費する', async () => {
      mockUserLookup('user@example.com');
      mockStartSecondFactorSetup.mockResolvedValue({
        method: 'email_otp',
        sendResult: 'sent',
      });

      await POST(createRequest({ method: 'email_otp' }));

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'totp_settings_verify',
        expect.anything(),
        expect.anything(),
      );
    });

    describe('処理順', () => {
      // レート制限は原則どおり検証より前。入力が不正でも 429 が先
      it('レート制限超過なら、入力が不正でも429', async () => {
        mockCheckRateLimit.mockResolvedValue({
          allowed: false,
          retryAfter: 900,
        });

        const response = await POST(createRequest({ method: 'bogus' }));

        expect(response.status).toBe(429);
        expect(mockStartSecondFactorSetup).not.toHaveBeenCalled();
      });
    });
  });
});
