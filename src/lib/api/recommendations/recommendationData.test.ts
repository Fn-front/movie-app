/**
 * fetchRecommendationData テスト
 *
 * `recommendations.server.ts`（`auth()` を内部で呼んでいた Server Component 用の
 * 実装）から移したもの。認証は呼び出し側が済ませる前提になったので、
 * ここでは DB の応答だけを見る（#1115）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchRecommendationData } from './recommendationData';

// --- Helpers ---

type QueryResult = { data?: unknown; error?: unknown; count?: number };

/**
 * `from(table)` ごとに返す結果を差し替えられる Supabase のスタブ
 *
 * 実装は3つのクエリを `Promise.all` で並列に投げる。テーブル名で引けるように
 * しておかないと、順序に依存した脆いスタブになる
 */
/**
 * `range()` が呼ばれたテーブルと回数
 *
 * ⚠️ スタブは thenable なので、`.range()` を外しても `await` は解決する。
 * これを数えないと、#1274 のページング対策を丸ごと消してもテストが緑になる
 */
let rangeCalls: Record<string, number> = {};

const createSupabase = (results: Record<string, QueryResult>) => {
  rangeCalls = {};

  const builder = (table: string) => {
    const result = results[table] ?? { data: [], error: null };
    // `order` はチェーンを返す。`dismissed_movies` は #1274 で
    // `.order().range()` に変わったため、ここで解決してしまうと
    // `.range` が無くて落ちる。末端は thenable と `range` の両方で受ける
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      range: () => {
        rangeCalls[table] = (rangeCalls[table] ?? 0) + 1;
        return Promise.resolve(result);
      },
      then: (resolve: (value: QueryResult) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  };

  return { from: jest.fn(builder) } as unknown as SupabaseClient;
};

const recommendationRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rec-1',
  tmdb_movie_id: 101,
  title: 'おすすめ映画',
  poster_path: '/p.jpg',
  release_date: '2026-01-01',
  vote_average: 8,
  vote_count: 100,
  genre_ids: [28],
  reason: '理由',
  display_order: 1,
  generated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

// --- Tests ---

describe('fetchRecommendationData', () => {
  it('レコメンド・お気に入り有無・生成日時を返す', async () => {
    const supabase = createSupabase({
      recommendations: { data: [recommendationRow()], error: null },
      favorites: { count: 3, error: null },
      dismissed_movies: { data: [], error: null },
    });

    const result = await fetchRecommendationData(supabase, 'user-123');

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toEqual(
      expect.objectContaining({ id: 'rec-1', tmdb_movie_id: 101 }),
    );
    expect(result.hasFavorites).toBe(true);
    expect(result.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  // 興味なしは生成後に付けられるので、保存済みのレコメンドにも混ざりうる
  /**
   * 興味なしの取得をページングで読み切る（#1274）
   *
   * `range()` を外すと PostgREST の `max_rows`（1000）で黙って打ち切られ、
   * 1001件目以降が除外されなくなる。スタブは thenable なので、
   * `range` の呼び出しを数えないと外しても緑のまま通る
   */
  it('興味なしはページングで読み切る', async () => {
    const supabase = createSupabase({
      recommendations: { data: [recommendationRow()], error: null },
      favorites: { count: 1 },
      dismissed_movies: { data: [], error: null },
    });

    await fetchRecommendationData(supabase, 'user-123');

    expect(rangeCalls.dismissed_movies).toBeGreaterThan(0);
  });

  /**
   * 興味なしの取得に失敗しても、レコメンド自体は返す（従来どおり）
   *
   * 除外が効かずに作品が出るだけで、レコメンドは返せる。ただし黙って
   * 握らずログには残す
   */
  it('興味なしの取得に失敗してもレコメンドを返し、ログに残す', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const supabase = createSupabase({
        recommendations: { data: [recommendationRow()], error: null },
        favorites: { count: 1 },
        dismissed_movies: { data: null, error: { message: 'boom' } },
      });

      const result = await fetchRecommendationData(supabase, 'user-123');

      expect(result.recommendations).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Dismissed movies query error:',
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('興味なしにした作品を除く', async () => {
    const supabase = createSupabase({
      recommendations: {
        data: [
          recommendationRow({ id: 'rec-1', tmdb_movie_id: 101 }),
          recommendationRow({ id: 'rec-2', tmdb_movie_id: 202 }),
        ],
        error: null,
      },
      favorites: { count: 1, error: null },
      dismissed_movies: { data: [{ tmdb_movie_id: 202 }], error: null },
    });

    const result = await fetchRecommendationData(supabase, 'user-123');

    expect(result.recommendations.map((r) => r.tmdb_movie_id)).toEqual([101]);
  });

  it('お気に入りが0件なら hasFavorites は false', async () => {
    const supabase = createSupabase({
      recommendations: { data: [], error: null },
      favorites: { count: 0, error: null },
      dismissed_movies: { data: [], error: null },
    });

    const result = await fetchRecommendationData(supabase, 'user-123');

    expect(result.hasFavorites).toBe(false);
    expect(result.generatedAt).toBeNull();
  });

  // 取得に失敗してもホームごと落とさない（セクションは「準備中」になる）
  it('取得に失敗したら空のデータを返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = createSupabase({
      recommendations: { data: null, error: { message: 'boom' } },
      favorites: { count: 5, error: null },
      dismissed_movies: { data: [], error: null },
    });

    const result = await fetchRecommendationData(supabase, 'user-123');

    expect(result).toEqual({
      recommendations: [],
      generatedAt: null,
      hasFavorites: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
