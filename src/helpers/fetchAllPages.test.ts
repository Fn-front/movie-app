import { fetchAllPages } from './fetchAllPages';

/** ページ番号ごとに決まった結果を返す問い合わせを作る */
function createQuery(pages: { data: unknown[] | null; error?: unknown }[]) {
  const calls: Array<{ from: number; to: number }> = [];

  const query = jest.fn((from: number, to: number) => {
    calls.push({ from, to });
    const page = pages[calls.length - 1] ?? { data: [] };
    return Promise.resolve({ data: page.data, error: page.error ?? null });
  });

  return { query, calls };
}

const row = (id: number) => ({ id });

describe('fetchAllPages', () => {
  it('1ページで終わるなら1往復で返す', async () => {
    const { query, calls } = createQuery([{ data: [row(1), row(2)] }]);

    await expect(
      fetchAllPages({ pageSize: 10, maxPages: 5, label: 'test', query }),
    ).resolves.toEqual([row(1), row(2)]);

    expect(calls).toEqual([{ from: 0, to: 9 }]);
  });

  /**
   * ⚠️ 本題。ページサイズ**ちょうど**で止めると、PostgREST の `max_rows` と
   * 同じ「黙って打ち切る」挙動を自前で再現してしまう（#1274）
   */
  it('ちょうどページサイズなら次のページを読む', async () => {
    const full = [row(1), row(2)];
    const { query, calls } = createQuery([{ data: full }, { data: [row(3)] }]);

    await expect(
      fetchAllPages({ pageSize: 2, maxPages: 5, label: 'test', query }),
    ).resolves.toEqual([row(1), row(2), row(3)]);

    expect(calls).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 3 },
    ]);
  });

  it('ページの境界を飛ばさずに繋ぐ', async () => {
    const { query, calls } = createQuery([
      { data: [row(1), row(2)] },
      { data: [row(3), row(4)] },
      { data: [] },
    ]);

    await fetchAllPages({ pageSize: 2, maxPages: 5, label: 'test', query });

    expect(calls).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 3 },
      { from: 4, to: 5 },
    ]);
  });

  it('0件なら空配列を返す', async () => {
    const { query } = createQuery([{ data: [] }]);

    await expect(
      fetchAllPages({ pageSize: 10, maxPages: 5, label: 'test', query }),
    ).resolves.toEqual([]);
  });

  it('data が null でも落ちない', async () => {
    const { query } = createQuery([{ data: null }]);

    await expect(
      fetchAllPages({ pageSize: 10, maxPages: 5, label: 'test', query }),
    ).resolves.toEqual([]);
  });

  // 握ると呼び出し側が「0件」と「取得できなかった」を区別できない
  it('エラーはそのまま投げる', async () => {
    const { query } = createQuery([{ data: null, error: { message: 'boom' } }]);

    await expect(
      fetchAllPages({ pageSize: 10, maxPages: 5, label: 'test', query }),
    ).rejects.toEqual({ message: 'boom' });
  });

  it('途中のページで失敗しても投げる', async () => {
    const { query, calls } = createQuery([
      { data: [row(1), row(2)] },
      { data: null, error: { message: 'boom' } },
    ]);

    await expect(
      fetchAllPages({ pageSize: 2, maxPages: 5, label: 'test', query }),
    ).rejects.toEqual({ message: 'boom' });

    expect(calls).toHaveLength(2);
  });

  describe('読み取り上限', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('上限を超えて読まない', async () => {
      const { query, calls } = createQuery(
        Array.from({ length: 10 }, () => ({ data: [row(1), row(2)] })),
      );

      const rows = await fetchAllPages({
        pageSize: 2,
        maxPages: 3,
        label: 'test',
        query,
      });

      expect(calls).toHaveLength(3);
      expect(rows).toHaveLength(6);
    });

    // 黙って切ると、まさに #1274 と同じ「気づけない取りこぼし」になる
    // 「誰で起きたか」が分からないと調査に入れない（既存2本と揃える）
    it('警告に context を添える', async () => {
      const { query } = createQuery(
        Array.from({ length: 10 }, () => ({ data: [row(1), row(2)] })),
      );

      await fetchAllPages({
        pageSize: 2,
        maxPages: 3,
        label: 'dismissed-movies',
        context: 'user=user-123',
        query,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user=user-123'),
      );
    });

    it('上限に達したら label 付きで警告する', async () => {
      const { query } = createQuery(
        Array.from({ length: 10 }, () => ({ data: [row(1), row(2)] })),
      );

      await fetchAllPages({
        pageSize: 2,
        maxPages: 3,
        label: 'dismissed-movies',
        query,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('dismissed-movies'),
      );
    });

    it('上限に達しなければ警告しない', async () => {
      const { query } = createQuery([{ data: [row(1)] }]);

      await fetchAllPages({ pageSize: 2, maxPages: 3, label: 'test', query });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
