/**
 * @jest-environment node
 */

/**
 * 配信作品同期ロジック テスト
 */

import {
  CONCERT_KEYWORD_IDS,
  DISCOVER_API_MAX_PAGES,
  DOCUMENTARY_GENRE_ID,
  MIN_POPULARITY,
  MIN_VOTE_AVERAGE,
  MUSIC_GENRE_ID,
  STREAMING_MIN_POPULARITY,
} from '@/constants/movies';
import { TMDB_AVAILABILITY_CONCURRENCY } from '@/constants/tmdb';

import { syncStreamingMovies } from './syncStreamingMovies';

// --- Mocks ---

const mockDiscoverMovies = jest.fn();
const mockGetJpStreamingAvailability = jest.fn();
const mockGetMovieKeywordIds = jest.fn().mockResolvedValue([]);
jest.mock('@/lib/tmdb/tmdb', () => ({
  getMovieKeywordIds: (...args: unknown[]) => mockGetMovieKeywordIds(...args),
  discoverMovies: (params: Record<string, unknown>) =>
    mockDiscoverMovies(params),
  getJpStreamingAvailability: (movieId: number) =>
    mockGetJpStreamingAvailability(movieId),
}));

const mockUpsert = jest.fn();
const mockNeq = jest.fn();
const mockUpdate = jest.fn();
const mockClearNotIn = jest.fn();

/** クリアクエリ（.update().eq().eq().not().select()）の解決値 */
let clearResult: {
  data: { id: number }[] | null;
  error: { message: string } | null;
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ neq: (...args: unknown[]) => mockNeq(...args) }),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        // .eq().eq().not().select() のチェインを辿れるようにする
        const chain = {
          eq: () => chain,
          not: (...notArgs: unknown[]) => {
            mockClearNotIn(...notArgs);
            return chain;
          },
          select: () => Promise.resolve(clearResult),
        };
        return chain;
      },
    }),
  }),
}));

// --- Helpers ---

/** TMDb Discover のレスポンス映画を生成 */
const createMovie = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Streaming Movie',
  adult: false,
  original_language: 'ja',
  genre_ids: [28],
  vote_average: 7.0,
  vote_count: 500,
  popularity: 50,
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  release_date: '2026-03-01',
  overview: '概要',
  ...overrides,
});

/** 全ページ分のレスポンスを1件ずつ返す */
const respondWith = (movies: Record<string, unknown>[], totalPages = 1) => ({
  results: movies,
  total_pages: totalPages,
});

/** JP配信実態のレスポンスを生成 */
const availability = (
  isCurrentlyStreaming: boolean,
  digitalReleaseDate: string | null = null,
) => ({ isCurrentlyStreaming, digitalReleaseDate });

// --- Tests ---

