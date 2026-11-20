/**
 * @jest-environment node
 */

/**
 * レコメンド生成サービス テスト
 * バッチ処理ロジック・並行数制限の検証
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  FAVORITES_LOOKUP_MAX_PAGES,
  FAVORITES_LOOKUP_PAGE_SIZE,
} from '@/constants/favorites';

import {
  OPENAI_CONFIG,
  RECOMMENDATIONS_DIVERSITY_POOL_EXTRA,
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_INITIAL_HIT_RATE,
  RECOMMENDATIONS_MIN_HIT_RATE,
  RECOMMENDATIONS_MAX_REQUEST_COUNT,
  RECOMMENDATION_EVENT_RETENTION_DAYS,
  RECOMMENDATIONS_BATCH_SIZE,
} from '@/constants';

import {
  calculateRequestCount,
  deleteExpiredRecommendationEvents,
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

/**
 * ページングで読む取得のモック（#1318）
 *
 * `.order().range()` を通るようになったので、チェーンの末端を range にする。
 * `range` の呼び出しを数えて、ページングを外したときに検知できるようにする
 */
const rangeSpy = jest.fn();
const orderSpy = jest.fn();

const mockPagedQuery = (rows: unknown[], error: unknown = null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => ({
          order: (column: string, opts?: { ascending?: boolean }) => {
            orderSpy(column, opts);
            return {
              range: (from: number, to: number) => {
                rangeSpy(from, to);
                return Promise.resolve({ data: error ? null : rows, error });
              },
            };
          },
        }),
      }),
    }),
  });
};

/** お気に入り映画取得のモック */
const mockFavoritesQuery = (
  favorites: { tmdb_movie_id: number; title: string; rating: number }[],
) => mockPagedQuery(favorites);

/** ウォッチリスト取得のモック */
const mockWatchlistQuery = (
  items: { tmdb_movie_id: number; title: string }[],
) => mockPagedQuery(items);

