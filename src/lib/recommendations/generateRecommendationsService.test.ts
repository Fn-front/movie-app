/**
 * @jest-environment node
 */

/**
 * レコメンド生成サービス テスト
 * バッチ処理ロジック・並行数制限の検証
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  executeGenerateRecommendationsCron,
  fetchActiveUserIds,
  collectUserMovieData,
  generateRecommendationsWithRetry,
  upsertRecommendations,
  processUserRecommendations,
  BATCH_SIZE,
} from './generateRecommendationsService';

// --- Mocks ---

const mockFrom = jest.fn();
const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

const mockFetchRecommendations = jest.fn();
const mockResolveRecommendations = jest.fn();
jest.mock('@/lib/openai/generateRecommendations', () => ({
  fetchRecommendationsFromOpenAI: (...args: unknown[]) =>
    mockFetchRecommendations(...args),
  resolveRecommendationsWithTMDb: (...args: unknown[]) =>
    mockResolveRecommendations(...args),
}));

// --- Helpers ---

/** お気に入りユーザー取得のモック（select → is チェーン） */
const mockFavoritesUserQuery = (userIds: string[]) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      is: () =>
        Promise.resolve({
          data: userIds.map((id) => ({ user_id: id })),
          error: null,
        }),
    }),
  });
};

/** アクティブユーザー取得のモック */
const mockActiveUsersQuery = (userIds: string[]) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      in: () => ({
        gte: () =>
          Promise.resolve({
            data: userIds.map((id) => ({ id })),
            error: null,
          }),
      }),
    }),
  });
};

/** お気に入り映画取得のモック */
const mockFavoritesQuery = (
  favorites: { tmdb_movie_id: number; title: string; rating: number }[],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ data: favorites, error: null }),
      }),
    }),
  });
};

/** ウォッチリスト取得のモック */
const mockWatchlistQuery = (
  items: { tmdb_movie_id: number; title: string }[],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ data: items, error: null }),
      }),
    }),
  });
};

/** 興味なし映画取得のモック */
const mockDismissedMoviesQuery = (
  items: {
    tmdb_movie_id: number;
    title: string;
    genre_ids: number[] | null;
  }[] = [],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ data: items, error: null }),
      }),
    }),
  });
};

/** 既存レコメンド退避のモック */
const mockSelectExistingRecommendations = (
  recs: Record<string, unknown>[] = [],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => Promise.resolve({ data: recs, error: null }),
    }),
  });
};

/** レコメンド削除のモック */
const mockDeleteRecommendations = (success: boolean) => {
  mockFrom.mockReturnValueOnce({
    delete: () => ({
      eq: () =>
        Promise.resolve({
          data: null,
          error: success ? null : new Error('Delete failed'),
        }),
    }),
  });
};

/** レコメンド挿入のモック */
const mockInsertRecommendations = (success: boolean) => {
  mockFrom.mockReturnValueOnce({
    insert: () =>
      Promise.resolve({
        error: success ? null : new Error('Insert failed'),
      }),
  });
};

// --- Tests ---