describe('syncStreamingMovies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    };
    mockNeq.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockResolvedValue({ error: null });
    clearResult = { data: [], error: null };
    mockDiscoverMovies.mockResolvedValue(respondWith([createMovie()]));
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability(true, '2026-03-10'),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('環境変数チェック', () => {
    it('NEXT_PUBLIC_SUPABASE_URLが未設定の場合エラーをスローする', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      await expect(syncStreamingMovies()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });

    it('SUPABASE_SERVICE_ROLE_KEYが未設定の場合エラーをスローする', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(syncStreamingMovies()).rejects.toThrow(
        'Supabase環境変数が設定されていません',
      );
    });
  });

  describe('Discover APIの呼び出し', () => {
    it('streamingのrelease_typeとpopularity順で取得する', async () => {
      await syncStreamingMovies();

      const params = mockDiscoverMovies.mock.calls[0][0];
      expect(params.with_release_type).toBe('4');
      expect(params.sort_by).toBe('popularity.desc');
    });

    it('upcomingとnow_showingの両方の日付範囲を事前生成する', async () => {
      await syncStreamingMovies();

      // total_pages=1 なので time_frame ごとに1回ずつ
      expect(mockDiscoverMovies).toHaveBeenCalledTimes(2);

      const first = mockDiscoverMovies.mock.calls[0][0];
      const second = mockDiscoverMovies.mock.calls[1][0];

      // upcoming: 今日 〜 未来
      expect(first['release_date.gte'] <= first['release_date.lte']).toBe(true);
      // now_showing: 過去 〜 今日
      expect(second['release_date.gte'] <= second['release_date.lte']).toBe(
        true,
      );
      // upcoming の下限 = now_showing の上限 = 今日
      expect(first['release_date.gte']).toBe(second['release_date.lte']);
    });

    it('ページ数の上限を超えて取得しない', async () => {
      // total_pagesを大きくしても上限ページまでで打ち切る
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie()], DISCOVER_API_MAX_PAGES + 10),
      );

      const result = await syncStreamingMovies();

      // 2つの time_frame × 上限ページ
      expect(mockDiscoverMovies).toHaveBeenCalledTimes(
        DISCOVER_API_MAX_PAGES * 2,
      );
      // Discover の呼び出し + 配信実態チェック（重複排除後1件）
      expect(result.tmdbRequests).toBe(DISCOVER_API_MAX_PAGES * 2 + 1);
    });

    it('結果が0件のページでループを打ち切る', async () => {
      mockDiscoverMovies.mockResolvedValue(respondWith([], 5));

      await syncStreamingMovies();

      // time_frame ごとに1回ずつで打ち切り
      expect(mockDiscoverMovies).toHaveBeenCalledTimes(2);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('両方のtime_frameに現れた映画は1件に重複排除する', async () => {
      // 既定のモックは両 time_frame で同じ id=1 を返す
      const result = await syncStreamingMovies();

      expect(result.fetched).toBe(2);
      expect(mockGetJpStreamingAvailability).toHaveBeenCalledTimes(1);
      expect(result.upserted).toBe(1);
    });
  });

  describe('フィルタリング', () => {
    it('adultコンテンツを除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ adult: true })]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(2);
      expect(result.upserted).toBe(0);
    });

    it('許可されていない言語を除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ original_language: 'xx' })]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(2);
    });

    it('韓国語・中国語・タイ語は除外しない', async () => {
      for (const language of ['ko', 'zh', 'th']) {
        jest.clearAllMocks();
        mockUpsert.mockResolvedValue({ error: null });
        mockGetJpStreamingAvailability.mockResolvedValue(availability(true));
        mockDiscoverMovies.mockResolvedValue(
          respondWith([createMovie({ original_language: language })]),
        );

        const result = await syncStreamingMovies();

        expect(result.skipped).toBe(0);
        expect(result.upserted).toBe(1);
      }
    });

    it('ライブ興行作品を除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({
            genre_ids: [MUSIC_GENRE_ID],
            title: 'RADWIMPS 20th ANNIVERSARY LIVE TOUR',
          }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      // 重複排除のあとに判定するため、2つの公開日範囲に現れても1件分だけ数える
      expect(result.skipped).toBe(1);
    });

    it('同じジャンル構成でも音楽ドキュメンタリーは除外しない', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      mockGetJpStreamingAvailability.mockResolvedValue(availability(true));
      mockGetMovieKeywordIds.mockResolvedValue([165194]); // music documentary
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({
            genre_ids: [MUSIC_GENRE_ID, DOCUMENTARY_GENRE_ID],
            title: 'オアシス：ドント・ルック・バック・イン・アンガー',
          }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(result.skipped).toBe(0);
      expect(result.upserted).toBe(1);
    });

    it('concert系キーワードを持つ作品を除外する', async () => {
      mockGetMovieKeywordIds.mockResolvedValue([CONCERT_KEYWORD_IDS[0]]);
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({
            genre_ids: [MUSIC_GENRE_ID, DOCUMENTARY_GENRE_ID],
            title: 'Queen Budapest',
          }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });

    it('ジャンル未設定の映画を除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ genre_ids: [] })]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(2);
    });

    it('最低評価スコア未満の映画を除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ vote_average: MIN_VOTE_AVERAGE - 0.1 })]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(2);
    });

    it('未評価（vote_average=0）の映画は除外しない', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ vote_average: 0 })]),
      );

      const result = await syncStreamingMovies();

      expect(result.upserted).toBe(1);
    });

    it('streaming用の緩い人気度閾値を使う（劇場用閾値未満でも残す）', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ popularity: MIN_POPULARITY - 0.1 })]),
      );

      const result = await syncStreamingMovies();

      expect(result.skipped).toBe(0);
      expect(result.upserted).toBe(1);
    });

    it('streaming用の人気度閾値未満の映画は除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({ popularity: STREAMING_MIN_POPULARITY - 0.01 }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(2);
    });
  });

  describe('JP配信実態の反映', () => {
    it('JP配信中の作品はis_currently_streaming=trueで保存する', async () => {
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability(true, '2026-03-10'),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert.mock.calls[0][0][0]).toMatchObject({
        is_currently_streaming: true,
        digital_release_date: '2026-03-10',
      });
      expect(result.availableInJp).toBe(1);
    });

    it('JP未配信の作品はis_currently_streaming=falseで保存する', async () => {
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability(false, '2026-06-01'),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert.mock.calls[0][0][0]).toMatchObject({
        is_currently_streaming: false,
        digital_release_date: '2026-06-01',
      });
      expect(result.availableInJp).toBe(0);
    });

    it('デジタル公開日が無ければnullで保存する', async () => {
      mockGetJpStreamingAvailability.mockResolvedValue(availability(true));

      await syncStreamingMovies();

      expect(mockUpsert.mock.calls[0][0][0].digital_release_date).toBeNull();
    });

    it('配信実態を取得できなかった作品はUPSERTせず既存値を保持する', async () => {
      mockGetJpStreamingAvailability.mockRejectedValue(
        new Error('TMDb unavailable'),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.upserted).toBe(0);
      expect(result.errors[0]).toContain('TMDb unavailable');
    });

    it('同時実行数を超える候補は分割して問い合わせる', async () => {
      const movies = Array.from(
        { length: TMDB_AVAILABILITY_CONCURRENCY + 3 },
        (_, index) => createMovie({ id: index + 1 }),
      );
      mockDiscoverMovies.mockResolvedValue(respondWith(movies));

      const result = await syncStreamingMovies();

      expect(mockGetJpStreamingAvailability).toHaveBeenCalledTimes(
        movies.length,
      );
      expect(result.upserted).toBe(movies.length);
    });
  });

  describe('配信終了フラグのクリア', () => {
    it('今回配信中と確認できた映画を保持対象にしてクリアする', async () => {
      clearResult = { data: [{ id: 99 }], error: null };

      const result = await syncStreamingMovies();

      expect(mockUpdate).toHaveBeenCalledWith({
        is_currently_streaming: false,
      });
      expect(mockClearNotIn).toHaveBeenCalledWith('id', 'in', '(1)');
      expect(result.cleared).toBe(1);
    });

    it('配信実態を取得できなかった映画はクリア対象から除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ id: 1 }), createMovie({ id: 2 })]),
      );
      mockGetJpStreamingAvailability.mockImplementation((movieId: number) =>
        movieId === 2
          ? Promise.reject(new Error('TMDb unavailable'))
          : Promise.resolve(availability(true)),
      );

      await syncStreamingMovies();

      // 判定できなかった id=2 も保持対象に含める
      expect(mockClearNotIn).toHaveBeenCalledWith('id', 'in', '(1,2)');
    });

    it('1件も配信中を確認できなければクリアしない（TMDb障害時の全消し防止）', async () => {
      mockGetJpStreamingAvailability.mockResolvedValue(availability(false));

      const result = await syncStreamingMovies();

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result.cleared).toBe(0);
    });

    it('クリア失敗をerrorsに記録する', async () => {
      clearResult = { data: null, error: { message: 'clear failed' } };

      const result = await syncStreamingMovies();

      expect(result.errors.some((e) => e.includes('clear failed'))).toBe(true);
    });
  });

  describe('別release_typeとの共存（相互排他の撤廃）', () => {
    it('theatrical として既に存在する映画でも除外せずUPSERTする', async () => {
      // 劇場公開作品としてキャッシュ済みの映画が配信化されたケース
      mockNeq.mockResolvedValue({ data: [{ id: 1 }], error: null });

      const result = await syncStreamingMovies();

      // PK は (id, release_type) のため共存でき、除外してはいけない
      expect(result.skipped).toBe(0);
      expect(result.upserted).toBe(1);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('別release_typeの既存ID取得クエリ（1000行制限の原因）を発行しない', async () => {
      await syncStreamingMovies();

      expect(mockNeq).not.toHaveBeenCalled();
    });
  });

  describe('UPSERT', () => {
    it('release_type=streamingでmovie_cacheに保存する', async () => {
      await syncStreamingMovies();

      const [rows, options] = mockUpsert.mock.calls[0];
      expect(options).toEqual({ onConflict: 'id,release_type' });
      expect(rows[0]).toMatchObject({
        id: 1,
        title: 'Streaming Movie',
        release_type: 'streaming',
        vote_average: 7.0,
        vote_count: 500,
        popularity: 50,
      });
      expect(rows[0].cached_at).toEqual(expect.any(String));
    });

    it('空のrelease_dateをnullに変換する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ release_date: '' })]),
      );

      await syncStreamingMovies();

      expect(mockUpsert.mock.calls[0][0][0].release_date).toBeNull();
    });

    it('UPSERT失敗をerrorsに記録し、処理を継続する', async () => {
      mockUpsert.mockResolvedValue({ error: { message: 'upsert failed' } });

      const result = await syncStreamingMovies();

      expect(result.errors[0]).toContain('upsert failed');
      expect(result.upserted).toBe(0);
    });
  });

  describe('エラー耐性とメトリクス', () => {
    it('TMDb取得失敗時は当該time_frameを打ち切り、次のtime_frameを処理する', async () => {
      mockDiscoverMovies
        .mockRejectedValueOnce(new Error('TMDb API error'))
        .mockResolvedValueOnce(respondWith([createMovie({ id: 2 })]));

      const result = await syncStreamingMovies();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('TMDb API error');
      // 2つ目の time_frame は処理される
      expect(result.upserted).toBe(1);
    });

    it('実行時間・TMDb呼び出し回数・件数のメトリクスを返す', async () => {
      const result = await syncStreamingMovies();

      expect(result.fetched).toBe(2);
      expect(result.upserted).toBe(1);
      expect(result.availableInJp).toBe(1);
      // Discover 2回 + 配信実態チェック1回
      expect(result.tmdbRequests).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });

    it('メトリクスをログ出力する', async () => {
      const logSpy = jest.spyOn(console, 'log');

      await syncStreamingMovies();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[sync-streaming]'),
      );
    });
  });
});
