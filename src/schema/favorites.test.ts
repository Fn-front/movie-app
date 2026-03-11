/**
 * お気に入り zodスキーマ テスト
 */

import {
  favoritesAddSchema,
  favoritesUpdateSchema,
  favoritesQuerySchema,
} from './favorites';

describe('favoritesAddSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      poster_path: '/test.jpg',
      release_date: '2026-03-01',
      rating: 8,
    });
    expect(result.success).toBe(true);
  });

  it('poster_pathとrelease_dateがnullでも成功する', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      poster_path: null,
      release_date: null,
      rating: 5,
    });
    expect(result.success).toBe(true);
  });

  it('poster_pathとrelease_dateが省略でも成功する', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 1,
    });
    expect(result.success).toBe(true);
  });

  it('tmdb_movie_idが0以下の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 0,
      title: 'テスト映画',
      rating: 5,
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが負の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: -1,
      title: 'テスト映画',
      rating: 5,
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが小数の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 1.5,
      title: 'テスト映画',
      rating: 5,
    });
    expect(result.success).toBe(false);
  });

  it('tmdb_movie_idが未指定の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      title: 'テスト映画',
      rating: 5,
    });
    expect(result.success).toBe(false);
  });

  it('titleが空の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: '',
      rating: 5,
    });
    expect(result.success).toBe(false);
  });

  it('titleが256文字以上の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'a'.repeat(256),
      rating: 5,
    });
    expect(result.success).toBe(false);
  });

  it('release_dateの形式が不正な場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 5,
      release_date: '2026/03/01',
    });
    expect(result.success).toBe(false);
  });

  it('ratingが0の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 0,
    });
    expect(result.success).toBe(false);
  });

  it('ratingが11以上の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 11,
    });
    expect(result.success).toBe(false);
  });

  it('ratingが小数の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it('ratingが未指定の場合エラーになる', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
    });
    expect(result.success).toBe(false);
  });

  it('ratingが1の場合成功する（最小値）', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 1,
    });
    expect(result.success).toBe(true);
  });

  it('ratingが10の場合成功する（最大値）', () => {
    const result = favoritesAddSchema.safeParse({
      tmdb_movie_id: 12345,
      title: 'テスト映画',
      rating: 10,
    });
    expect(result.success).toBe(true);
  });
});

describe('favoritesUpdateSchema', () => {
  it('有効なratingでパースが成功する', () => {
    const result = favoritesUpdateSchema.safeParse({ rating: 7 });
    expect(result.success).toBe(true);
  });

  it('ratingが1で成功する（最小値）', () => {
    const result = favoritesUpdateSchema.safeParse({ rating: 1 });
    expect(result.success).toBe(true);
  });

  it('ratingが10で成功する（最大値）', () => {
    const result = favoritesUpdateSchema.safeParse({ rating: 10 });
    expect(result.success).toBe(true);
  });

  it('ratingが0の場合エラーになる', () => {
    const result = favoritesUpdateSchema.safeParse({ rating: 0 });
    expect(result.success).toBe(false);
  });

  it('ratingが11の場合エラーになる', () => {
    const result = favoritesUpdateSchema.safeParse({ rating: 11 });
    expect(result.success).toBe(false);
  });

  it('ratingが小数の場合エラーになる', () => {
    const result = favoritesUpdateSchema.safeParse({ rating: 5.5 });
    expect(result.success).toBe(false);
  });

  it('ratingが未指定の場合エラーになる', () => {
    const result = favoritesUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('favoritesQuerySchema', () => {
  it('パラメータなしでデフォルト値が設定される', () => {
    const result = favoritesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_by).toBe('added_at');
      expect(result.data.sort_order).toBe('desc');
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('有効な全パラメータでパースが成功する', () => {
    const result = favoritesQuerySchema.safeParse({
      sort_by: 'rating',
      sort_order: 'asc',
      page: 2,
      limit: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_by).toBe('rating');
      expect(result.data.sort_order).toBe('asc');
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it('pageとlimitが文字列でもcoerceで変換される', () => {
    const result = favoritesQuerySchema.safeParse({
      page: '3',
      limit: '30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(30);
    }
  });

  it('limitが0以下の場合エラーになる', () => {
    const result = favoritesQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('limitが50を超える場合エラーになる', () => {
    const result = favoritesQuerySchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it('pageが0の場合エラーになる', () => {
    const result = favoritesQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('sort_byが不正な値の場合エラーになる', () => {
    const result = favoritesQuerySchema.safeParse({ sort_by: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('sort_orderが不正な値の場合エラーになる', () => {
    const result = favoritesQuerySchema.safeParse({ sort_order: 'invalid' });
    expect(result.success).toBe(false);
  });
});
