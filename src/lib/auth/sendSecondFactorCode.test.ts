/**
 * @jest-environment node
 */

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

import type { SupabaseClient } from '@supabase/supabase-js';

import { TWO_FACTOR_OTP_ACTION } from '@/constants/secondFactor';
import { OTP_CONFIG } from '@/constants/otp';
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants/rateLimit';

import {
  SEND_SECOND_FACTOR_RESULT,
  sendSecondFactorCode,
} from './sendSecondFactorCode';

// --- Mocks ---

const mockSendOtpEmail = jest.fn();
jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => '123456',
  sendOtpEmail: (...args: unknown[]) => mockSendOtpEmail(...args),
  hashOtpCode: (code: string, email: string) => `hashed:${email}:${code}`,
}));

const mockCheckRateLimit = jest.fn();
const mockReleaseRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  releaseRateLimit: (...args: unknown[]) => mockReleaseRateLimit(...args),
}));

// --- Helpers ---

const USER_ID = 'user-1';
const EMAIL = 'user@example.com';
/** 送信元ごとの層の識別子（`buildLoginIdentifier` の形） */
const PROMPT_IDENTIFIER = 'user@example.com|203.0.113.10';

interface MockState {
  /** 直近の `two_factor` 行の作成日時。null なら「送信履歴なし」 */
  recentCreatedAt: string | null;
  /**
   * 直近の行の有効期限
   *
   * ⚠️ 省くと `new Date(undefined)` が NaN になり、「まだ使えるコードが
   * 届いているか」の判定が常に false へ倒れる（GHSA-p899-6g7w-v7hg）。
   * 既定は `recentCreatedAt` から30分後。
   */
  recentExpiresAt: string | null;
  /** 読み取りでエラーを返すか */
  readError: boolean;
  deleteCalls: number;
  insertCalls: number;
  /**
   * INSERT に渡された行。
   *
   * ⚠️ 引数を捨てると、`code_hash` / `action_type` / `expires_at` / 宛先の
   * どれも未検証になる。実際に**正規化前のアドレスで INSERT する実装でも
   * 全テストが通る**状態だった（#1287。変異テストで実測）
   */
  insertedRows: Record<string, unknown>[];
  /** delete と insert の呼び出し順を記録する */
  order: string[];
}

const createSupabaseMock = (state: MockState): SupabaseClient => {
  const from = () => {
    const builder: Record<string, unknown> = {};
    const self = () => builder;

    // ⚠️ **選んだ列だけを返す。** 無視すると `select('created_at')` に
    //    戻す変異を検知できない（実際に生き残った）。PostgREST は
    //    指定していない列を返さないので、`expires_at` が undefined になり
    //    `new Date(undefined)` が NaN へ化ける
    let selected: string[] = [];
    builder.select = jest.fn((columns?: string) => {
      selected = (columns ?? '')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean);

      return builder;
    });
    builder.eq = jest.fn(self);
    builder.order = jest.fn(self);
    builder.limit = jest.fn(self);
    builder.maybeSingle = jest.fn(() =>
      Promise.resolve(
        state.readError
          ? { data: null, error: { message: 'connection terminated' } }
          : {
              data: state.recentCreatedAt
                ? Object.fromEntries(
                    Object.entries({
                      created_at: state.recentCreatedAt,
                      expires_at:
                        state.recentExpiresAt ??
                        new Date(
                          new Date(state.recentCreatedAt).getTime() +
                            30 * 60 * 1000,
                        ).toISOString(),
                    }).filter(([column]) => selected.includes(column)),
                  )
                : null,
              error: null,
            },
      ),
    );
    builder.delete = jest.fn(() => {
      state.deleteCalls += 1;
      state.order.push('delete');
      return builder;
    });
    builder.insert = jest.fn((row: Record<string, unknown>) => {
      state.insertCalls += 1;
      state.insertedRows.push(row);
      state.order.push('insert');
      return Promise.resolve({ error: null });
    });

    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
    ) => Promise.resolve({ error: null }).then(onFulfilled);

    return builder;
  };

  return { from: jest.fn(from) } as unknown as SupabaseClient;
};

const freshState = (): MockState => ({
  recentCreatedAt: null,
  recentExpiresAt: null,
  readError: false,
  deleteCalls: 0,
  insertCalls: 0,
  insertedRows: [],
  order: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockSendOtpEmail.mockResolvedValue(true);
});

// --- Tests ---