/** 興味なし映画取得のモック */
const mockDismissedMoviesQuery = (
  items: {
    tmdb_movie_id: number;
    title: string;
    genre_ids: number[] | null;
  }[] = [],
) => mockPagedQuery(items);

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
    beforeEach(() => {
      rangeSpy.mockClear();
      orderSpy.mockClear();
    });

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

    /**
     * 1000件で静かに打ち切られない（#1318）
     *
     * PostgREST は `max_rows` を超えた結果をエラーも truncation フラグも
     * 返さずに打ち切る。除外集合が欠けると、既に登録済みの作品が
     * レコメンドに出る
     */
    it('お気に入りがちょうど1ページぶんなら次のページも読む', async () => {
      const full = Array.from(
        { length: FAVORITES_LOOKUP_PAGE_SIZE },
        (_, i) => ({
          tmdb_movie_id: i + 1,
          title: `映画${i + 1}`,
          rating: 8,
        }),
      );

      mockPagedQuery(full);
      mockPagedQuery([{ tmdb_movie_id: 99999, title: '最後', rating: 7 }]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      const result = await collectUserMovieData(mockSupabase, 'user-1');

      expect(result!.favoriteMovies).toHaveLength(
        FAVORITES_LOOKUP_PAGE_SIZE + 1,
      );
      expect(result!.baseExcludedIds.has(99999)).toBe(true);
    });

    // 3本とも range を通ること（1本でも素の全件読みに戻すと落ちる）
    it('3本とも range で区切って読む', async () => {
      mockFavoritesQuery([{ tmdb_movie_id: 1, title: '映画A', rating: 8 }]);
      mockWatchlistQuery([{ tmdb_movie_id: 2, title: '映画B' }]);
      mockDismissedMoviesQuery([
        { tmdb_movie_id: 3, title: '映画C', genre_ids: [27] },
      ]);

      await collectUserMovieData(mockSupabase, 'user-1');

      expect(rangeSpy).toHaveBeenCalledTimes(3);
      // ⚠️ 引数まで見る。回数だけだと range(0, 0) でも通ってしまい、
      // ページサイズの取り違えを検知できない
      expect(rangeSpy).toHaveBeenCalledWith(0, FAVORITES_LOOKUP_PAGE_SIZE - 1);
    });

    /**
     * 並びが不定だとページ間で行が重複・欠落する
     *
     * ⚠️ favorites が0件だと `collectUserMovieData` はそこで return するので、
     * 1件返して3本とも通す。`mockReturnValue`（Once でない）も使わない
     * ——`clearAllMocks` では既定戻り値が消えず、以降のテストで
     * 「モックし忘れ」が静かに通るようになる
     */
    it('3本とも安定した並び（id 昇順）を指定する', async () => {
      mockFavoritesQuery([{ tmdb_movie_id: 1, title: '映画A', rating: 8 }]);
      mockWatchlistQuery([{ tmdb_movie_id: 2, title: '映画B' }]);
      mockDismissedMoviesQuery([
        { tmdb_movie_id: 3, title: '映画C', genre_ids: [27] },
      ]);

      await collectUserMovieData(mockSupabase, 'user-1');

      expect(orderSpy).toHaveBeenCalledTimes(3);
      for (let i = 1; i <= 3; i += 1) {
        expect(orderSpy).toHaveBeenNthCalledWith(i, 'id', { ascending: true });
      }
    });

    /**
     * ⚠️ お気に入りだけは取得失敗を握らない
     *
     * 0件と区別できないまま進むと「お気に入りが無いので生成しない」と
     * 同じ扱いになり、実際には持っている利用者のレコメンドが黙って
     * 作られなくなる
     */
    /**
     * ⛔ **`null` を返さない（#1354）。**
     *
     * 0件と同じ戻り値にすると呼び出し側が「対象外」と区別できず、
     * CRON の通知が数える `failed` に乗らない。DBエラーで全員ぶん
     * 生成できなくても無言になる。
     */
    it('お気に入りの取得に失敗したら投げてログに残す', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        mockPagedQuery([], { message: 'boom' });

        // ⚠️ PostgREST のエラーは `Error` ではなくプレーンなオブジェクト。
        //    `rejects.toThrow()` は中身を見ないまま「投げていない」と判定する
        await expect(
          collectUserMovieData(mockSupabase, 'user-1'),
        ).rejects.toMatchObject({ message: 'boom' });

        expect(errorSpy).toHaveBeenCalledWith(
          'Favorites query error:',
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    // ウォッチリスト・興味なしは従来どおり空として扱う（除外が甘くなるだけ）
    it('ウォッチリストの取得に失敗しても生成は続ける', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        mockFavoritesQuery([{ tmdb_movie_id: 1, title: '映画A', rating: 8 }]);
        mockPagedQuery([], { message: 'boom' });
        mockDismissedMoviesQuery([]);

        const result = await collectUserMovieData(mockSupabase, 'user-1');

        expect(result).not.toBeNull();
        expect(result!.watchlistTitles).toEqual([]);
        expect(errorSpy).toHaveBeenCalledWith(
          'Watchlist query error:',
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    // 上限到達は黙って切らず、誰で起きたかを残す
    it('読み取り上限に達したら user 付きで警告する', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const full = Array.from(
          { length: FAVORITES_LOOKUP_PAGE_SIZE },
          (_, i) => ({
            tmdb_movie_id: i + 1,
            title: `映画${i + 1}`,
            rating: 8,
          }),
        );

        for (let i = 0; i < FAVORITES_LOOKUP_MAX_PAGES; i += 1) {
          mockPagedQuery(full);
        }
        mockWatchlistQuery([]);
        mockDismissedMoviesQuery([]);

        await collectUserMovieData(mockSupabase, 'user-1');

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('user=user-1'),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('recommendations-favorites'),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('お気に入り0件でnullを返す', async () => {
      mockPagedQuery([]);

      const result = await collectUserMovieData(mockSupabase, 'user-1');

      expect(result).toBeNull();
    });

    // ⚠️ 旧チェーン（`is` 止まり）のままだと TypeError で null になり、
    // 「DBエラーで null」を検証したことにならない（#1318 のレビュー指摘）
    it('お気に入り取得エラーは投げる', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        mockPagedQuery([], { message: 'err' });

        await expect(
          collectUserMovieData(mockSupabase, 'user-1'),
        ).rejects.toMatchObject({ message: 'err' });

        expect(errorSpy).toHaveBeenCalledWith(
          'Favorites query error:',
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    /**
     * ⚠️ 握るのは PostgREST が返したエラーだけ（#1318 のレビュー指摘）
     *
     * 全部握ると、空の除外集合のまま生成を続けて upsert_recommendations が
     * 洗い替えるため、劣化した内容で既存のレコメンドを上書きする
     */
    it('ウォッチリストが例外で落ちたら投げ直す', async () => {
      mockFavoritesQuery([{ tmdb_movie_id: 1, title: '映画A', rating: 8 }]);
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                range: () => Promise.reject(new Error('network down')),
              }),
            }),
          }),
        }),
      });

      await expect(
        collectUserMovieData(mockSupabase, 'user-1'),
      ).rejects.toThrow('network down');
    });

    // 興味なし側も空として続ける（ウォッチリストと同じ扱い）
    it('興味なしの取得に失敗しても生成は続ける', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        mockFavoritesQuery([{ tmdb_movie_id: 1, title: '映画A', rating: 8 }]);
        mockWatchlistQuery([]);
        mockPagedQuery([], { message: 'boom' });

        const result = await collectUserMovieData(mockSupabase, 'user-1');

        expect(result).not.toBeNull();
        expect(result!.dismissedMovies).toEqual([]);
        expect(errorSpy).toHaveBeenCalledWith(
          'Dismissed movies query error:',
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
      }
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

      expect(result.resolved).toEqual([]);
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

      expect(result.resolved).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
      expect(result.resolved[result.resolved.length - 1].display_order).toBe(
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

      expect(result.resolved).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
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

      expect(result.resolved).toHaveLength(3);
      expect(result.resolved[2].display_order).toBe(3);
    });
  });

  describe('リトライ戦略と多様性リランキング', () => {
    /** 全件同一ジャンルのAI候補とTMDb解決結果を用意する */
    const mockAttempt = (count: number, genreId: number) => {
      mockFetchRecommendations.mockResolvedValueOnce(
        Array.from({ length: count }, (_, i) => ({
          title_ja: `映画${i + 1}`,
          title_en: `Movie ${i + 1}`,
          year: 2020,
          reason: `理由${i + 1}`,
        })),
      );
      mockResolveRecommendations.mockResolvedValueOnce(
        Array.from({ length: count }, (_, i) => ({
          ...buildResolved(1)[0],
          tmdb_movie_id: i + 1,
          title: `Movie ${i + 1}`,
          genre_ids: [genreId],
        })),
      );
    };

    it('初回は基準temperature・追加指示なしで呼ぶ', async () => {
      mockAttempt(RECOMMENDATIONS_MAX_COUNT, 28);

      await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      expect(mockFetchRecommendations.mock.calls[0][5]).toEqual({
        temperature: OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE,
        hint: null,
      });
    });

    it('リトライでは温度を上げ、方向を変える指示を付けて呼ぶ', async () => {
      // 初回は5件しか解決できず不足 → リトライ
      mockAttempt(5, 28);
      mockAttempt(5, 18);

      await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      const retryStrategy = mockFetchRecommendations.mock.calls[1][5];
      expect(retryStrategy.temperature).toBeGreaterThan(
        OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE,
      );
      expect(retryStrategy.hint).toContain('異なるジャンル');
    });

    it('リランキングの入れ替え先を作るため、必要数より多く解決を要求する', async () => {
      mockAttempt(RECOMMENDATIONS_MAX_COUNT, 28);

      await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      // 第3引数が「必要件数 + 多様性プール分」
      expect(mockResolveRecommendations.mock.calls[0][2]).toBe(
        RECOMMENDATIONS_MAX_COUNT + RECOMMENDATIONS_DIVERSITY_POOL_EXTRA,
      );
    });

    it('同一ジャンルに偏った候補でも、他ジャンルを先に採用する', async () => {
      // アクション10件のあとにドラマ5件を解決できたケース
      mockFetchRecommendations.mockResolvedValueOnce(
        Array.from({ length: 15 }, (_, i) => ({
          title_ja: `映画${i + 1}`,
          title_en: `Movie ${i + 1}`,
          year: 2020,
          reason: `理由${i + 1}`,
        })),
      );
      mockResolveRecommendations.mockResolvedValueOnce(
        Array.from({ length: 15 }, (_, i) => ({
          ...buildResolved(1)[0],
          tmdb_movie_id: i + 1,
          title: `Movie ${i + 1}`,
          genre_ids: [i < 10 ? 28 : 18],
        })),
      );

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      const dramaCount = result.resolved.filter(
        (r) => r.genre_ids?.[0] === 18,
      ).length;

      expect(result.resolved).toHaveLength(RECOMMENDATIONS_MAX_COUNT);
      // リランキング前は先頭10件がすべてアクションだった。
      // 各ジャンルを上限4件までに抑えた結果、後方のドラマが4件繰り上がり、
      // 残り2枠は保留したアクションで埋まる（件数は減らさない）
      expect(dramaCount).toBe(4);
    });
  });

  describe('生成メトリクス', () => {
    it('OpenAI呼び出し回数・候補数・未採用数・リトライ回数を記録する', async () => {
      // 初回: AIが10件返して9件採用 → 1件不足でリトライ
      mockFetchRecommendations
        .mockResolvedValueOnce(
          Array.from({ length: RECOMMENDATIONS_MAX_COUNT }, (_, i) => ({
            title_ja: `映画${i + 1}`,
            title_en: `Movie ${i + 1}`,
            year: 2020,
            reason: `理由${i + 1}`,
          })),
        )
        .mockResolvedValueOnce([
          {
            title_ja: '追加',
            title_en: 'Extra',
            year: 2021,
            reason: '追加理由',
          },
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

      expect(result.metrics).toEqual({
        openai_calls: 2,
        ai_candidates: RECOMMENDATIONS_MAX_COUNT + 1,
        unresolved_candidates: 1,
        retries_used: 1,
      });
    });

    it('1回で揃った場合はリトライ回数0', async () => {
      mockFetchRecommendations.mockResolvedValueOnce(
        Array.from({ length: RECOMMENDATIONS_MAX_COUNT }, (_, i) => ({
          title_ja: `映画${i + 1}`,
          title_en: `Movie ${i + 1}`,
          year: 2020,
          reason: `理由${i + 1}`,
        })),
      );
      mockResolveRecommendations.mockResolvedValueOnce(
        buildResolved(RECOMMENDATIONS_MAX_COUNT),
      );

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      expect(result.metrics.retries_used).toBe(0);
      expect(result.metrics.openai_calls).toBe(1);
      expect(result.metrics.unresolved_candidates).toBe(0);
    });

    it('OpenAIが失敗した呼び出しも回数に数える', async () => {
      mockFetchRecommendations.mockResolvedValueOnce(null);

      const result = await generateRecommendationsWithRetry(
        [{ title: 'Fav', rating: 8 }],
        [],
        new Set(),
        [],
      );

      expect(result.metrics.openai_calls).toBe(1);
      expect(result.metrics.ai_candidates).toBe(0);
    });
  });

  describe('deleteExpiredRecommendationEvents', () => {
    it('削除件数を返す', async () => {
      mockRpc.mockResolvedValueOnce({ data: 42, error: null });

      const result = await deleteExpiredRecommendationEvents(mockSupabase);

      expect(result).toBe(42);
      expect(mockRpc).toHaveBeenCalledWith(
        'delete_expired_recommendation_events',
        { retention_days: RECOMMENDATION_EVENT_RETENTION_DAYS },
      );
    });

    it('RPCがエラーを返しても0を返して続行する', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('RPC failed'),
      });

      const result = await deleteExpiredRecommendationEvents(mockSupabase);

      expect(result).toBe(0);
    });

    it('RPCが例外を投げても0を返して続行する', async () => {
      // 掃除処理でCRON全体を落とさない
      mockRpc.mockRejectedValueOnce(new Error('network'));

      const result = await deleteExpiredRecommendationEvents(mockSupabase);

      expect(result).toBe(0);
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

    // ⚠️ 旧チェーンのままだと TypeError で skipped になり、
    // 「お気に入り0件で skipped」を検証したことにならない
    it('映画データなしでskippedを返す', async () => {
      mockPagedQuery([]);

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

    /**
     * ⚠️ **`fetchRecommendationsFromOpenAI` は throw しない。**
     *
     * キー未設定も HTTPエラーも JSON 破損もスキーマ違反も `null` を返す。
     * これを「候補が0件」と同じ `skipped` にしていたため、**鍵が失効しても
     * CRON の通知に一切乗らなかった**（#1354）。
     */
    it('OpenAI の呼び出しが失敗したら failed を返す', async () => {
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      mockFetchRecommendations.mockResolvedValueOnce(null);

      const result = await processUserRecommendations(mockSupabase, 'user-1');

      expect(result.status).toBe('failed');
    });

    /**
     * ⚠️ こちらは失敗ではない。候補が1件も残らないのは利用者の嗜好しだいで
     * 普通に起きる（全部が既視聴・興味なしだった等）。
     */
    it('候補が0件なら skipped を返す', async () => {
      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      mockFetchRecommendations.mockResolvedValue([
        { title: 'Arrival', year: 2016, reason: 'SF好きに' },
      ]);
      mockResolveRecommendations.mockResolvedValue([]);

      const result = await processUserRecommendations(mockSupabase, 'user-1');

      expect(result.status).toBe('skipped');
    });

    /**
     * ⚠️ 書き込みの失敗は**失敗**。利用者の事情では起きない。
     */
    it('洗い替えRPCが失敗したら failed を返す', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockFavoritesQuery([
        { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
      ]);
      mockWatchlistQuery([]);
      mockDismissedMoviesQuery([]);

      mockFetchRecommendations.mockResolvedValue([
        { title: 'Arrival', year: 2016, reason: 'SF好きに' },
      ]);
      mockResolveRecommendations.mockResolvedValue([
        {
          tmdb_movie_id: 100,
          title: 'メッセージ',
          poster_path: null,
          release_date: '2016-11-11',
          vote_average: 7.9,
          genre_ids: [878],
          reason: 'SF好きに',
          display_order: 1,
        },
      ]);
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });

      const result = await processUserRecommendations(mockSupabase, 'user-1');

      expect(result.status).toBe('failed');

      errorSpy.mockRestore();
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
      // バッチ処理のログは出さない（メトリクスのサマリーのみ）
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Processing batch'),
      );
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
