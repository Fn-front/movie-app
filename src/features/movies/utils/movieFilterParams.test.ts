/**
 * 一覧フィルターのURLクエリ相互変換 テスト
 *
 * URLは外部入力（手打ち・古いブックマーク）になりうるため、
 * 不正値がデフォルトへフォールバックし例外を投げないことを重点的に検証する。
 */

import {
  buildFilterSearchParams,
  parseFilterConditionsFromParams,
  readStoredFilterConditions,
  writeStoredFilterConditions,
} from './movieFilterParams';
import { STORAGE_KEYS } from '@/constants/common';

describe('parseFilterConditionsFromParams', () => {
  describe('正常系', () => {
    it('すべてのフィルターを復元する', () => {
      const params = new URLSearchParams({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: '28,12',
        date_range_gte: '2026-01-01',
        date_range_lte: '2026-12-31',
        is_revival: 'true',
      });

      expect(parseFilterConditionsFromParams(params)).toEqual({
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28, 12],
        date_range_gte: '2026-01-01',
        date_range_lte: '2026-12-31',
        is_revival: true,
      });
    });

    it('is_revival=false を false として復元する', () => {
      const params = new URLSearchParams({ is_revival: 'false' });

      expect(parseFilterConditionsFromParams(params)).toEqual({
        is_revival: false,
      });
    });

    it('フィルター以外のクエリは無視する', () => {
      const params = new URLSearchParams({ page: '3', query: 'テスト' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });
  });

  describe('空状態', () => {
    it('クエリが空の場合は空オブジェクトを返す', () => {
      expect(parseFilterConditionsFromParams(new URLSearchParams())).toEqual(
        {},
      );
    });
  });

  describe('入力バリデーション（不正値はフィールド単位で捨てる）', () => {
    it('enum外のsort_byを捨てる', () => {
      const params = new URLSearchParams({ sort_by: 'runtime' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it('enum外のrelease_typeを捨てる', () => {
      const params = new URLSearchParams({ release_type: 'tv' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it('NaNを含むgenre_idsから有効なIDだけを残す', () => {
      const params = new URLSearchParams({ genre_ids: '28,abc,12' });

      expect(parseFilterConditionsFromParams(params)).toEqual({
        genre_ids: [28, 12],
      });
    });

    it('0以下のgenre_idsを捨てる', () => {
      const params = new URLSearchParams({ genre_ids: '0,-5' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it('小数のgenre_idsを捨てる', () => {
      const params = new URLSearchParams({ genre_ids: '28.5' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it('日付形式が不正なdate_range_gteを捨てる', () => {
      const params = new URLSearchParams({ date_range_gte: '2026/01/01' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it('日付形式が不正なdate_range_lteを捨てる', () => {
      const params = new URLSearchParams({ date_range_lte: 'invalid' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it("'true' / 'false' 以外のis_revivalを捨てる", () => {
      const params = new URLSearchParams({ is_revival: '1' });

      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });

    it('一部が不正でも他のフィルターは復元する', () => {
      const params = new URLSearchParams({
        sort_by: 'popularity',
        release_type: 'invalid',
        genre_ids: '28',
      });

      expect(parseFilterConditionsFromParams(params)).toEqual({
        sort_by: 'popularity',
        genre_ids: [28],
      });
    });

    it('すべて不正でも例外を投げずに空オブジェクトを返す', () => {
      const params = new URLSearchParams({
        sort_by: 'x',
        release_type: 'y',
        genre_ids: 'z',
        date_range_gte: 'bad',
        date_range_lte: 'bad',
        is_revival: 'maybe',
      });

      expect(() => parseFilterConditionsFromParams(params)).not.toThrow();
      expect(parseFilterConditionsFromParams(params)).toEqual({});
    });
  });
});

describe('buildFilterSearchParams', () => {
  it('フィルター条件をクエリに反映する', () => {
    const params = buildFilterSearchParams(new URLSearchParams(), {
      sort_by: 'popularity',
      release_type: 'streaming',
      genre_ids: [28, 12],
      date_range_gte: '2026-01-01',
      date_range_lte: '2026-12-31',
      is_revival: true,
    });

    expect(params.get('sort_by')).toBe('popularity');
    expect(params.get('release_type')).toBe('streaming');
    expect(params.get('genre_ids')).toBe('28,12');
    expect(params.get('date_range_gte')).toBe('2026-01-01');
    expect(params.get('date_range_lte')).toBe('2026-12-31');
    expect(params.get('is_revival')).toBe('true');
  });

  it('is_revival=false を文字列 false として書き込む', () => {
    const params = buildFilterSearchParams(new URLSearchParams(), {
      is_revival: false,
    });

    expect(params.get('is_revival')).toBe('false');
  });

  it('条件に含まれないフィルターキーを削除する', () => {
    const current = new URLSearchParams({
      sort_by: 'popularity',
      genre_ids: '28',
      is_revival: 'true',
    });

    const params = buildFilterSearchParams(current, {
      sort_by: 'release_date',
    });

    expect(params.get('sort_by')).toBe('release_date');
    expect(params.has('genre_ids')).toBe(false);
    expect(params.has('is_revival')).toBe(false);
  });

  it('空配列のgenre_idsはキーごと削除する', () => {
    const current = new URLSearchParams({ genre_ids: '28' });

    const params = buildFilterSearchParams(current, { genre_ids: [] });

    expect(params.has('genre_ids')).toBe(false);
  });

  it('フィルター以外のクエリは保持する', () => {
    const current = new URLSearchParams({ query: 'テスト' });

    const params = buildFilterSearchParams(current, { sort_by: 'popularity' });

    expect(params.get('query')).toBe('テスト');
  });

  it('parse との往復で値が保たれる', () => {
    const conditions = {
      sort_by: 'vote_average' as const,
      release_type: 'theatrical' as const,
      genre_ids: [28, 12, 878],
      date_range_gte: '2026-02-01',
      date_range_lte: '2026-03-01',
      is_revival: false,
    };

    const params = buildFilterSearchParams(new URLSearchParams(), conditions);

    expect(parseFilterConditionsFromParams(params)).toEqual(conditions);
  });
});

describe('localStorage への保存と復元', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('保存した条件を復元できる', () => {
    const conditions = {
      sort_by: 'popularity' as const,
      release_type: 'streaming' as const,
      genre_ids: [28, 12],
      date_range_gte: '2026-01-01',
      is_revival: true,
    };

    writeStoredFilterConditions(conditions);

    expect(readStoredFilterConditions()).toEqual(conditions);
  });

  it('未保存の場合は空オブジェクトを返す', () => {
    expect(readStoredFilterConditions()).toEqual({});
  });

  it('保存値が壊れたJSONでも例外を投げず空を返す', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    window.localStorage.setItem(STORAGE_KEYS.MOVIE_FILTERS, '{壊れた');

    expect(() => readStoredFilterConditions()).not.toThrow();
    expect(readStoredFilterConditions()).toEqual({});
  });

  it('保存値がオブジェクトでない場合は空を返す', () => {
    window.localStorage.setItem(STORAGE_KEYS.MOVIE_FILTERS, '"文字列"');

    expect(readStoredFilterConditions()).toEqual({});
  });

  it('保存値の不正なフィールドだけを捨てる', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.MOVIE_FILTERS,
      JSON.stringify({
        sort_by: 'popularity',
        release_type: 'invalid',
        genre_ids: ['28', 'abc'],
        date_range_gte: '2026/01/01',
        is_revival: 'maybe',
      }),
    );

    // 文字列の数値はIDとして有効、それ以外は捨てる
    expect(readStoredFilterConditions()).toEqual({
      sort_by: 'popularity',
      genre_ids: [28],
    });
  });

  it('localStorage が利用不可でも例外を投げない（読み取り）', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(window.localStorage.__proto__, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });

    expect(() => readStoredFilterConditions()).not.toThrow();
    expect(readStoredFilterConditions()).toEqual({});
  });

  it('localStorage が利用不可でも例外を投げない（書き込み）', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    expect(() =>
      writeStoredFilterConditions({ sort_by: 'popularity' }),
    ).not.toThrow();
  });

  describe('include_regions の永続化', () => {
    it('URLのカンマ区切りを配列に復元する', () => {
      const params = new URLSearchParams('include_regions=korea,chinese');

      const conditions = parseFilterConditionsFromParams(params);

      expect(conditions.include_regions).toEqual(['korea', 'chinese']);
    });

    it('未知の地域キーが混ざるフィールドは捨てる', () => {
      const params = new URLSearchParams('include_regions=korea,atlantis');

      const conditions = parseFilterConditionsFromParams(params);

      expect(conditions.include_regions).toBeUndefined();
    });

    it('localStorage の配列形式からも復元する', () => {
      window.localStorage.setItem(
        STORAGE_KEYS.MOVIE_FILTERS,
        JSON.stringify({ include_regions: ['thai_indian'] }),
      );

      expect(readStoredFilterConditions().include_regions).toEqual([
        'thai_indian',
      ]);
    });

    it('配列をカンマ区切りでURLに書き戻す', () => {
      const params = buildFilterSearchParams(new URLSearchParams(), {
        include_regions: ['korea', 'thai_indian'],
      });

      expect(params.get('include_regions')).toBe('korea,thai_indian');
    });

    it('空配列はURLに書かない', () => {
      const params = buildFilterSearchParams(new URLSearchParams(), {
        include_regions: [],
      });

      expect(params.has('include_regions')).toBe(false);
    });
  });
});
