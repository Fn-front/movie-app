/**
 * movie_cache フィルタ適用ヘルパのテスト
 */

import {
  applyMovieCacheFilters,
  type MovieCacheFilters,
} from './movieCacheFilters';

/** クエリビルダーに対する呼び出し記録 */
interface RecordedCall {
  method: 'eq' | 'gt' | 'gte' | 'lte' | 'or';
  args: unknown[];
}

/**
 * 呼び出しを記録するクエリビルダーのスパイ
 *
 * Supabaseのクエリビルダーと同じく、各メソッドは自身を返してチェインできる
 */
function createQueryBuilderSpy() {
  const calls: RecordedCall[] = [];

  const builder = {
    calls,
    eq(column: string, value: string | boolean) {
      calls.push({ method: 'eq', args: [column, value] });
      return builder;
    },
    gt(column: string, value: string) {
      calls.push({ method: 'gt', args: [column, value] });
      return builder;
    },
    gte(column: string, value: string) {
      calls.push({ method: 'gte', args: [column, value] });
      return builder;
    },
    lte(column: string, value: string) {
      calls.push({ method: 'lte', args: [column, value] });
      return builder;
    },
    or(filters: string) {
      calls.push({ method: 'or', args: [filters] });
      return builder;
    },
  };

  return builder;
}

/** 最小構成のフィルタ条件 */
const baseFilters: MovieCacheFilters = {
  releaseType: 'theatrical',
  isNowPlayingTheatrical: false,
  genreIds: [],
};

