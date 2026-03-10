/**
 * ウォッチリスト zodスキーマ テスト
 */

import { watchlistAddSchema, watchlistQuerySchema } from './watchlist';

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

  it('cursorがISO 8601形式でない場合エラーになる', () => {
    const result = watchlistQuerySchema.safeParse({
      cursor: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});
