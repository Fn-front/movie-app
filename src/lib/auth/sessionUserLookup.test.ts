import {
  __resetSessionUserLookup,
  lookupSessionUser,
  SESSION_USER_LOOKUP_TTL_MS,
  type SessionUserLookupResult,
} from './sessionUserLookup';
import { SUPABASE_ERROR_CODE } from '@/constants/api';

const row = {
  password_hash: 'hash',
  password_changed_at: '2026-11-01T00:00:00.000Z',
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
  __resetSessionUserLookup();
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

  it('エントリが溜まっても期限切れは掃除される', async () => {
    const query = jest.fn().mockResolvedValue({ data: row, error: null });

    for (let i = 0; i < 1_000; i += 1) {
      await lookupSessionUser(`user-${i}`, query, 0);
    }
    expect(query).toHaveBeenCalledTimes(1_000);

    // 期限切れ後に新しい利用者を入れると掃除が走る。
    // 掃除後は古い利用者も当然引き直しになる
    await lookupSessionUser('user-new', query, SESSION_USER_LOOKUP_TTL_MS);
    await lookupSessionUser('user-0', query, SESSION_USER_LOOKUP_TTL_MS);

    expect(query).toHaveBeenCalledTimes(1_002);
  });
});
