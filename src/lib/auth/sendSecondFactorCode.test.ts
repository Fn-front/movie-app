/**
 * @jest-environment node
 */

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

import type { SupabaseClient } from '@supabase/supabase-js';

import { TWO_FACTOR_OTP_ACTION } from '@/constants/secondFactor';
import { OTP_CONFIG } from '@/constants/otp';

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

interface MockState {
  /** 直近の `two_factor` 行の作成日時。null なら「送信履歴なし」 */
  recentCreatedAt: string | null;
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

    builder.select = jest.fn(self);
    builder.eq = jest.fn(self);
    builder.order = jest.fn(self);
    builder.limit = jest.fn(self);
    builder.maybeSingle = jest.fn(() =>
      Promise.resolve(
        state.readError
          ? { data: null, error: { message: 'connection terminated' } }
          : {
              data: state.recentCreatedAt
                ? { created_at: state.recentCreatedAt }
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
   * 上限に達したら `LIMIT_EXCEEDED` で止まり、**送信そのものを試みない**
   * ことまで見る。`SEND_FAILED` が返るうちは1回ずつ数えている。
   */
  it('送信が失敗し続けても、上限に達したら送信を試みなくなる', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    // 1回目〜: 枠はまだある
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    await expect(
      sendSecondFactorCode(createSupabaseMock(freshState()), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.SEND_FAILED);
    expect(mockSendOtpEmail).toHaveBeenCalledTimes(1);

    // 失敗ぶんも数えているので、いずれ上限に達する
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    await expect(
      sendSecondFactorCode(createSupabaseMock(freshState()), USER_ID, EMAIL),
    ).resolves.toBe(SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED);

    // 上限後は1通も送らない（送信APIを呼ばない）
    expect(mockSendOtpEmail).toHaveBeenCalledTimes(1);
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