describe('generateRecommendationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('BATCH_SIZE', () => {
    it('バッチサイズが5であること', () => {
      expect(BATCH_SIZE).toBe(5);
    });
  });

  describe('fetchActiveUserIds', () => {
    it('アクティブユーザーIDを正しく返す', async () => {
      mockFavoritesUserQuery(['user-1', 'user-2']);
      mockActiveUsersQuery(['user-1']);

      const result = await fetchActiveUserIds(mockSupabase);

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.activeUserIds).toEqual(['user-1']);
        expect(result.inactiveUsers).toBe(1);
      }
    });

    it('お気に入り取得エラーでerrorを返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          is: () =>
            Promise.resolve({ data: null, error: new Error('DB error') }),
        }),
      });

      const result = await fetchActiveUserIds(mockSupabase);

      expect(result.type).toBe('error');
    });

    it('アクティブユーザー取得エラーでerrorを返す', async () => {
      mockFavoritesUserQuery(['user-1']);
      mockFrom.mockReturnValueOnce({
        select: () => ({
          in: () => ({
            gte: () =>
              Promise.resolve({
                data: null,
                error: new Error('DB error'),
              }),
          }),
        }),
      });

      const result = await fetchActiveUserIds(mockSupabase);

      expect(result.type).toBe('error');
    });

    it('重複するuser_idが除外される', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          is: () =>
            Promise.resolve({
              data: [
                { user_id: 'user-1' },
                { user_id: 'user-1' },
                { user_id: 'user-2' },
              ],
              error: null,
            }),
        }),
      });
      mockActiveUsersQuery(['user-1', 'user-2']);

      const result = await fetchActiveUserIds(mockSupabase);

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.activeUserIds).toEqual(['user-1', 'user-2']);
      }
    });
  });

  describe('collectUserMovieData', () => {
    it('ユーザーの映画データを正しく収集する', async () => {
      mockFavoritesQuery([{ tmdb_movie_id: 1, title: '映画A', rating: 8 }]);
      mockWatchlistQuery([{ tmdb_movie_id: 2, title: '映画B' }]);
      mockDismissedMoviesQuery([
        { tmdb_movie_id: 3, title: '映画C', genre_ids: [27] },
      ]);

      const result = await collectUserMovieData(mockSupabase, 'user-1');

      expect(result).not.toBeNull();
      expect(result!.favoriteMovies).toEqual([{ title: '映画A', rating: 8 }]);
      expect(result!.excludedTitles).toEqual(['映画A', '映画B', '映画C']);
      expect(result!.baseExcludedIds).toEqual(new Set([1, 2, 3]));
      expect(result!.dismissedMovies).toEqual([
        { tmdb_movie_id: 3, title: '映画C', genre_ids: [27] },
      ]);
    });

    it('お気に入り0件でnullを返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });

      const result = await collectUserMovieData(mockSupabase, 'user-1');

      expect(result).toBeNull();
    });

    it('お気に入り取得エラーでnullを返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: null, error: new Error('err') }),
          }),
        }),
      });

      const result = await collectUserMovieData(mockSupabase, 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('generateRecommendationsWithRetry', () => {
    it('OpenAIがnullを返したら空配列を返す', async () => {
      mockFetchRecommendations.mockResolvedValue(null);

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Movie', rating: 5 }],
        ['Movie'],
        new Set([1]),
        [],
      );

      expect(result).toEqual([]);
    });
  });

  describe('upsertRecommendations', () => {
    it('正常に挿入できた場合trueを返す', async () => {
      mockSelectExistingRecommendations([]);
      mockDeleteRecommendations(true);
      mockInsertRecommendations(true);

      const result = await upsertRecommendations(mockSupabase, 'user-1', [
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      expect(result).toBe(true);
    });

    it('削除失敗でfalseを返す', async () => {
      mockSelectExistingRecommendations([]);
      mockDeleteRecommendations(false);

      const result = await upsertRecommendations(mockSupabase, 'user-1', [
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      expect(result).toBe(false);
    });

    it('挿入失敗で既存データを復元してfalseを返す', async () => {
      mockSelectExistingRecommendations([
        { id: 'old', user_id: 'user-1', tmdb_movie_id: 50, title: '旧' },
      ]);
      mockDeleteRecommendations(true);
      mockInsertRecommendations(false);
      // 復元用insert
      mockInsertRecommendations(true);

      const result = await upsertRecommendations(mockSupabase, 'user-1', [
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      expect(result).toBe(false);
    });

    it('挿入失敗で復元データがない場合、復元をスキップする', async () => {
      mockSelectExistingRecommendations([]);
      mockDeleteRecommendations(true);
      mockInsertRecommendations(false);

      const result = await upsertRecommendations(mockSupabase, 'user-1', [
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      expect(result).toBe(false);
      // 復元用insertが呼ばれない（delete + insert失敗の2回のみ）
      expect(mockFrom).toHaveBeenCalledTimes(3);
    });
  });

  describe('processUserRecommendations', () => {
    it('正常処理でprocessedを返す', async () => {
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);
      mockSelectExistingRecommendations([]);
      mockDeleteRecommendations(true);
      mockInsertRecommendations(true);

      mockFetchRecommendations.mockResolvedValueOnce([
        { title: 'Movie', year: 2020, reason: '理由' },
      ]);
      mockResolveRecommendations.mockResolvedValueOnce([
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      const result = await processUserRecommendations(mockSupabase, 'user-1');

      expect(result.status).toBe('processed');
      expect(result.recommendationCount).toBe(1);
    });

    it('映画データなしでskippedを返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });

      const result = await processUserRecommendations(mockSupabase, 'user-1');

      expect(result.status).toBe('skipped');
    });

    it('レコメンド0件でskippedを返す', async () => {
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      mockFetchRecommendations.mockResolvedValueOnce(null);

      const result = await processUserRecommendations(mockSupabase, 'user-1');

      expect(result.status).toBe('skipped');
    });
  });

  describe('executeGenerateRecommendationsCron - バッチ処理', () => {
    it('ユーザー0件の場合、バッチ処理をスキップする', async () => {
      mockFavoritesUserQuery([]);
      mockActiveUsersQuery([]);

      const result = await executeGenerateRecommendationsCron(mockSupabase);

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.data.processed_users).toBe(0);
      }
      expect(console.log).not.toHaveBeenCalled();
    });

    it('fetchActiveUserIdsがエラーの場合、即座にエラーを返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          is: () =>
            Promise.resolve({ data: null, error: new Error('DB error') }),
        }),
      });

      const result = await executeGenerateRecommendationsCron(mockSupabase);

      expect(result.type).toBe('error');
    });

    it('1ユーザーの場合、1バッチで処理しログを出力する', async () => {
      mockFavoritesUserQuery(['user-1']);
      mockActiveUsersQuery(['user-1']);
      // user-1の処理
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);
      mockSelectExistingRecommendations([]);
      mockDeleteRecommendations(true);
      mockInsertRecommendations(true);

      mockFetchRecommendations.mockResolvedValueOnce([
        { title: 'Movie', year: 2020, reason: '理由' },
      ]);
      mockResolveRecommendations.mockResolvedValueOnce([
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      const result = await executeGenerateRecommendationsCron(mockSupabase);

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.data.processed_users).toBe(1);
        expect(result.data.total_recommendations).toBe(1);
      }

      expect(console.log).toHaveBeenCalledWith(
        'Processing batch 1/1... (1 users)',
      );
      expect(console.log).toHaveBeenCalledWith(
        'Completed batch 1/1: 1 success, 0 failed',
      );
    });

    it('非アクティブユーザー数が正しくカウントされる', async () => {
      mockFavoritesUserQuery(['user-1', 'user-2', 'user-3']);
      mockActiveUsersQuery(['user-1']);
      // user-1の処理
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);
      mockSelectExistingRecommendations([]);
      mockDeleteRecommendations(true);
      mockInsertRecommendations(true);

      mockFetchRecommendations.mockResolvedValueOnce([
        { title: 'Movie', year: 2020, reason: '理由' },
      ]);
      mockResolveRecommendations.mockResolvedValueOnce([
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      const result = await executeGenerateRecommendationsCron(mockSupabase);

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.data.inactive_users).toBe(2);
      }
    });
  });
});
