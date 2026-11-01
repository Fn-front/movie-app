/**
 * ウォッチリスト zodスキーマ テスト
 */

import {
  watchlistAddSchema,
  watchlistBulkDeleteSchema,
  watchlistQuerySchema,
  watchlistWatchedQuerySchema,
} from './watchlist';

describe('watchlistAddSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      poster_path: '/test.jpg',
      release_date: '2026-03-01',
    });
    expect(result.success).toBe(true);
  });

  it('poster_pathとrelease_dateがnullでも成功する', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      poster_path: null,
      release_date: null,
    });
    expect(result.success).toBe(true);
  });

  it('poster_pathとrelease_dateが省略でも成功する', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
    });
    expect(result.success).toBe(true);
  });

  it('tmdb_movie_idが0以下の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 0,
      title: 'テスト映画',
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが負の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: -1,
      title: 'テスト映画',
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが小数の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 1.5,
      title: 'テスト映画',
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが未指定の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      title: 'テスト映画',
    });
    expect(result.success).toBe(false);
  });

  it('titleが空の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('titleが256文字以上の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'a'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('release_dateの形式が不正な場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      release_date: '2026/03/01',
    });
    expect(result.success).toBe(false);
  });

  it('release_dateが日付形式でない文字列の場合エラーになる', () => {
    const result = watchlistAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      release_date: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

describe('watchlistQuerySchema', () => {
  it('パラメータなしでデフォルト値が設定される', () => {
    const result = watchlistQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it('有効なcursorとlimitでパースが成功する', () => {
    const result = watchlistQuerySchema.safeParse({
      cursor: '2026-01-29T10:00:00.000Z',
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it('limitが文字列でもcoerceで変換される', () => {
    const result = watchlistQuerySchema.safeParse({
      limit: '30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(30);
    }
  });

  it('limitが0以下の場合エラーになる', () => {
    const result = watchlistQuerySchema.safeParse({
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('limitが50を超える場合エラーになる', () => {
    const result = watchlistQuerySchema.safeParse({
      limit: 51,
    });
    expect(result.success).toBe(false);
  });

  it('cursorが文字列であれば受け入れる', () => {
    const result = watchlistQuerySchema.safeParse({
      cursor: '10',
    });
    expect(result.success).toBe(true);
  });

  it('sortにadded_atを指定できる', () => {
    const result = watchlistQuerySchema.safeParse({
      sort: 'added_at',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('added_at');
    }
  });

  it('sortにrelease_date_proximityを指定できる', () => {
    const result = watchlistQuerySchema.safeParse({
      sort: 'release_date_proximity',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('release_date_proximity');
    }
  });

  it('sortのデフォルト値がadded_atになる', () => {
    const result = watchlistQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('added_at');
    }
  });

  it('sortに不正な値を指定するとエラーになる', () => {
    const result = watchlistQuerySchema.safeParse({
      sort: 'invalid_sort',
    });
    expect(result.success).toBe(false);
  });
});

describe('watchlistWatchedQuerySchema', () => {
  it('年のみ指定で limit がデフォルト値になる', () => {
    const result = watchlistWatchedQuerySchema.safeParse({ year: '2024' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2024);
      expect(result.data.limit).toBe(20);
    }
  });

  it('年が下限より小さいと失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '1999' }).success,
    ).toBe(false);
  });

  it('年が上限より大きいと失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '2101' }).success,
    ).toBe(false);
  });

  it('年が数値でないと失敗する', () => {
    expect(watchlistWatchedQuerySchema.safeParse({ year: 'abc' }).success).toBe(
      false,
    );
  });

  it('limit が上限を超えると失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '2024', limit: '51' })
        .success,
    ).toBe(false);
  });

  it('cursor 省略時は0になる', () => {
    const result = watchlistWatchedQuerySchema.safeParse({ year: '2024' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe(0);
    }
  });

  it('cursor が負数だと失敗する', () => {
    expect(
      watchlistWatchedQuerySchema.safeParse({ year: '2024', cursor: '-1' })
        .success,
    ).toBe(false);
  });
});

describe('watchlistBulkDeleteSchema', () => {
  it('exclude_ids 省略時は空配列になる', () => {
    const result = watchlistBulkDeleteSchema.safeParse({ year: 2024 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exclude_ids).toEqual([]);
    }
  });

  it('UUID の配列を受け付ける', () => {
    const result = watchlistBulkDeleteSchema.safeParse({
      year: 2024,
      exclude_ids: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(result.success).toBe(true);
  });

  it('UUID でない要素があると失敗する', () => {
    const result = watchlistBulkDeleteSchema.safeParse({
      year: 2024,
      exclude_ids: ['not-a-uuid'],
    });

    expect(result.success).toBe(false);
  });

  it('exclude_ids が1001件だと失敗する', () => {
    const ids = Array.from(
      { length: 1001 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );
    const result = watchlistBulkDeleteSchema.safeParse({
      year: 2024,
      exclude_ids: ids,
    });

    expect(result.success).toBe(false);
  });

  it('年が範囲外だと失敗する', () => {
    expect(watchlistBulkDeleteSchema.safeParse({ year: 1999 }).success).toBe(
      false,
    );
  });
});
