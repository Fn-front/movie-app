import {
  __getSessionUserLookupSizeForTest,
  __resetSessionUserLookupForTest,
  lookupSessionUser,
  SESSION_USER_LOOKUP_MAX_ENTRIES,
  SESSION_USER_LOOKUP_TTL_MS,
  type SessionUserLookupResult,
} from './sessionUserLookup';
import { SUPABASE_ERROR_CODE } from '@/constants/api';

const row = {
  hasPassword: true,
  passwordChangedAt: '2026-11-01T00:00:00.000Z',
  role: 'user',
};

/** 解決タイミングを手元で握れる問い合わせ */
function deferredQuery() {
  const calls: Array<(result: SessionUserLookupResult) => void> = [];

  const query = jest.fn(
    () =>
      new Promise<SessionUserLookupResult>((resolve) => {
        calls.push(resolve);
      }),
  );

  return { query, calls };
}

beforeEach(() => {
  __resetSessionUserLookupForTest();
});

describe('lookupSessionUser', () => {
  it('問い合わせ結果をそのまま返す', async () => {
    const query = jest.fn().mockResolvedValue({ data: row, error: null });

    await expect(lookupSessionUser('user-1', query, 0)).resolves.toEqual({
      data: row,
      error: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  // 本題。画面読み込みで複数のAPIが同時に飛ぶと、同じ行を本数ぶん引いていた
  it('進行中の問い合わせに相乗りする', async () => {
    const { query, calls } = deferredQuery();

    const results = Promise.all([
      lookupSessionUser('user-1', query, 0),
      lookupSessionUser('user-1', query, 0),
      lookupSessionUser('user-1', query, 0),
    ]);

    expect(query).toHaveBeenCalledTimes(1);

    calls[0]({ data: row, error: null });

    await expect(results).resolves.toEqual([
      { data: row, error: null },
      { data: row, error: null },
      { data: row, error: null },
    ]);
  });

  it('利用者が違えば相乗りしない', async () => {
    const query = jest.fn().mockResolvedValue({ data: row, error: null });

    await lookupSessionUser('user-1', query, 0);
    await lookupSessionUser('user-2', query, 0);

    expect(query).toHaveBeenCalledTimes(2);
  });

  it('TTL の内側なら終わった結果を使い回す', async () => {
    const query = jest.fn().mockResolvedValue({ data: row, error: null });

    await lookupSessionUser('user-1', query, 0);
    await lookupSessionUser('user-1', query, SESSION_USER_LOOKUP_TTL_MS - 1);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('TTL を過ぎたら引き直す', async () => {
    const query = jest.fn().mockResolvedValue({ data: row, error: null });

    await lookupSessionUser('user-1', query, 0);
    await lookupSessionUser('user-1', query, SESSION_USER_LOOKUP_TTL_MS);

    expect(query).toHaveBeenCalledTimes(2);
  });

  /**
   * ⚠️ TTL は強制失効・admin 剥奪の検知遅れに直接乗る。
   * 伸ばすと剥奪した admin が管理機能を使える時間が延びるので、
   * 「同時に飛んできた束を畳む」以上の長さにしない（#1281）
   */
  it('TTL は1秒を超えない', () => {
    expect(SESSION_USER_LOOKUP_TTL_MS).toBeLessThanOrEqual(1_000);
  });

  /**
   * 相乗りの判定も開始時刻 + TTL で行う。TTL を 0 にすると
   * 「相乗りだけ残す」ことはできず、何も畳まれなくなる（#1294 のレビュー）
   */
  it('TTL は0より大きい（0だと相乗りも消える）', () => {
    expect(SESSION_USER_LOOKUP_TTL_MS).toBeGreaterThan(0);
  });

  // 開始から TTL を過ぎると、まだ返ってきていなくても引き直す
  it('進行中でも開始から TTL を過ぎたら引き直す', async () => {
    const { query } = deferredQuery();

    void lookupSessionUser('user-1', query, 0);
    void lookupSessionUser('user-1', query, SESSION_USER_LOOKUP_TTL_MS);

    expect(query).toHaveBeenCalledTimes(2);
  });

  // 遅い問い合わせの失敗が、別の進行中の問い合わせを道連れにしない
  it('古い問い合わせの失敗が新しいエントリを消さない', async () => {
    const first = deferredQuery();
    const second = deferredQuery();

    const firstResult = lookupSessionUser('user-1', first.query, 0);
    // 1本目が未解決のまま TTL を越え、2本目が始まる
    void lookupSessionUser('user-1', second.query, SESSION_USER_LOOKUP_TTL_MS);
    expect(second.query).toHaveBeenCalledTimes(1);

    // 1本目が失敗で解決する
    first.calls[0]({ data: null, error: { code: '' } });
    await firstResult;

    // 2本目のエントリが残っていれば、相乗りして追加の問い合わせは起きない
    void lookupSessionUser('user-1', second.query, SESSION_USER_LOOKUP_TTL_MS);
    expect(second.query).toHaveBeenCalledTimes(1);
  });

  describe('失敗は使い回さない', () => {
    // 使い回すと jwt コールバックの10秒後の引き直し（#1193）を黙って潰す
    it('伝送路の失敗は次の呼び出しで引き直す', async () => {
      const failure = { data: null, error: { code: '' } };
      const query = jest.fn().mockResolvedValue(failure);

      await lookupSessionUser('user-1', query, 0);
      await lookupSessionUser('user-1', query, 0);

      expect(query).toHaveBeenCalledTimes(2);
    });

    it('PostgREST のエラーコード付きでも引き直す', async () => {
      const query = jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: '42501' } });

      await lookupSessionUser('user-1', query, 0);
      await lookupSessionUser('user-1', query, 0);

      expect(query).toHaveBeenCalledTimes(2);
    });

    it('throw された場合も引き直す', async () => {
      const query = jest.fn().mockRejectedValue(new Error('boom'));

      await expect(lookupSessionUser('user-1', query, 0)).rejects.toThrow(
        'boom',
      );
      await expect(lookupSessionUser('user-1', query, 0)).rejects.toThrow(
        'boom',
      );

      expect(query).toHaveBeenCalledTimes(2);
    });

    // 0件は「確定した答え」なので失敗ではない。
    // 引き直すと、消えた行を毎リクエスト引き続けることになる
    it('0件（PGRST116）は使い回す', async () => {
      const query = jest.fn().mockResolvedValue({
        data: null,
        error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
      });

      await lookupSessionUser('user-1', query, 0);
      await lookupSessionUser('user-1', query, 0);

      expect(query).toHaveBeenCalledTimes(1);
    });

    // 失敗に相乗りしたぶんは全員が同じ失敗を受け取る（押し続けない）
    it('失敗でも進行中のぶんは相乗りする', async () => {
      const { query, calls } = deferredQuery();

      const results = Promise.all([
        lookupSessionUser('user-1', query, 0),
        lookupSessionUser('user-1', query, 0),
      ]);

      expect(query).toHaveBeenCalledTimes(1);

      calls[0]({ data: null, error: { code: '' } });

      await expect(results).resolves.toEqual([
        { data: null, error: { code: '' } },
        { data: null, error: { code: '' } },
      ]);
    });
  });

  describe('エントリの解放', () => {
    /**
     * ⚠️ 呼び出し回数では掃除の有無を区別できない（期限切れのエントリは
     * どのみちミスになる）。エントリ数そのものを見ること
     */
    it('期限切れのエントリは次の取得開始時に捨てられる', async () => {
      const query = jest.fn().mockResolvedValue({ data: row, error: null });

      for (let i = 0; i < 10; i += 1) {
        await lookupSessionUser(`user-${i}`, query, 0);
      }
      expect(__getSessionUserLookupSizeForTest()).toBe(10);

      // TTL を過ぎてから1件引くと、古い10件は消えて新しい1件だけ残る
      await lookupSessionUser('user-new', query, SESSION_USER_LOOKUP_TTL_MS);

      expect(__getSessionUserLookupSizeForTest()).toBe(1);
    });

    // bcrypt ハッシュをプロセス内に置き続けない
    it('password_hash をキャッシュに載せない', async () => {
      const query = jest.fn().mockResolvedValue({ data: row, error: null });

      const { data } = await lookupSessionUser('user-1', query, 0);

      expect(data).not.toHaveProperty('password_hash');
      expect(data?.hasPassword).toBe(true);
    });

    // TTL 内の別IDだけで埋まった場合の歯止め
    it('上限を超えないよう古いものから捨てる', async () => {
      const query = jest.fn().mockResolvedValue({ data: row, error: null });

      // すべて同じ時刻＝1件も期限切れにならない状態で上限を超えて詰める。
      // 歯止めが無ければ 1,050 まで伸びる
      for (let i = 0; i < SESSION_USER_LOOKUP_MAX_ENTRIES + 50; i += 1) {
        await lookupSessionUser(`user-${i}`, query, 0);
      }

      expect(__getSessionUserLookupSizeForTest()).toBeLessThanOrEqual(
        SESSION_USER_LOOKUP_MAX_ENTRIES,
      );
    });
  });
});
