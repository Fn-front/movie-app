/**
 * @jest-environment node
 */

/**
 * 漏洩パスワード照合 テスト
 */

import { isPasswordPwned } from './pwnedPassword';
import { PWNED_PASSWORD_CONFIG } from '@/constants/auth';

// --- Fixtures ---

/**
 * SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
 *
 * HIBP の公式ドキュメントにも載っている既知の値。実装がハッシュアルゴリズムや
 * 分割位置を変えたら、この固定値との突き合わせで気づける。
 */
const PASSWORD = 'password';
const HASH_PREFIX = '5BAA6';
const HASH_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

/** 無関係な接尾辞（応答に必ず混ざる他のハッシュ） */
const OTHER_SUFFIX = '0000000000000000000000000000000000A';

/**
 * 「外部に漏れていないこと」を確かめるための秘密文字列
 *
 * SHA-1("LeakedFixture42") = 362616264AFEF577044CCA2FA0D0FB226605982B。
 * 上の `password` はエンドポイント名やログ文言にも現れる単語なので、
 * 混入判定には使えない。
 */
const SECRET = 'LeakedFixture42';
const SECRET_HASH_PREFIX = '36261';
const SECRET_HASH_SUFFIX = '6264AFEF577044CCA2FA0D0FB226605982B';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

function createTextResponse(body: string, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(body) };
}

// --- Tests ---

describe('isPasswordPwned', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('漏洩件数が1件以上の接尾辞に一致した場合 true を返す', async () => {
    mockFetch.mockResolvedValue(
      createTextResponse(`${OTHER_SUFFIX}:3\r\n${HASH_SUFFIX}:10000\r\n`),
    );

    await expect(isPasswordPwned(PASSWORD)).resolves.toBe(true);
  });

  it('一致する接尾辞が無い場合 false を返す', async () => {
    mockFetch.mockResolvedValue(createTextResponse(`${OTHER_SUFFIX}:3\r\n`));

    await expect(isPasswordPwned(PASSWORD)).resolves.toBe(false);
  });

  it('Add-Padding による水増し（件数0）はヒット扱いしない', async () => {
    mockFetch.mockResolvedValue(createTextResponse(`${HASH_SUFFIX}:0\r\n`));

    await expect(isPasswordPwned(PASSWORD)).resolves.toBe(false);
  });

  it('既知のハッシュ先頭5文字をエンドポイントに付けて問い合わせる', async () => {
    mockFetch.mockResolvedValue(createTextResponse(''));

    await isPasswordPwned(PASSWORD);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${PWNED_PASSWORD_CONFIG.API_BASE_URL}/${HASH_PREFIX}`);
  });

  it('平文もフルハッシュも送らず、ハッシュ先頭5文字だけを送る', async () => {
    mockFetch.mockResolvedValue(createTextResponse(''));

    await isPasswordPwned(SECRET);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `${PWNED_PASSWORD_CONFIG.API_BASE_URL}/${SECRET_HASH_PREFIX}`,
    );
    expect(url).not.toContain(SECRET);
    expect(url).not.toContain(SECRET_HASH_SUFFIX);
    // 応答サイズから接頭辞を推測されないよう、水増しを要求する
    expect(init.headers['Add-Padding']).toBe('true');
    // 漏洩リストは更新されるため、古い判定を使い回さない
    expect(init.cache).toBe('no-store');
  });

  it('設定値どおりのタイムアウトを設定する', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    mockFetch.mockResolvedValue(createTextResponse(''));

    await isPasswordPwned(PASSWORD);

    expect(timeoutSpy).toHaveBeenCalledWith(PWNED_PASSWORD_CONFIG.TIMEOUT_MS);
  });

  it('APIがHTTPエラーを返した場合は照合をスキップして通す（fail-open）', async () => {
    mockFetch.mockResolvedValue(createTextResponse('', false, 503));

    await expect(isPasswordPwned(PASSWORD)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('通信失敗・タイムアウトの場合は照合をスキップして通す（fail-open）', async () => {
    mockFetch.mockRejectedValue(new Error('The operation was aborted'));

    await expect(isPasswordPwned(PASSWORD)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('障害時のログに平文パスワードを含めない', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    await isPasswordPwned(SECRET);

    const logged = (console.error as jest.Mock).mock.calls
      .flat()
      .map(String)
      .join(' ');
    expect(logged).not.toContain(SECRET);
  });
});
