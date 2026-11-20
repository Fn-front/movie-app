/**
 * @jest-environment node
 */

/**
 * パスワード再設定API Route テスト
 */

import {
  getSessionCookieName,
  getSessionCookieOptions,
} from '@/constants/auth';
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
const mockPeekToken = jest.fn();
const mockInvalidateAll = jest.fn();
jest.mock('@/lib/auth/passwordResetToken', () => ({
  consumePasswordResetToken: (...args: unknown[]) => mockConsumeToken(...args),
  peekPasswordResetToken: (...args: unknown[]) => mockPeekToken(...args),
  invalidateAllPasswordResetTokens: (...args: unknown[]) =>
    mockInvalidateAll(...args),
}));

// 漏洩パスワード照合（HIBP）。既定では「漏洩していない」として通す
const mockIsPasswordPwned = jest.fn();
jest.mock('@/lib/auth/pwnedPassword', () => ({
  isPasswordPwned: (...args: unknown[]) => mockIsPasswordPwned(...args),
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
    mockIsPasswordPwned.mockResolvedValue(false);
    mockPeekToken.mockResolvedValue({ status: 'valid', userId: 'user-1' });
    mockConsumeToken.mockResolvedValue({
      status: 'consumed',
      userId: 'user-1',
    });
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

    /**
     * ⛔ **残りの未使用リンクを無効化する**（#1301）
     *
     * `issuePasswordResetToken` の掃除が「送信に成功したあと」へ移った
     * ため（#1223）、送信に失敗すると未使用トークンが2本以上残る。
     * 送信側が受理したのにクライアントがエラー扱いした場合、**届いて
     * いるのに無効化されないリンク**が残り、再設定後も期限内なら
     * もう一度パスワードを変えられる。
     */
    it('残りの未使用リンクを無効化する', async () => {
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      // ⚠️ 権威は「実際に焼いた行」側の利用者ID
      expect(mockInvalidateAll).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
      );
    });

    /**
     * ⛔ **消費した後に呼ぶこと。**
     *
     * 前に置くと、**利用者がいま開いているリンクの行そのもの**が
     * `used_at IS NULL` に当たって消える。`consumePasswordResetToken` の
     * 条件付き UPDATE が0行になり、**正しいリンクなのに再設定できない**。
     *
     * ⚠️ 「投げないこと」はヘルパー側の契約（`passwordResetToken.test.ts`）。
     * ここでモックを reject させても本物の try/catch は走らないので、
     * 起こりえない状態を作って緑にするだけになる。
     */
    it('トークンを消費した後に無効化する', async () => {
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      const consumedAt = mockConsumeToken.mock.invocationCallOrder[0];
      const invalidatedAt = mockInvalidateAll.mock.invocationCallOrder[0];

      expect(consumedAt).toBeLessThan(invalidatedAt);
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

    /**
     * 係争の印を下ろす（#1325）
     *
     * ここへ来られるのはメールボックスの所有を証明した本人だけで、
     * そのうえで自分でパスワードを設定し直している。印を残すと意味が
     * 「過去に係争があった」へずれて読めなくなる。
     *
     * ⚠️ 印を下ろせるのはここと `auth/otp/verify` の昇格の2箇所だけ。
     * `register` 側では **OR で畳むだけ**にする（下ろすと、攻撃者が
     * 同じリクエストを2回送るだけで保護が外れる）。
     */
    it('係争の印を下ろす', async () => {
      const updateSpy = mockUserAndUpdate({
        id: 'user-1',
        password_hash: 'old-hash',
      });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ password_contested: false }),
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

  /**
   * 設定が済んだら、そのブラウザの前のセッションを消す（#1234）
   *
   * 別アカウントでログインしたまま設定リンクを開くと、成功後に
   * `/auth/signin` へ行っても proxy が「認証済み」と見て `/` へ送り返す
   * （`src/proxy.ts:149-151`）。設定したアカウントではなく前のアカウントの
   * まま使い続けることになる
   */
  describe('セッションの後始末', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    const setNodeEnv = (value: string) => {
      (process.env as Record<string, string>).NODE_ENV = value;
    };

    afterEach(() => {
      setNodeEnv(originalNodeEnv as string);
    });

    /**
     * `Set-Cookie` を名前・値・属性に分解する
     *
     * ⚠️ 文字列の `toContain` で属性を見てはいけない。本番の Cookie 名は
     * `__Secure-next-auth.session-token` なので、`toContain('Secure')` は
     * **属性が1つも付いていなくても名前に当たって通る**。
     * `src/proxy.test.ts:257-263` と同じ理由
     */
    const parseSetCookie = (response: Response) => {
      const header = response.headers.get('set-cookie') ?? '';
      const [pair, ...rest] = header.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');

      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        // 値を持たない属性（Secure / HttpOnly）は true にする。
        // 空文字にすると `toBe(true)` と噛み合わない
        attributes: new Map<string, string | true>(
          rest.map((attribute) => {
            const eq = attribute.indexOf('=');
            return eq === -1
              ? [attribute.toLowerCase(), true]
              : [attribute.slice(0, eq).toLowerCase(), attribute.slice(eq + 1)];
          }),
        ),
      };
    };

    /** 成功レスポンスの Set-Cookie を取る */
    const getDeletionCookie = async () => {
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      return parseSetCookie(response);
    };

    it('成功したらセッションCookieを空値で上書きする', async () => {
      setNodeEnv('production');

      const cookie = await getDeletionCookie();

      expect(cookie.name).toBe('__Secure-next-auth.session-token');
      expect(cookie.value).toBe('');
    });

    /**
     * ⚠️ 属性値をベタ書きで固定する（#1174）
     *
     * `getSessionCookieOptions()` と突き合わせるだけだと、テスト環境では
     * `secure` が false なので `expect(has('secure')).toBe(issued.secure)` が
     * **恒真になる**。Cookie 名も接頭辞なしの値しか出ない。その形だと
     * 「`secure: false` を足す」「名前をハードコードする」のどちらの退行も
     * 素通りし、本番では削除指示ごとブラウザに拒否される。
     * `src/proxy.test.ts:302-312` と同じ形にする
     */
    it.each([
      ['Secure（これが無いと __Secure- のCookieは拒否される）', 'secure', true],
      ['HttpOnly', 'httponly', true],
      ['SameSite', 'samesite', 'lax'],
      ['Path', 'path', '/'],
      ['即時失効', 'max-age', '0'],
    ])('本番の削除Cookieに %s が載る', async (_label, attribute, expected) => {
      setNodeEnv('production');

      const cookie = await getDeletionCookie();

      expect(cookie.attributes.get(attribute)).toBe(expected);
    });

    /**
     * 発行側（`auth.ts` の cookies.sessionToken）と同じ定義を使う。
     * 属性が1つでも食い違うと別のCookieとして扱われ、やはり消えない。
     *
     * ⚠️ これはヘルパーを**自分自身と**突き合わせているだけ。実際の属性値は
     * 上の `it.each` がベタ書きで固定しているので、ずれればそちらが落ちる
     */
    it('削除Cookieが共有ヘルパーの定義どおりになっている', async () => {
      setNodeEnv('production');

      const cookie = await getDeletionCookie();
      const issued = getSessionCookieOptions();

      expect(cookie.name).toBe(getSessionCookieName());
      expect(cookie.attributes.has('secure')).toBe(issued.secure);
      expect(cookie.attributes.has('httponly')).toBe(issued.httpOnly);
      expect(String(cookie.attributes.get('samesite')).toLowerCase()).toBe(
        issued.sameSite,
      );
      expect(cookie.attributes.get('path')).toBe(issued.path);
    });

    // 開発は http なので Secure を付けると逆に消えない
    it('開発では接頭辞なしのCookieを Secure なしで消す', async () => {
      setNodeEnv('development');

      const cookie = await getDeletionCookie();

      expect(cookie.name).toBe('next-auth.session-token');
      expect(cookie.attributes.has('secure')).toBe(false);
      expect(cookie.attributes.get('max-age')).toBe('0');
    });

    it('トークンが使えなかったときは既存セッションに触れない', async () => {
      // 設定していないのにログアウトさせられる理由が無い。
      // ⚠️ #1235 で検証が consume より前へ移ったため、users の取得を
      // 仕込まないと TypeError → 500 になり、400 を見ているつもりで
      // 「route が落ちること」しか確かめられない
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });
      mockConsumeToken.mockResolvedValue({ status: 'used' });

      const response = await POST(
        createRequest({ token: 'used-token', password: VALID_PASSWORD }),
      );

      expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('更新に失敗したときは既存セッションに触れない', async () => {
      mockUserAndUpdate(
        { id: 'user-1', password_hash: 'old-hash' },
        {
          code: '57P01',
        },
      );

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(500);
      expect(response.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('トークンの検証', () => {
    /**
     * 理由ごとに文言を変える（#1232）
     *
     * 1本に潰していたときは、設定を終えた人がリンクを開き直すと
     * 「有効期限が切れています」と出た。期限は切れておらず使用済みなだけで、
     * 本人は設定が失敗したと受け取ってしまう
     */
    it.each([
      ['無効', 'invalid', PASSWORD_RESET_MESSAGES.INVALID_TOKEN],
      ['期限切れ', 'expired', PASSWORD_RESET_MESSAGES.TOKEN_EXPIRED],
      ['使用済み', 'used', PASSWORD_RESET_MESSAGES.TOKEN_ALREADY_USED],
    ])(
      '%s なトークンは400を返し、理由が分かる文言を出す',
      async (_label, status, message) => {
        mockPeekToken.mockResolvedValue({ status });

        const response = await POST(
          createRequest({ token: 'bad-token', password: VALID_PASSWORD }),
        );
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.error.message).toBe(message);
      },
    );

    it('使用済みの文言はログインへ案内しつつ、完了を断定しない', async () => {
      // 「もう一度やり直してください」だけだと、完了しているのに失敗したと
      // 読める。かといって「設定したパスワードでログインしてください」と
      // 断定もできない。トークンを消費したあとに失敗する経路（users の
      // 更新失敗）で弾かれた人も、再送信すればこの文言に当たるため
      const message = PASSWORD_RESET_MESSAGES.TOKEN_ALREADY_USED;

      expect(message).toContain('使用済み');
      expect(message).toContain('ログイン');
      expect(message).toContain('完了していれば');
      expect(message).not.toContain('有効期限');
    });

    it('トークンが無効ならパスワードを更新しない', async () => {
      mockPeekToken.mockResolvedValue({ status: 'invalid' });

      await POST(
        createRequest({ token: 'bad-token', password: VALID_PASSWORD }),
      );

      expect(mockHash).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('トークンの消費はパスワード更新より先に行う', async () => {
      // 更新してから消費すると、同じリンクを同時に2回開かれて両方通る。
      // #1235 で検証を消費より前へ移したが、**消費と更新の順序は変えない**
      const updateSpy = mockUserAndUpdate({
        id: 'user-1',
        password_hash: 'old-hash',
      });

      await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(mockConsumeToken.mock.invocationCallOrder[0]).toBeLessThan(
        updateSpy.mock.invocationCallOrder[0],
      );
    });

    /**
     * 回復可能なエラーでリンクを焼かない（#1235）
     *
     * 消費を先に置いていたときは、現在と同じパスワードを打ち直しただけで
     * リンクを失い、再発行が必要になっていた。パスワードを忘れている＝
     * 他にログイン手段が無い状態で、発行アカウントなら自力で再発行も
     * できない（#1226）
     */
    describe('消費する前に弾くもの', () => {
      it('新旧同一で弾かれてもトークンを消費しない', async () => {
        mockCompare.mockResolvedValue(true);
        mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

        const response = await POST(
          createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
        );

        expect(response.status).toBe(400);
        expect(mockConsumeToken).not.toHaveBeenCalled();
      });

      it('対象ユーザーが消えていてもトークンを消費しない', async () => {
        mockUserAndUpdate(null);

        await POST(
          createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
        );

        expect(mockConsumeToken).not.toHaveBeenCalled();
      });

      // 読み取り失敗の経路は下の「無効なリンク扱いにせず500を返す」が
      // 同じモックで見ているので、そちらに消費しないことの確認を足した
    });

    it('peek から consume までの間に使い切られたら used を返す', async () => {
      // 同じリンクを同時に2回開いた場合。読んでから書くまでの窓は
      // 条件付き UPDATE が 0 行になることで塞がれている
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });
      mockConsumeToken.mockResolvedValue({ status: 'used' });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        PASSWORD_RESET_MESSAGES.TOKEN_ALREADY_USED,
      );
    });

    it('トークンに対応するユーザーが消えていたら invalid の文言で400を返す', async () => {
      // 使用済み・期限切れではない。利用者から見れば使えないリンク
      mockUserAndUpdate(null);

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(PASSWORD_RESET_MESSAGES.INVALID_TOKEN);
    });

    /**
     * DB障害を「リンクが無効」に化かさない（#1167）
     *
     * `.maybeSingle()` はどんなエラーでも `data: null` を返すため、
     * `error` を見ないと読み取り失敗が上のテストと同じ 400 になる。
     * ここは #1235 以降**トークンを消費する前**なので、500 を返せば
     * 同じリンクで再試行できる。400 に化かすと「使えないリンク」として
     * 再申請へ誘導され、パスワードを忘れている＝他にログイン手段が無い
     * 利用者を無駄に遠回りさせる
     */
    it('ユーザーの読み取りに失敗したら、無効なリンク扱いにせず500を返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: null,
                error: { code: '57P01', message: 'connection terminated' },
              }),
          }),
        }),
      });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(500);
      // 焼いてしまうと再試行しても直らない（#1235）
      expect(mockConsumeToken).not.toHaveBeenCalled();
    });
  });

  describe('入力バリデーション', () => {
    it.each([
      ['トークン未指定', { password: VALID_PASSWORD }],
      ['パスワード未指定', { token: 'valid-token' }],
      ['トークンが空文字', { token: '', password: VALID_PASSWORD }],
      ['パスワードが短い', { token: 'valid-token', password: 'Ab1' }],
      ['大文字なし', { token: 'valid-token', password: 'password1234' }],
      ['小文字なし', { token: 'valid-token', password: 'PASSWORD1234' }],
      ['数字なし', { token: 'valid-token', password: 'PasswordAbcd' }],
      [
        '72バイト超',
        { token: 'valid-token', password: `Aa1${'x'.repeat(70)}` },
      ],
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

  describe('処理順', () => {
    // レート制限 → バリデーション（#940）。
    // 識別子が送信元IPなので検証より前に確定している。逆順だと、
    // パスワードの形式を崩したリクエストを挟むだけでカウンタを消費せずに
    // 試行を続けられる（`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await POST(
        createRequest({ token: 'valid-token', password: 'short' }),
      );

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、ボディが不正でも429を返す（検証より先に判定する）', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

      const response = await POST(
        createRequest({ token: 'valid-token', password: 'short' }),
      );

      expect(response.status).toBe(429);
    });
  });

  describe('漏洩パスワードの照合（#652）', () => {
    it('漏洩パスワードは400で拒否し、トークンを消費しない', async () => {
      mockIsPasswordPwned.mockResolvedValue(true);

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        'このパスワードは過去の情報漏洩で確認されています。別のパスワードを設定してください',
      );
      // 消費していたら、差し戻された利用者はリンクの再発行が必要になる
      expect(mockConsumeToken).not.toHaveBeenCalled();
    });

    it('照合できなかった場合（API障害）は再設定を止めない', async () => {
      // isPasswordPwned は障害時に false を返す（fail-open）
      mockIsPasswordPwned.mockResolvedValue(false);
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

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
      // users の取得を仕込まないと consume に到達しない（#1235）
      mockUserAndUpdate({ id: 'user-1', password_hash: 'old-hash' });
      mockConsumeToken.mockRejectedValue(new Error('db error'));

      const response = await POST(
        createRequest({ token: 'valid-token', password: VALID_PASSWORD }),
      );

      expect(response.status).toBe(500);
    });
  });
});