describe('applyMovieCacheFilters', () => {
  describe('release_type', () => {
    it('常にrelease_typeで絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(query.calls).toEqual([
        { method: 'eq', args: ['release_type', 'theatrical'] },
      ]);
    });

    it('streamingを指定できること', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        releaseType: 'streaming',
      });

      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['release_type', 'streaming'],
      });
    });
  });

  describe('is_now_playing', () => {
    it('isNowPlayingTheatricalがtrueの場合、is_now_playingで絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        isNowPlayingTheatrical: true,
      });

      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['is_now_playing', true],
      });
    });

    it('isNowPlayingTheatricalがfalseの場合、is_now_playingで絞り込まないこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(query.calls).not.toContainEqual(
        expect.objectContaining({ args: ['is_now_playing', true] }),
      );
    });
  });

  describe('is_currently_streaming', () => {
    it('trueの場合、配信中のみに絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        releaseType: 'streaming',
        isCurrentlyStreaming: true,
      });

      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['is_currently_streaming', true],
      });
    });

    it('falseの場合、未配信のみに絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        releaseType: 'streaming',
        isCurrentlyStreaming: false,
      });

      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['is_currently_streaming', false],
      });
    });

    it('undefinedの場合、配信状況で絞り込まないこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(
        query.calls.some((call) => call.args[0] === 'is_currently_streaming'),
      ).toBe(false);
    });
  });

  describe('digital_release_date', () => {
    it('指定された場合、デジタル公開日が指定日より後のものに絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        releaseType: 'streaming',
        digitalReleaseDateGt: '2026-10-20',
      });

      expect(query.calls).toContainEqual({
        method: 'gt',
        args: ['digital_release_date', '2026-10-20'],
      });
    });

    it('未指定の場合、デジタル公開日で絞り込まないこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(query.calls.some((call) => call.method === 'gt')).toBe(false);
    });
  });

  describe('日付範囲', () => {
    it('dateGteが指定された場合、release_dateの下限で絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        dateGte: '2026-01-01',
      });

      expect(query.calls).toContainEqual({
        method: 'gte',
        args: ['release_date', '2026-01-01'],
      });
    });

    it('dateLteが指定された場合、release_dateの上限で絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        dateLte: '2026-12-31',
      });

      expect(query.calls).toContainEqual({
        method: 'lte',
        args: ['release_date', '2026-12-31'],
      });
    });

    it('日付が未指定の場合、日付で絞り込まないこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(query.calls.some((call) => call.method === 'gte')).toBe(false);
      expect(query.calls.some((call) => call.method === 'lte')).toBe(false);
    });

    it('下限と上限の両方を適用できること', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        ...baseFilters,
        dateGte: '2026-01-01',
        dateLte: '2026-12-31',
      });

      expect(query.calls).toEqual([
        { method: 'eq', args: ['release_type', 'theatrical'] },
        { method: 'gte', args: ['release_date', '2026-01-01'] },
        { method: 'lte', args: ['release_date', '2026-12-31'] },
      ]);
    });
  });

  describe('is_revival', () => {
    it('trueの場合、is_revivalで絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, { ...baseFilters, isRevival: true });

      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['is_revival', true],
      });
    });

    it('falseの場合も、is_revivalで絞り込むこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, { ...baseFilters, isRevival: false });

      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['is_revival', false],
      });
    });

    it('undefinedの場合、is_revivalで絞り込まないこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(query.calls).not.toContainEqual(
        expect.objectContaining({ args: ['is_revival', false] }),
      );
    });
  });

  describe('ジャンル', () => {
    it('単一ジャンルのOR条件を組み立てること', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, { ...baseFilters, genreIds: [28] });

      expect(query.calls).toContainEqual({
        method: 'or',
        args: ['genre_ids.cs.[28]'],
      });
    });

    it('複数ジャンルをカンマ区切りのOR条件にすること', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, { ...baseFilters, genreIds: [28, 12, 35] });

      expect(query.calls).toContainEqual({
        method: 'or',
        args: ['genre_ids.cs.[28],genre_ids.cs.[12],genre_ids.cs.[35]'],
      });
    });

    it('空配列の場合、ジャンルで絞り込まないこと', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, baseFilters);

      expect(query.calls.some((call) => call.method === 'or')).toBe(false);
    });
  });

  describe('複合条件', () => {
    it('全条件を適用できること', () => {
      const query = createQueryBuilderSpy();

      applyMovieCacheFilters(query, {
        releaseType: 'theatrical',
        isNowPlayingTheatrical: true,
        dateGte: '2026-01-01',
        dateLte: '2026-12-31',
        isRevival: true,
        genreIds: [28, 12],
      });

      expect(query.calls).toEqual([
        { method: 'eq', args: ['release_type', 'theatrical'] },
        { method: 'eq', args: ['is_now_playing', true] },
        { method: 'gte', args: ['release_date', '2026-01-01'] },
        { method: 'lte', args: ['release_date', '2026-12-31'] },
        { method: 'eq', args: ['is_revival', true] },
        { method: 'or', args: ['genre_ids.cs.[28],genre_ids.cs.[12]'] },
      ]);
    });

    it('チェイン可能なようにクエリを返すこと', () => {
      const query = createQueryBuilderSpy();

      const result = applyMovieCacheFilters(query, baseFilters);

      expect(result).toBe(query);
    });
  });

  describe('総件数クエリとデータクエリの整合性', () => {
    // 片方だけ条件が漏れると総件数と実データが食い違い、
    // ページング（hasNextPage）判定が壊れるため、同一条件になることを担保する
    const filterPatterns: { name: string; filters: MovieCacheFilters }[] = [
      { name: '条件なし', filters: baseFilters },
      {
        name: '公開中（劇場）',
        filters: { ...baseFilters, isNowPlayingTheatrical: true },
      },
      {
        name: '日付範囲のみ',
        filters: {
          ...baseFilters,
          dateGte: '2026-01-01',
          dateLte: '2026-06-30',
        },
      },
      {
        name: 'リバイバルのみ',
        filters: { ...baseFilters, isRevival: true },
      },
      {
        name: 'ジャンルのみ',
        filters: { ...baseFilters, genreIds: [28, 878] },
      },
      {
        name: '配信中のみ',
        filters: {
          ...baseFilters,
          releaseType: 'streaming',
          isCurrentlyStreaming: true,
        },
      },
      {
        name: '配信予定のみ',
        filters: {
          ...baseFilters,
          releaseType: 'streaming',
          isCurrentlyStreaming: false,
          digitalReleaseDateGt: '2026-10-20',
        },
      },
      {
        name: '全条件',
        filters: {
          releaseType: 'streaming',
          isNowPlayingTheatrical: false,
          isCurrentlyStreaming: false,
          digitalReleaseDateGt: '2026-10-20',
          dateGte: '2026-01-01',
          dateLte: '2026-12-31',
          isRevival: false,
          genreIds: [18],
        },
      },
    ];

    it.each(filterPatterns)(
      '$name で両クエリに同じ条件が適用されること',
      ({ filters }) => {
        const countQuery = createQueryBuilderSpy();
        const dataQuery = createQueryBuilderSpy();

        applyMovieCacheFilters(countQuery, filters);
        applyMovieCacheFilters(dataQuery, filters);

        expect(countQuery.calls).toEqual(dataQuery.calls);
      },
    );
  });
});
