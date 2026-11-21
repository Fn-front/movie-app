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
  STREAMING_AVAILABILITY_STALE_DAYS,
  STREAMING_MIN_POPULARITY,
  STREAMING_STALE_REFRESH_LIMIT,
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
const mockStaleLt = jest.fn();
const mockStaleOr = jest.fn();
const mockStaleOrder = jest.fn();
const mockStaleLimit = jest.fn();
/**
 * `.update().eq(...)` に渡された引数
 *
 * ⚠️ **引数を捨てないこと。** ここを `() => chain` にすると、実装から
 * `.eq('id', ...)` / `.eq('release_type', ...)` を**両方消してもテストが緑のまま**通る。
 * 実際には `movie_cache` 全行を1件の配信情報で塗り潰す破壊的な UPDATE になる。
 */
const mockUpdateEq = jest.fn();

/** クリアクエリ（.update().eq().eq().not().select()）の解決値 */
let clearResult: {
  data: { id: number }[] | null;
  error: { message: string } | null;
};

/** 古い配信情報の抽出（.select().lt().or().order().limit()）の解決値 */
let staleSelectResult: {
  data: { id: number; title: string; release_type: string }[] | null;
  error: { message: string } | null;
};

/** 古い配信情報の書き戻し（.update().eq().eq()）の解決値 */
let staleUpdateResult: { error: { message: string } | null };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      // ⚠️ `select` は2通りのチェインを受ける。
      //   既存: .select().neq()                       （未使用列のバックフィル）
      //   #433: .select().lt().or().order().limit()   （古い配信情報の抽出）
      select: () => {
        const chain = {
          neq: (...args: unknown[]) => mockNeq(...args),
          lt: (...args: unknown[]) => {
            mockStaleLt(...args);
            return chain;
          },
          or: (...args: unknown[]) => {
            mockStaleOr(...args);
            return chain;
          },
          order: (...args: unknown[]) => {
            mockStaleOrder(...args);
            return chain;
          },
          limit: (...args: unknown[]) => {
            mockStaleLimit(...args);
            return Promise.resolve(staleSelectResult);
          },
        };
        return chain;
      },
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (payload: Record<string, unknown>) => {
        mockUpdate(payload);

        // 配信情報の書き戻しは `.select()` を付けずに await する。
        // ⚠️ **PostgREST のビルダーは実物も thenable**（`.select()` を
        //    呼ばずに await できる）ので、モックも同じ性質を持たせる。
        //    付けないと await がビルダー自身に解決し、`error` が常に
        //    undefined になって失敗経路を素通りする
        const isStaleRefresh = 'watch_provider_flatrate' in payload;

        const chain = {
          eq: (...eqArgs: unknown[]) => {
            mockUpdateEq(...eqArgs);
            return chain;
          },
          not: (...notArgs: unknown[]) => {
            mockClearNotIn(...notArgs);
            return chain;
          },
          select: () => Promise.resolve(clearResult),
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) =>
            Promise.resolve(
              isStaleRefresh ? staleUpdateResult : clearResult,
            ).then(resolve, reject),
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
const respondWith = (
  movies: Record<string, unknown>[],
  totalPages = 1,
  /**
   * フィルタ前の件数（#1166）
   *
   * 既定は `results` と同数。`results` が空でもここが正なら
   * 「ローカルのフィルタで全件落ちた」を表せる
   */
  rawResultsCount = movies.length,
) => ({
  results: movies,
  total_pages: totalPages,
  raw_results_count: rawResultsCount,
});

/** JP配信実態のレスポンスを生成 */
const availability = (
  isCurrentlyStreaming: boolean,
  digitalReleaseDate: string | null = null,
  keywordIds: number[] = [],
  watchProviderIds: Record<string, number[]> = {
    flatrate: [],
    rent: [],
    buy: [],
  },
) => ({
  isCurrentlyStreaming,
  digitalReleaseDate,
  keywordIds,
  watchProviderIds,
});

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
    // 既定では古い配信情報は無い（既存テストに影響させない）
    staleSelectResult = { data: [], error: null };
    staleUpdateResult = { error: null };
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

      // ⚠️ 上限で抜けた＝全部は見ていないので、クリアは見送る（#1166）。
      // 見ていない作品を「配信終了」にするのは、途中で空を返されたときと
      // 同じ事故。実測では total_pages が上限に届かないが、カタログが
      // 増えれば黙ってクリア対象が広がる
      expect(mockClearNotIn).not.toHaveBeenCalled();
      expect(result.errors.join('\n')).toContain('上限');
    });

    it('結果が0件のページでループを打ち切る', async () => {
      mockDiscoverMovies.mockResolvedValue(respondWith([], 5));

      await syncStreamingMovies();

      // time_frame ごとに1回ずつで打ち切り
      expect(mockDiscoverMovies).toHaveBeenCalledTimes(2);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    /**
     * フィルタで空になっただけのページで打ち切らない（#1166）
     *
     * `discoverMovies` は `excludeInappropriateMovies` を通した配列を返す。
     * `results.length === 0` は「TMDb が空を返した」とは限らない
     */
    it('フィルタで全件落ちたページがあっても次のページを取りにいく', async () => {
      mockDiscoverMovies
        .mockResolvedValueOnce(respondWith([createMovie({ id: 11 })], 3))
        // TMDb は返したが全件フィルタで落ちた
        .mockResolvedValueOnce(respondWith([], 3, 20))
        .mockResolvedValueOnce(respondWith([createMovie({ id: 12 })], 3))
        // 2つ目の time_frame は1ページで終端
        .mockResolvedValue(respondWith([createMovie({ id: 11 })], 1));

      await syncStreamingMovies();

      // 2ページ目で止まらず3ページ目まで取りにいく。
      // 件数だけ見ると、2つ目の time_frame のぶんで水増しされて素通りする
      const pages = mockDiscoverMovies.mock.calls.map(
        (call) => (call[0] as { page: number }).page,
      );
      expect(pages).toContain(3);
    });

    /**
     * 途中でTMDbが空を返したらクリアしない（#1166）
     *
     * 取れなかったページの作品は streamingIds にも unresolvedIds にも
     * 入らないため、クリアを撃つと丸ごと「配信終了」になる
     */
    it('TMDbが途中で空を返したらクリアを実行しない', async () => {
      mockDiscoverMovies
        .mockResolvedValueOnce(respondWith([createMovie({ id: 21 })], 5))
        // フィルタ前から空＝TMDb の異常
        .mockResolvedValueOnce(respondWith([], 5, 0))
        .mockResolvedValue(respondWith([createMovie({ id: 21 })], 1));

      const result = await syncStreamingMovies();

      expect(mockClearNotIn).not.toHaveBeenCalled();
      expect(result.errors.join('\n')).toContain('打ち切');
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

    it('プロレス興行を除外する（団体キーワード）', async () => {
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability(true, null, [367574]), // joshi puroresu
      );
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({
            genre_ids: [28, 18],
            title: 'STARDOM CINDERELLA TOURNAMENT 2026 ～2回戦～',
          }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });

    it('プロレス興行を除外する（汎用キーワード＋タイトル語）', async () => {
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability(true, null, [5970, 206441]), // wrestling, pro wrestling
      );
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({
            genre_ids: [28, 18, 35],
            title: 'DDT Judgement 2026～旗揚げ29周年記念大会5時間スペシャル～',
          }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });

    it('プロレスを題材にした劇映画は除外しない', async () => {
      // 『レスラー』は pro wrestling を持つがタイトルに興行語が無い
      mockUpsert.mockResolvedValue({ error: null });
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability(true, null, [206441]),
      );
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ genre_ids: [18], title: 'レスラー' })]),
      );

      const result = await syncStreamingMovies();

      expect(result.skipped).toBe(0);
      expect(result.upserted).toBe(1);
    });

    it('劇映画ジャンルの舞台中継を除外する', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([
          createMovie({
            genre_ids: [18, 35],
            title: 'National Theatre Live: Hamlet',
          }),
        ]),
      );

      const result = await syncStreamingMovies();

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
      // タイトルだけで判定できるためキーワードは問い合わせない
      expect(mockGetMovieKeywordIds).not.toHaveBeenCalled();
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

    it('upsert に original_language を含める', async () => {
      mockDiscoverMovies.mockResolvedValue(
        respondWith([createMovie({ id: 701, original_language: 'th' })]),
      );

      await syncStreamingMovies();

      expect(mockUpsert.mock.calls[0][0][0]).toMatchObject({
        id: 701,
        original_language: 'th',
      });
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

      // ⚠️ `errors.length` では代用できない（#1354）。あの配列には作品単位
      //    ではないエラーも混ざる。通知の分子・分母はここで数える
      expect(result.items.failed).toBe(result.items.attempted);
      expect(result.items.attempted).toBeGreaterThan(0);
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
      // ⚠️ 作品単位の失敗として数える（#1354）。`errors` だけに積むと、
      //    **書き込みが1件も通っていないのに `failed` が 0** になって
      //    通知に乗らない
      expect(result.items.failed).toBe(result.items.attempted);
      expect(result.items.attempted).toBeGreaterThan(0);
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

  // #433: 同期ウィンドウから外れた行の配信情報は、以後どの経路も書き換えない。
  // TMDb 規約 Section 1.C の「6ヶ月を超えてキャッシュしない」に当たる
  describe('古い配信情報の取り直し', () => {
    const staleRow = {
      id: 777,
      title: '窓の外の作品',
      release_type: 'streaming',
    };

    /**
     * 本筋（Discover の作品 id=1）と stale 行（id=777）で応答を出し分ける
     *
     * ⚠️ 一律のモックだと、stale の応答を「空」や「失敗」にした瞬間に
     * **本筋も配信0件になり、取り直し自体がガードでスキップされる**。
     * 検証したい経路に入らないまま緑になる
     */
    const respondPerMovie = (forStale: {
      resolved?: unknown;
      rejected?: unknown;
    }) => {
      mockGetJpStreamingAvailability.mockImplementation((movieId: number) => {
        if (movieId !== staleRow.id) {
          return Promise.resolve(availability(true, '2026-03-10'));
        }
        return forStale.rejected !== undefined
          ? Promise.reject(forStale.rejected)
          : Promise.resolve(forStale.resolved);
      });
    };

    /** 取り直しで呼ばれた update のペイロードを返す */
    const staleUpdatePayload = () =>
      mockUpdate.mock.calls
        .map((call) => call[0])
        .find((payload) => 'watch_provider_flatrate' in payload);

    it('cached_at が古く配信情報を持つ行を抽出する', async () => {
      await syncStreamingMovies();

      expect(mockStaleLt).toHaveBeenCalledWith('cached_at', expect.any(String));

      // ⚠️ 閾値の向きを固定する。符号を間違えると「新しい行だけ」を
      //    取り直して、古い行が永久に残る
      const [, threshold] = mockStaleLt.mock.calls[0];
      const days =
        (Date.now() - Date.parse(threshold as string)) / (24 * 60 * 60 * 1000);
      expect(days).toBeCloseTo(STREAMING_AVAILABILITY_STALE_DAYS, 0);
    });

    it('配信情報を持つ行だけを対象にする', async () => {
      await syncStreamingMovies();

      const [condition] = mockStaleOr.mock.calls[0];
      for (const column of [
        'watch_provider_flatrate',
        'watch_provider_rent',
        'watch_provider_buy',
        'digital_release_date',
      ]) {
        expect(condition).toContain(`${column}.not.is.null`);
      }
    });

    it('1回の同期で取り直す件数に上限を設ける', async () => {
      await syncStreamingMovies();

      expect(mockStaleLimit).toHaveBeenCalledWith(
        STREAMING_STALE_REFRESH_LIMIT,
      );
    });

    it('取り直した値を書き戻し、cached_at を更新する', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      mockGetJpStreamingAvailability.mockResolvedValue({
        isCurrentlyStreaming: true,
        digitalReleaseDate: '2026-05-01',
        watchProviderIds: { flatrate: [8], rent: [], buy: [2] },
        keywordIds: [],
      });

      const result = await syncStreamingMovies();

      expect(staleUpdatePayload()).toEqual({
        is_currently_streaming: true,
        digital_release_date: '2026-05-01',
        watch_provider_flatrate: [8],
        watch_provider_rent: [],
        watch_provider_buy: [2],
        // ⚠️ これを書かないと同じ行を毎日取り直し続ける
        cached_at: expect.any(String),
      });
      expect(result.staleRefreshed).toBe(1);
    });

    // ⛔ NULL で潰すと、配信予定タブ（digital_release_date > today だけで
    //    絞る）から「劇場公開は3ヶ月以上前・配信はこれから」の作品が落ちる
    it('TMDbが配信情報を返さなくなった作品は空を反映する', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      respondPerMovie({
        resolved: {
          isCurrentlyStreaming: false,
          digitalReleaseDate: null,
          watchProviderIds: { flatrate: [], rent: [], buy: [] },
          keywordIds: [],
        },
      });

      await syncStreamingMovies();

      expect(staleUpdatePayload()).toEqual(
        expect.objectContaining({
          is_currently_streaming: false,
          digital_release_date: null,
        }),
      );
    });

    it('TMDbの取得に失敗した行は現状維持にする', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      respondPerMovie({ rejected: new Error('503') });

      const result = await syncStreamingMovies();

      expect(staleUpdatePayload()).toBeUndefined();
      expect(result.staleRefreshed).toBe(0);
      expect(result.errors.some((e) => e.includes('stale availability'))).toBe(
        true,
      );
    });

    it('非Errorがスローされてもログに残して続行する', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      respondPerMovie({ rejected: 'string error' });

      const result = await syncStreamingMovies();

      expect(result.staleRefreshed).toBe(0);
      expect(result.errors.some((e) => e.includes('Unknown error'))).toBe(true);
    });

    it('書き戻しに失敗したらerrorsに積み、件数を増やさない', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      staleUpdateResult = { error: { message: 'update failed' } };

      const result = await syncStreamingMovies();

      expect(result.staleRefreshed).toBe(0);
      expect(result.errors.some((e) => e.includes('stale update'))).toBe(true);
    });

    it('抽出に失敗しても本筋の同期結果は残す', async () => {
      staleSelectResult = { data: null, error: { message: 'select failed' } };

      const result = await syncStreamingMovies();

      expect(result.upserted).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('stale select'))).toBe(true);
    });

    it('対象が無ければTMDbを追加で呼ばない', async () => {
      staleSelectResult = { data: [], error: null };

      const before = mockGetJpStreamingAvailability.mock.calls.length;
      const result = await syncStreamingMovies();

      // Discover 経由の候補1件ぶんだけ
      expect(mockGetJpStreamingAvailability.mock.calls.length - before).toBe(1);
      expect(result.staleRefreshed).toBe(0);
    });

    // ⛔ **クリアより後ろに置くと、翌日のクリアが必ず取り消す。**
    //   対象は定義上ウィンドウ外なので keepIds に入らず
    //   .not('id','in',...) に引っかかる。しかも cached_at を進めるので
    //   60日間は再抽出されない＝実質まったく直らない
    it('配信中と確認した作品をクリアの保持対象に入れる', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      respondPerMovie({
        resolved: {
          isCurrentlyStreaming: true,
          digitalReleaseDate: '2026-05-01',
          watchProviderIds: { flatrate: [8], rent: [], buy: [] },
          keywordIds: [],
        },
      });

      await syncStreamingMovies();

      const [, , notInList] = mockClearNotIn.mock.calls[0];
      expect(String(notInList)).toContain(String(staleRow.id));
    });

    it('取得に失敗した作品もクリアの保持対象に入れる', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      respondPerMovie({ rejected: new Error('503') });

      await syncStreamingMovies();

      const [, , notInList] = mockClearNotIn.mock.calls[0];
      expect(String(notInList)).toContain(String(staleRow.id));
    });

    // ⛔ getJpStreamingAvailability は watch/providers が欠けても例外を投げず、
    //   HTTP 200 のまま「配信なし」を返す。TMDb 障害時に走らせると
    //   digital_release_date を NULL で潰し、cached_at も進むので
    //   60日間 配信予定タブから作品が消えたままになる
    it('本筋が1件も配信中を確認できなかったら取り直さない', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      mockGetJpStreamingAvailability.mockResolvedValue(availability(false));

      const result = await syncStreamingMovies();

      expect(mockStaleLt).not.toHaveBeenCalled();
      expect(result.staleRefreshed).toBe(0);
    });

    it('本筋が途中で打ち切られたら取り直さない', async () => {
      staleSelectResult = { data: [staleRow], error: null };
      // 2ページ目で空を返す＝TMDb側の異常（#1166）
      mockDiscoverMovies
        .mockResolvedValueOnce(respondWith([createMovie()], 3))
        .mockResolvedValueOnce(respondWith([], 3, 0))
        .mockResolvedValue(respondWith([createMovie()], 1));

      await syncStreamingMovies();

      expect(mockStaleLt).not.toHaveBeenCalled();
    });

    // ⚠️ .eq() を両方消すと movie_cache 全行を1件の配信情報で塗り潰す
    it('書き戻しは id と release_type で1行に絞る', async () => {
      staleSelectResult = { data: [staleRow], error: null };

      await syncStreamingMovies();

      expect(mockUpdateEq).toHaveBeenCalledWith('id', staleRow.id);
      expect(mockUpdateEq).toHaveBeenCalledWith(
        'release_type',
        staleRow.release_type,
      );
    });

    // ⚠️ 逆順にすると、上限を超えたとき最も古い行が永久に後回しになる
    it('古いものから順に取り直す', async () => {
      staleSelectResult = { data: [staleRow], error: null };

      await syncStreamingMovies();

      expect(mockStaleOrder).toHaveBeenCalledWith('cached_at', {
        ascending: true,
      });
    });

    // ⚠️ 黙って切り捨てると「全部取り直した」ように見える
    it('上限に達したらログに残す', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      staleSelectResult = {
        data: Array.from({ length: STREAMING_STALE_REFRESH_LIMIT }, (_, i) => ({
          ...staleRow,
          id: 1000 + i,
        })),
        error: null,
      };

      await syncStreamingMovies();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(String(STREAMING_STALE_REFRESH_LIMIT)),
      );
      warnSpy.mockRestore();
    });
  });
});