describe('sendSecondFactorCode', () => {
  it('コードを保存してメールを送り SENT を返す', async () => {
    const state = freshState();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SENT);

    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      EMAIL,
      '123456',
      TWO_FACTOR_OTP_ACTION,
    );
    expect(state.insertCalls).toBe(1);
  });

  /**
   * INSERT の中身を固定する（#1287）
   *
   * ⚠️ モックが引数を捨てていた頃は、`code_hash` / `action_type` /
   * `expires_at` / 宛先のどれも未検証だった。**正規化前のアドレスで
   * INSERT する実装でも10テスト全通過する**ことを変異テストで実測している。
   */
  it('otp_codes に入れる行の中身', async () => {
    const state = freshState();
    const before = Date.now();

    await sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL);

    const row = state.insertedRows[0];

    expect(row.email).toBe(EMAIL);
    // 平文は保存しない（#640）。hashOtpCode のモックは `hashed:<email>:<code>`
    expect(row.code_hash).toBe(`hashed:${EMAIL}:123456`);
    expect(row.action_type).toBe(TWO_FACTOR_OTP_ACTION);

    // 有効期限は OTP_CONFIG.EXPIRY_MINUTES 後。
    //
    // ⚠️ 実装は `before` より**後**に `Date.now()` を読むので、
    //   `expiresAt - before >= expected` は構造上つねに成り立つ。
    //   下限を `expected - 1000` にしても落ちることはない（死んだ
    //   アサーションになる）ため、下限は厳密に `expected` で見る。
    //   実行時間ぶんの遊びが要るのは上限側だけ
    const expiresAt = new Date(row.expires_at as string).getTime();
    const expected = OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000;
    expect(expiresAt - before).toBeGreaterThanOrEqual(expected);
    expect(expiresAt - before).toBeLessThanOrEqual(expected + 1000);
  });

  /**
   * ⚠️ 宛先は**正規化してから**保存する。
   *
   * `otp_codes` の照合は `email` の完全一致なので、保存側と検証側で表記が
   * 違うと「正しいコードを入れたのに見つからない」になる。
   * `auth/otp/verify` は zod の `.email()` 経由（小文字化済み）で引くため、
   * ここが生のアドレスだと大文字を含む利用者だけ二段階認証を通過できない。
   */
  it('宛先は正規化してから保存する（大文字・前後の空白を落とす）', async () => {
    const state = freshState();

    await sendSecondFactorCode(
      createSupabaseMock(state),
      USER_ID,
      '  User@Example.COM  ',
    );

    const row = state.insertedRows[0];

    expect(row.email).toBe(EMAIL);
    expect(row.code_hash).toBe(`hashed:${EMAIL}:123456`);
  });

  /**
   * ⚠️ 識別子はユーザーID。メールアドレスにすると、表記や宛先を変えるだけで
   * カウンタが分かれて送信数を掛け算できる（#641 / #644 と同じ形）。
   */
  it('レート制限の識別子はユーザーID', async () => {
    await sendSecondFactorCode(
      createSupabaseMock(freshState()),
      USER_ID,
      EMAIL,
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      'two_factor_send',
      10,
      60,
    );
  });

  it('前のコードを消してから新しいコードを入れる', async () => {
    const state = freshState();

    await sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL);

    // 複数生きていると、古いコードでも通ってしまう
    expect(state.order).toEqual(['delete', 'insert']);
  });

  /**
   * ⚠️ 再送間隔に当たったパスでは枠を消費しない。
   *
   * ボタンの二度押しで枠が減ると、上限に達して1時間ログインできなくなる。
   */
  it('60秒以内の再送は THROTTLED で、枠もメールも消費しない', async () => {
    const state = freshState();
    state.recentCreatedAt = new Date(Date.now() - 10_000).toISOString();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.THROTTLED);

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
    expect(state.insertCalls).toBe(0);
  });

  /**
   * ⛔ **送信元ごとの層も再送間隔より後ろ**（GHSA-p899-6g7w-v7hg のレビュー）。
   *
   * 初版はこれを `authorize` の中、`sendSecondFactorCode` を呼ぶ**前**に
   * 置いていた。再送間隔の判定はこの関数の中にあるため、**1通も送らない
   * リクエストが枠を食う**。しかも `TWO_FACTOR_SEND_PROMPT` は
   * `RELEASABLE_RATE_LIMIT_ACTIONS` に無く戻せない。
   *
   * `loginSchema` は `totpCode` を持たないので、**コード欄が空のまま
   * 「ログイン」を押すだけ**でこの経路に入る。送信ボタンは再送ボタンと違い
   * カウントダウンで無効化されないため、二度押しが素通りする。
   * 上限ぶん繰り返すと、1通も送っていないのに60分締め出される。
   */
  it('60秒以内の再送では送信元ごとの枠も消費しない', async () => {
    const state = freshState();
    state.recentCreatedAt = new Date(Date.now() - 10_000).toISOString();

    await expect(
      sendSecondFactorCode(
        createSupabaseMock(state),
        USER_ID,
        EMAIL,
        PROMPT_IDENTIFIER,
      ),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.THROTTLED);

    // 渡していても呼ばれない。ここが逆だと正規の利用者が締め出される
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 識別子を渡さない経路（設定画面・OAuth）では層を掛けない。
   * いずれもセッションが要るので、未認証からは到達できない。
   */
  it('識別子が無ければ送信元ごとの層は掛からない', async () => {
    const state = freshState();
    state.recentCreatedAt = new Date(
      Date.now() - (OTP_CONFIG.RESEND_INTERVAL_SECONDS + 5) * 1000,
    ).toISOString();

    await sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL);

    // TWO_FACTOR_SEND の1回だけ
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
      expect.any(Number),
      expect.any(Number),
    );
  });

  /**
   * ⚠️ 送信元ごとの層は `TWO_FACTOR_SEND` より**手前**。
   * 逆だと、弾くより先に利用者の枠を消費して層の意味が無くなる。
   */
  it('送信元ごとの層は利用者単位の枠より先に判定する', async () => {
    const state = freshState();
    state.recentCreatedAt = new Date(
      Date.now() - (OTP_CONFIG.RESEND_INTERVAL_SECONDS + 5) * 1000,
    ).toISOString();

    await sendSecondFactorCode(
      createSupabaseMock(state),
      USER_ID,
      EMAIL,
      PROMPT_IDENTIFIER,
    );

    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      PROMPT_IDENTIFIER,
      RATE_LIMIT_ACTION.TWO_FACTOR_SEND_PROMPT,
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      USER_ID,
      RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('再送間隔を過ぎていれば送る', async () => {
    const state = freshState();
    state.recentCreatedAt = new Date(
      Date.now() - (OTP_CONFIG.RESEND_INTERVAL_SECONDS + 5) * 1000,
    ).toISOString();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SENT);
  });

  it('送信上限を超えたら LIMIT_EXCEEDED で、メールを送らない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 3600 });
    const state = freshState();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED);

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
    expect(state.insertCalls).toBe(0);
  });

  /**
   * ⛔ **使えるコードが既に届いているなら行き止まりにしない**
   * （GHSA-p899-6g7w-v7hg）。
   *
   * 枠を使い切らせる妨害は、宛先が `users.email` に固定されているため
   * **被害者の受信箱に有効なコードを送り込む**形でしか成立しない。
   * その状態で「リカバリーコードを使え」と案内するのは、手元に答えが
   * あるのに別の出口へ誘導していることになる。
   *
   * ⚠️ **`THROTTLED` と同じ値にしない。** あちらは「60秒待てば送り直せる」で、
   * こちらは最長60分送り直せない。初版は同じ値にしたため、`send-challenge` が
   * 「しばらく待ってから再送信してください。」を返す形になっていた
   * （待っても直らない案内。レビューで実測）。
   */
  it('上限でも有効なコードが残っていれば LIMIT_EXCEEDED_CODE_VALID を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 3600 });
    const state = freshState();
    // 再送間隔（60秒）は過ぎているが、コード自体はまだ有効
    state.recentCreatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    state.recentExpiresAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED_CODE_VALID);

    // ⚠️ 1通も送らないことは変わらない。変わるのは呼び出し側への伝え方だけ
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
    expect(state.insertCalls).toBe(0);
  });

  /**
   * ⚠️ 期限切れの行で THROTTLED を返すと、**使えないコードの入力を
   * 促す**ことになる。そちらは素直に行き止まり（リカバリーコード）へ。
   */
  it('上限で、残っているコードが期限切れなら LIMIT_EXCEEDED', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 3600 });
    const state = freshState();
    state.recentCreatedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    state.recentExpiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED);
  });

  /**
   * ⚠️ **送信失敗でも枠を戻さない。**
   *
   * この経路を押さえているのは2つだけで、以前は**両方同時に外れていた**。
   *
   *   | 防御 | 根拠 | 旧実装 |
   *   |---|---|---|
   *   | `TWO_FACTOR_SEND`（10回/60分） | `rate_limits` の `attempts` | `releaseRateLimit` で戻していた |
   *   | 再送間隔（60秒） | 直前の `otp_codes` 行の `created_at` だけ | 行ごと消していた |
   *
   * 行が消えると次のリクエストは「前回送信なし」と判定されて再送間隔を
   * 素通りし、枠も戻っているので `TWO_FACTOR_SEND` にも当たらない。
   * 送信が失敗し続ける状況では歯止めが無くなり、1リクエストにつき
   * 送信APIを1回呼べてしまう。
   *
   * 失敗した送信も外部APIを1回消費しているので、数えるのが正しい。
   */
  it('送信に失敗しても枠は戻さない', async () => {
    mockSendOtpEmail.mockResolvedValue(false);
    const state = freshState();

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SEND_FAILED);

    expect(mockReleaseRateLimit).not.toHaveBeenCalled();
  });

  /**
   * 行は消す。
   *
   * 残すと、届いていないコードの行が根拠になって次の試行が
   * 「先ほど送った確認コードがまだ有効です」になる（#1285 で直した誤解）。
   * 枠を戻さないことで歯止めは効いているので、こちらは消してよい。
   */
  it('送信に失敗したら行は残さない', async () => {
    mockSendOtpEmail.mockResolvedValue(false);
    const state = freshState();

    await sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL);

    // 事前クリア + 送信失敗後の後始末
    expect(state.deleteCalls).toBe(2);
  });

  it('送信に成功したら枠は戻さない', async () => {
    await sendSecondFactorCode(
      createSupabaseMock(freshState()),
      USER_ID,
      EMAIL,
    );

    expect(mockReleaseRateLimit).not.toHaveBeenCalled();
  });

  /**
   * 失敗が続いても歯止めが残る
   *
   * ⚠️ ここが本題。失敗のたびに行は消える（再送間隔は効かない）ので、
   * **残る歯止めは `TWO_FACTOR_SEND` だけ**。枠を戻していると両方外れて
   * 無制限に送信APIを呼べる。
   *
   * ⚠️ **`mockCheckRateLimit` を `allowed: true/false` で手動に切り替えない。**
   *   レート制限の状態がテスト側の固定値になり、実装が枠を戻そうが戻すまいが
   *   結果が変わらない。最初そう書いていて、**枠を戻す実装に戻しても緑のまま**
   *   だった（レビューで実測）。`consume_rate_limit` と同じく実際に数える。
   */
  it('送信が失敗し続けても、送信APIの呼び出しは上限で頭打ちになる', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    const { maxAttempts } = RATE_LIMIT_CONFIG.TWO_FACTOR_SEND;
    let attempts = 0;

    // DB 側（consume_rate_limit）と同じ数え方。上限を超えたら拒否する
    mockCheckRateLimit.mockImplementation(async () => {
      attempts += 1;
      return { allowed: attempts <= maxAttempts };
    });
    // 枠を戻す実装ならここで減る＝いつまでも上限に達しない
    mockReleaseRateLimit.mockImplementation(async () => {
      attempts -= 1;
    });

    // 上限よりずっと多く叩く
    for (let i = 0; i < maxAttempts * 5; i += 1) {
      await sendSecondFactorCode(
        createSupabaseMock(freshState()),
        USER_ID,
        EMAIL,
      );
    }

    expect(mockSendOtpEmail).toHaveBeenCalledTimes(maxAttempts);
  });

  /**
   * 上限に達したら `LIMIT_EXCEEDED` を返し、**送信そのものを試みない**
   */
  it('上限に達したら LIMIT_EXCEEDED を返す', async () => {
    mockSendOtpEmail.mockResolvedValue(false);
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    await expect(
      sendSecondFactorCode(createSupabaseMock(freshState()), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED);

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 読み取りの失敗を握り潰すと「前回送信なし」に化け、DB が詰まっている
   * 間だけ再送間隔が素通りする（#1164 と同じ理由）。
   */
  it('再送間隔の読み取りに失敗したら throw する', async () => {
    const state = freshState();
    state.readError = true;

    await expect(
      sendSecondFactorCode(createSupabaseMock(state), USER_ID, EMAIL),
    ).rejects.toThrow();

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('宛先は正規化してから使う', async () => {
    await sendSecondFactorCode(
      createSupabaseMock(freshState()),
      USER_ID,
      'User@Example.COM',
    );

    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      EMAIL,
      '123456',
      TWO_FACTOR_OTP_ACTION,
    );
  });
});
