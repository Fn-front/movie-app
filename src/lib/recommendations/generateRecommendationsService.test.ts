/**
 * @jest-environment node
 */

/**
 * レコメンド生成サービス テスト
 * バッチ処理ロジック・並行数制限の検証
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_INITIAL_HIT_RATE,
  RECOMMENDATIONS_MIN_HIT_RATE,
  RECOMMENDATIONS_MAX_REQUEST_COUNT,
  RECOMMENDATIONS_BATCH_SIZE,
} from '@/constants';

import {
  calculateRequestCount,
  executeGenerateRecommendationsCron,
  fetchActiveUserIds,
  collectUserMovieData,
  generateRecommendationsWithRetry,
  upsertRecommendations,
  processUserRecommendations,
} from './generateRecommendationsService';

// --- Mocks ---

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockSupabase = {
  from: mockFrom,
  rpc: mockRpc,
} as unknown as SupabaseClient;

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

/** upsert_recommendations RPC のモック */
const mockUpsertRecommendationsRpc = (success: boolean) => {
  mockRpc.mockResolvedValueOnce({
    data: success ? 1 : null,
    error: success ? null : new Error('RPC failed'),
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

  describe('RECOMMENDATIONS_BATCH_SIZE', () => {
    it('バッチサイズが5であること', () => {
      expect(RECOMMENDATIONS_BATCH_SIZE).toBe(5);
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
      // プロンプトに渡すのはウォッチリストのみ（お気に入り・興味なしは専用セクションで渡す）
      expect(result!.watchlistTitles).toEqual(['映画B']);
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
    /** display_order を埋めた解決済みレコメンドを生成 */
    const buildResolved = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        tmdb_movie_id: i + 1,
        title: `Movie ${i + 1}`,
        poster_path: null,
        release_date: null,
        vote_average: null,
        vote_count: 0,
        genre_ids: null,
        reason: `理由${i + 1}`,
        display_order: i + 1,
      }));

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

    it('初回は必要数＋バッファ件をAIに要求する', async () => {
      mockFetchRecommendations.mockResolvedValueOnce(
        Array.from({ length: RECOMMENDATIONS_MAX_COUNT }, (_, i) => ({
          title: `Movie ${i + 1}`,
          year: 2020,
          reason: `理由${i + 1}`,
        })),
      );
      // 初回で最大件数を解決 → リトライせず終了
      mockResolveRecommendations.mockResolvedValueOnce(
        buildResolved(RECOMMENDATIONS_MAX_COUNT),
      );

      await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      // 第3引数（要求件数）が 必要件数 ÷ 想定採用率 であること
      expect(mockFetchRecommendations.mock.calls[0][2]).toBe(
        Math.ceil(RECOMMENDATIONS_MAX_COUNT / RECOMMENDATIONS_INITIAL_HIT_RATE),
      );
    });

    it('必要件数より多く解決されても最大件数で丸める', async () => {
      mockFetchRecommendations.mockResolvedValueOnce(
        Array.from({ length: RECOMMENDATIONS_MAX_COUNT + 2 }, (_, i) => ({
          title: `Movie ${i + 1}`,
          year: 2020,
          reason: `理由${i + 1}`,
        })),
      );
      // 解決ロジックが多めに12件返しても、累積は10件で打ち切る
      mockResolveRecommendations.mockResolvedValueOnce(
        buildResolved(RECOMMENDATIONS_MAX_COUNT + 2),
      );

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      expect(result).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
      expect(result[result.length - 1].display_order).toBe(
        RECOMMENDATIONS_MAX_COUNT,
      );
    });

    it('初回で不足した場合、実測した採用率で割り戻した件数でリトライする', async () => {
      // 初回: 9件解決（1件不足）
      mockFetchRecommendations
        .mockResolvedValueOnce(
          Array.from({ length: RECOMMENDATIONS_MAX_COUNT }, (_, i) => ({
            title: `Movie ${i + 1}`,
            year: 2020,
            reason: `理由${i + 1}`,
          })),
        )
        .mockResolvedValueOnce([
          { title: 'Extra', year: 2021, reason: '追加理由' },
        ]);
      mockResolveRecommendations
        .mockResolvedValueOnce(buildResolved(RECOMMENDATIONS_MAX_COUNT - 1))
        .mockResolvedValueOnce([
          {
            tmdb_movie_id: 999,
            title: 'Extra',
            poster_path: null,
            release_date: null,
            vote_average: null,
            vote_count: 0,
            genre_ids: null,
            reason: '追加理由',
            display_order: 1,
          },
        ]);

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      expect(result).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
      // AIが10件返して9件採用 → 採用率0.9。不足1件を0.9で割り戻して2件要求する
      expect(mockFetchRecommendations.mock.calls[1][2]).toBe(2);
    });

    it('採用率が低かった場合、次の試行でより多く要求する', async () => {
      // 初回: AIが20件返して2件しか採用できない（採用率0.1 → 下限0.3が効く）
      mockFetchRecommendations
        .mockResolvedValueOnce(
          Array.from({ length: 20 }, (_, i) => ({
            title_ja: `映画${i + 1}`,
            title_en: `Movie ${i + 1}`,
            year: 2020,
            reason: `理由${i + 1}`,
          })),
        )
        .mockResolvedValueOnce([]);
      mockResolveRecommendations
        .mockResolvedValueOnce(buildResolved(2))
        .mockResolvedValueOnce([]);

      await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      // 不足8件 ÷ 下限採用率0.3 = 27件
      expect(mockFetchRecommendations.mock.calls[1][2]).toBe(
        Math.ceil(
          (RECOMMENDATIONS_MAX_COUNT - 2) / RECOMMENDATIONS_MIN_HIT_RATE,
        ),
      );
    });

    it('必要件数に届かないまま試行が尽きても、部分結果を返す', async () => {
      // 初回で3件だけ解決でき、以降のリトライは1件も解決できない
      const aiItem = {
        title_ja: '邦題',
        title_en: 'Title',
        year: 2020,
        reason: '理由',
      };
      mockFetchRecommendations
        .mockResolvedValueOnce([aiItem])
        .mockResolvedValueOnce([aiItem])
        .mockResolvedValueOnce([aiItem]);
      mockResolveRecommendations
        .mockResolvedValueOnce(buildResolved(3))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      expect(result).toHaveLength(3);
      expect(result[2].display_order).toBe(3);
    });
  });

  describe('calculateRequestCount', () => {
    it('初回は必要件数を想定採用率で割り戻す', () => {
      expect(calculateRequestCount(RECOMMENDATIONS_MAX_COUNT)).toBe(
        Math.ceil(RECOMMENDATIONS_MAX_COUNT / RECOMMENDATIONS_INITIAL_HIT_RATE),
      );
    });

    it('直前の採用率が高ければ要求件数を抑える', () => {
      expect(calculateRequestCount(10, 1)).toBe(10);
    });

    it('直前の採用率が低ければ要求件数を増やす', () => {
      expect(calculateRequestCount(10, 0.5)).toBe(20);
    });

    it('採用率が下限を下回っても下限で頭打ちにする', () => {
      expect(calculateRequestCount(5, 0.01)).toBe(
        Math.ceil(5 / RECOMMENDATIONS_MIN_HIT_RATE),
      );
    });

    it('採用率0（1件も採用できなかった）でも下限で頭打ちにする', () => {
      expect(calculateRequestCount(5, 0)).toBe(
        Math.ceil(5 / RECOMMENDATIONS_MIN_HIT_RATE),
      );
    });

    it('要求件数の上限を超えない', () => {
      expect(calculateRequestCount(RECOMMENDATIONS_MAX_COUNT, 0)).toBe(
        RECOMMENDATIONS_MAX_REQUEST_COUNT,
      );
    });
  });

  describe('upsertRecommendations', () => {
    /** RPCに渡されたペイロードを取り出す */
    const rpcPayload = () => mockRpc.mock.calls[0][1];

    const sampleResolved = {
      tmdb_movie_id: 100,
      title: 'Movie',
      poster_path: null,
      release_date: null,
      vote_average: 7.5,
      vote_count: 4321,
      genre_ids: [28, 12],
      reason: '理由',
      display_order: 1,
    };

    it('DELETE→INSERTではなくupsert_recommendations RPCを1回呼ぶ', async () => {
      mockUpsertRecommendationsRpc(true);

      const result = await upsertRecommendations(mockSupabase, 'user-1', [
        sampleResolved,
      ]);

      expect(result).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc.mock.calls[0][0]).toBe('upsert_recommendations');
      // 非トランザクショナルな from().delete() / from().insert() は使わない
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('user_idとレコメンド配列をRPCに渡す', async () => {
      mockUpsertRecommendationsRpc(true);

      await upsertRecommendations(mockSupabase, 'user-1', [sampleResolved]);

      expect(rpcPayload().p_user_id).toBe('user-1');
      expect(rpcPayload().p_recommendations).toEqual([
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: 7.5,
          vote_count: 4321,
          genre_ids: [28, 12],
          reason: '理由',
          display_order: 1,
        },
      ]);
    });

    it('レコメンドが0件でもRPCを呼ぶ（全件削除として機能する）', async () => {
      mockUpsertRecommendationsRpc(true);

      const result = await upsertRecommendations(mockSupabase, 'user-1', []);

      expect(result).toBe(true);
      expect(rpcPayload().p_recommendations).toEqual([]);
    });

    it('RPC失敗でfalseを返す', async () => {
      mockUpsertRecommendationsRpc(false);

      const result = await upsertRecommendations(mockSupabase, 'user-1', [
        sampleResolved,
      ]);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('processUserRecommendations', () => {
    it('正常処理でprocessedを返す', async () => {
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);
      mockUpsertRecommendationsRpc(true);

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
          vote_count: 0,
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

    it('signalを下位の生成処理に伝播する', async () => {
      const controller = new AbortController();

      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);
      mockUpsertRecommendationsRpc(true);

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
          vote_count: 0,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      await processUserRecommendations(
        mockSupabase,
        'user-1',
        controller.signal,
      );

      // OpenAI: 第5引数、TMDb解決: 第4引数として signal が渡る
      expect(mockFetchRecommendations.mock.calls[0][4]).toBe(controller.signal);
      expect(mockResolveRecommendations.mock.calls[0][3]).toBe(
        controller.signal,
      );
    });

    it('中断済みの場合、OpenAIを呼ばずDBも書き換えない', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      const result = await processUserRecommendations(
        mockSupabase,
        'user-1',
        controller.signal,
      );

      expect(result.status).toBe('skipped');
      expect(mockFetchRecommendations).not.toHaveBeenCalled();
      // DELETE済みで中断、の状態を作らない（RPCを呼ばないので既存レコメンドは保持）
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('生成後に中断された場合、DBを書き換えず既存レコメンドを保持する', async () => {
      const controller = new AbortController();

      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      mockFetchRecommendations.mockImplementationOnce(async () => {
        // OpenAI 応答中にクライアントが離脱したケース
        controller.abort();
        return [{ title: 'Movie', year: 2020, reason: '理由' }];
      });
      mockResolveRecommendations.mockResolvedValueOnce([
        {
          tmdb_movie_id: 100,
          title: 'Movie',
          poster_path: null,
          release_date: null,
          vote_average: null,
          vote_count: 0,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);

      const result = await processUserRecommendations(
        mockSupabase,
        'user-1',
        controller.signal,
      );

      expect(result.status).toBe('skipped');
      expect(mockRpc).not.toHaveBeenCalled();
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
      mockUpsertRecommendationsRpc(true);

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
          vote_count: 0,
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
      mockUpsertRecommendationsRpc(true);

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
          vote_count: 0,
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
