/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * TMDb APIクライアントのテスト
 *
 * axiosをモックし、各API関数が正しいエンドポイント・パラメータで
 * axiosインスタンスのgetを呼び出すことを検証する
 */

const mockGet = jest.fn();
let interceptorRejected: (error: unknown) => Promise<unknown>;

jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: mockGet,
    interceptors: {
      response: {
        use: jest.fn(
          (
            _onFulfilled: unknown,
            onRejected: (error: unknown) => Promise<unknown>,
          ) => {
            interceptorRejected = onRejected;
          },
        ),
      },
    },
  };

  // tmdbClient自身をモックリクエスト関数として呼べるようにする
  const instance = Object.assign(
    jest.fn((config: unknown) => mockGet(config)),
    mockAxiosInstance,
  );

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
    },
  };
});

import {
  DOCUMENTARY_GENRE_ID,
  EXCLUDED_GENRE_IDS,
  EXCLUDED_GENRES_PARAM,
  EXCLUDED_KEYWORDS_PARAM,
} from '@/constants/movies';
import {
  TMDB_MOVIE_DETAIL_APPEND,
  TMDB_VIDEO_LANGUAGES,
  TMDB_PERSON_DETAIL_APPEND,
  TMDB_STREAMING_AVAILABILITY_APPEND,
} from '@/constants/tmdb';

beforeAll(() => {
  process.env.TMDB_API_KEY = 'test-token';
});

const mockResponse = {
  data: { page: 1, results: [], total_pages: 1, total_results: 0 },
};

/** 不適切コンテンツ除外テスト用の映画ファクトリ */
const createMovie = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  title: '一般映画',
  adult: false,
  genre_ids: [28],
  ...overrides,
});

/** adult・除外ジャンル・一般作品が混在したレスポンス */
const mixedContentResponse = {
  data: {
    page: 1,
    results: [
      createMovie({ id: 1, title: '一般映画' }),
      createMovie({ id: 2, title: 'アダルト作品', adult: true }),
      createMovie({
        id: 3,
        title: 'TV映画',
        genre_ids: [EXCLUDED_GENRE_IDS[0]],
      }),
      createMovie({ id: 4, title: 'ジャンル未設定', genre_ids: undefined }),
    ],
    total_pages: 1,
    total_results: 4,
  },
};

const mockDetailResponse = {
  data: {
    id: 123,
    title: 'テスト映画',
    original_title: 'Test Movie',
    overview: 'テスト概要',
    poster_path: '/test.jpg',
    backdrop_path: '/test-bg.jpg',
    release_date: '2025-01-01',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 50.0,
    adult: false,
    original_language: 'en',
    runtime: 120,
    genres: [{ id: 28, name: 'アクション' }],
    production_companies: [],
    production_countries: [],
    spoken_languages: [],
    budget: 100000000,
    revenue: 200000000,
    tagline: 'テストタグライン',
    status: 'Released',
    homepage: null,
  },
};

const mockGenresResponse = {
  data: {
    genres: [
      { id: 28, name: 'アクション' },
      { id: 35, name: 'コメディ' },
    ],
  },
};

const mockKeywordsResponse = {
  data: {
    id: 123,
    keywords: [
      { id: 1, name: 'keyword1' },
      { id: 2, name: 'keyword2' },
    ],
  },
};

describe('TMDb APIクライアント', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  describe('tmdbClientの既定パラメータ', () => {
    it('include_adult=falseが全リクエスト共通で送られる', () => {
      require('./tmdb');
      const axios = require('axios').default;

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ include_adult: false }),
        }),
      );
    });
  });

  describe('getNowPlayingMovies', () => {
    it('正しいエンドポイントとパラメータでgetが呼ばれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      await getNowPlayingMovies(1);

      expect(mockGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 1 },
      });
    });

    it('adult作品と除外ジャンルの作品が結果から除外される', async () => {
      mockGet.mockResolvedValue(mixedContentResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      const result = await getNowPlayingMovies(1);

      expect(result.results.map((m: { id: number }) => m.id)).toEqual([1, 4]);
    });

    it('ページネーション情報は除外後も元のレスポンスを保持する', async () => {
      mockGet.mockResolvedValue(mixedContentResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      const result = await getNowPlayingMovies(1);

      expect(result.page).toBe(1);
      expect(result.total_pages).toBe(1);
      expect(result.total_results).toBe(4);
    });
  });

  describe('getMovieDetail', () => {
    it('movieIdが正しくパスに含まれcreditsが付与される', async () => {
      mockGet.mockResolvedValue(mockDetailResponse);

      const { getMovieDetail } = require('./tmdb');
      await getMovieDetail(123);

      expect(mockGet).toHaveBeenCalledWith('/movie/123', {
        params: {
          append_to_response: TMDB_MOVIE_DETAIL_APPEND,
          include_video_language: TMDB_VIDEO_LANGUAGES,
        },
      });
    });

    it('文字列のmovieIdが正しくパスに含まれる', async () => {
      mockGet.mockResolvedValue(mockDetailResponse);

      const { getMovieDetail } = require('./tmdb');
      await getMovieDetail('456');

      expect(mockGet).toHaveBeenCalledWith('/movie/456', {
        params: {
          append_to_response: TMDB_MOVIE_DETAIL_APPEND,
          include_video_language: TMDB_VIDEO_LANGUAGES,
        },
      });
    });

    it('共通の language=ja-JP で予告動画が0件にならないよう英語・言語なしも取得する', async () => {
      mockGet.mockResolvedValue(mockDetailResponse);

      const { getMovieDetail } = require('./tmdb');
      await getMovieDetail(123);

      expect(mockGet).toHaveBeenCalledWith(
        '/movie/123',
        expect.objectContaining({
          params: expect.objectContaining({
            include_video_language: 'ja,en,null',
          }),
        }),
      );
    });

    it('レスポンスデータが正しく返される', async () => {
      mockGet.mockResolvedValue(mockDetailResponse);

      const { getMovieDetail } = require('./tmdb');
      const result = await getMovieDetail(123);

      expect(result).toEqual(mockDetailResponse.data);
    });
  });

  describe('hasExcludedKeyword', () => {
    it('除外キーワードを含む場合trueを返す', async () => {
      // 155477 = softcore（EXCLUDED_KEYWORD_IDS の先頭）
      mockGet.mockResolvedValue({
        data: { id: 1, keywords: [{ id: 155477, name: 'softcore' }] },
      });

      const { hasExcludedKeyword } = require('./tmdb');

      expect(await hasExcludedKeyword(1)).toBe(true);
    });

    it('除外キーワードを含まない場合falseを返す', async () => {
      mockGet.mockResolvedValue({
        data: { id: 1, keywords: [{ id: 9999, name: 'space' }] },
      });

      const { hasExcludedKeyword } = require('./tmdb');

      expect(await hasExcludedKeyword(1)).toBe(false);
    });

    it('キーワードが空の場合falseを返す', async () => {
      mockGet.mockResolvedValue({ data: { id: 1, keywords: [] } });

      const { hasExcludedKeyword } = require('./tmdb');

      expect(await hasExcludedKeyword(1)).toBe(false);
    });

    it('複数キーワードのうち1つでも除外対象ならtrueを返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          id: 1,
          keywords: [
            { id: 9999, name: 'space' },
            { id: 445, name: 'pornography' },
          ],
        },
      });

      const { hasExcludedKeyword } = require('./tmdb');

      expect(await hasExcludedKeyword(1)).toBe(true);
    });

    it('取得失敗時は例外をそのまま投げる（呼び出し側でスキップさせるfail-closed）', async () => {
      mockGet.mockRejectedValue(new Error('TMDb error'));

      const { hasExcludedKeyword } = require('./tmdb');

      await expect(hasExcludedKeyword(1)).rejects.toThrow('TMDb error');
    });

    it('signalをTMDbリクエストに渡す', async () => {
      mockGet.mockResolvedValue({ data: { id: 1, keywords: [] } });
      const controller = new AbortController();

      const { hasExcludedKeyword } = require('./tmdb');
      await hasExcludedKeyword(1, { signal: controller.signal });

      expect(mockGet).toHaveBeenCalledWith('/movie/1/keywords', {
        signal: controller.signal,
      });
    });
  });

  describe('getMovieKeywordIds', () => {
    it('正しいエンドポイントでgetが呼ばれキーワードID配列を返す', async () => {
      mockGet.mockResolvedValue(mockKeywordsResponse);

      const { getMovieKeywordIds } = require('./tmdb');
      const result = await getMovieKeywordIds(123);

      expect(mockGet).toHaveBeenCalledWith('/movie/123/keywords', {
        signal: undefined,
      });
      expect(result).toEqual([1, 2]);
    });

    it('文字列のmovieIdでも正しく動作する', async () => {
      mockGet.mockResolvedValue(mockKeywordsResponse);

      const { getMovieKeywordIds } = require('./tmdb');
      const result = await getMovieKeywordIds('789');

      expect(mockGet).toHaveBeenCalledWith('/movie/789/keywords', {
        signal: undefined,
      });
      expect(result).toEqual([1, 2]);
    });

    it('キーワードが空の場合は空配列を返す', async () => {
      mockGet.mockResolvedValue({ data: { id: 123, keywords: [] } });

      const { getMovieKeywordIds } = require('./tmdb');
      const result = await getMovieKeywordIds(123);

      expect(result).toEqual([]);
    });
  });

  describe('getMovieDismissSignals', () => {
    /** credits と keywords を append した映画詳細レスポンス */
    const mockSignalsResponse = {
      data: {
        id: 123,
        release_date: '2011-06-28',
        credits: {
          cast: [],
          crew: [
            { id: 1, name: 'Steven Spielberg', job: 'Producer' },
            { id: 2, name: 'Michael Bay', job: 'Director' },
          ],
        },
        keywords: {
          keywords: [
            { id: 10, name: 'robot' },
            { id: 20, name: 'explosion' },
          ],
        },
      },
    };

    it('1リクエストで監督・テーマ・公開年を取得する', async () => {
      mockGet.mockResolvedValue(mockSignalsResponse);

      const { getMovieDismissSignals } = require('./tmdb');
      const result = await getMovieDismissSignals(123);

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('/movie/123', {
        params: { append_to_response: 'credits,keywords' },
      });
      expect(result).toEqual({
        keywords: ['robot', 'explosion'],
        directorName: 'Michael Bay',
        releaseYear: 2011,
      });
    });

    it('クレジットに監督がいない場合はnullを返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          id: 123,
          release_date: '2020-01-01',
          credits: { cast: [], crew: [{ id: 1, name: 'A', job: 'Writer' }] },
          keywords: { keywords: [] },
        },
      });

      const { getMovieDismissSignals } = require('./tmdb');
      const result = await getMovieDismissSignals(123);

      expect(result.directorName).toBeNull();
      expect(result.keywords).toEqual([]);
    });

    it('公開日が空の場合は公開年をnullにする', async () => {
      mockGet.mockResolvedValue({
        data: { id: 123, release_date: '', credits: { cast: [] } },
      });

      const { getMovieDismissSignals } = require('./tmdb');
      const result = await getMovieDismissSignals(123);

      expect(result.releaseYear).toBeNull();
    });

    it('credits・keywordsが欠けていても落ちない', async () => {
      mockGet.mockResolvedValue({ data: { id: 123 } });

      const { getMovieDismissSignals } = require('./tmdb');
      const result = await getMovieDismissSignals(123);

      expect(result).toEqual({
        keywords: [],
        directorName: null,
        releaseYear: null,
      });
    });
  });

  describe('isTmdbNotFoundError', () => {
    it('レスポンスが404のエラーをtrueと判定する', () => {
      const { isTmdbNotFoundError } = require('./tmdb');

      expect(isTmdbNotFoundError({ response: { status: 404 } })).toBe(true);
    });

    it('404以外のHTTPエラーはfalseを返す', () => {
      const { isTmdbNotFoundError } = require('./tmdb');

      expect(isTmdbNotFoundError({ response: { status: 500 } })).toBe(false);
      expect(isTmdbNotFoundError({ response: { status: 429 } })).toBe(false);
    });

    it('レスポンスを持たないエラー（ネットワーク断等）はfalseを返す', () => {
      const { isTmdbNotFoundError } = require('./tmdb');

      expect(isTmdbNotFoundError(new Error('socket hang up'))).toBe(false);
    });

    it('nullやプリミティブはfalseを返す', () => {
      const { isTmdbNotFoundError } = require('./tmdb');

      expect(isTmdbNotFoundError(null)).toBe(false);
      expect(isTmdbNotFoundError(undefined)).toBe(false);
      expect(isTmdbNotFoundError('404')).toBe(false);
    });
  });

  describe('without_keywords に興行キーワードを含める', () => {
    it('不適切コンテンツと興行のキーワードをまとめて除外すること', () => {
      const ids = EXCLUDED_KEYWORDS_PARAM.split('|').map(Number);

      // 不適切コンテンツ（既存）
      expect(ids).toContain(155477); // softcore
      // プロレス団体
      expect(ids).toContain(367574); // joshi puroresu
      // 格闘技興行。Discover はキーワードを取得しないため、
      // isFightEvent の1段目をここで代替する
      expect(ids).toContain(192790); // combat sports
      expect(ids).toContain(361498); // jmma
      expect(ids).toContain(361499); // jkick
    });

    it('劇映画にも付く汎用キーワードは含めないこと', () => {
      const ids = EXCLUDED_KEYWORDS_PARAM.split('|').map(Number);

      // 『ウォーリアー』『キックボクサー』等を巻き込むため入れない
      expect(ids).not.toContain(9917); // mixed martial arts (mma)
      expect(ids).not.toContain(18111); // kickboxing
      expect(ids).not.toContain(5970); // wrestling
      expect(ids).not.toContain(206441); // pro wrestling
    });
  });

  describe('getMovieCacheStats', () => {
    const mockStatsResponse = {
      data: {
        id: 123,
        genres: [
          { id: 28, name: 'アクション' },
          { id: 878, name: 'SF' },
        ],
        title: 'ハートランド',
        overview: 'あらすじ',
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        vote_average: 7.5,
        vote_count: 1200,
        popularity: 98.7,
        original_language: 'ja',
      },
    };

    it('append_to_response を付けずに映画詳細を取得する', async () => {
      mockGet.mockResolvedValue(mockStatsResponse);

      const { getMovieCacheStats } = require('./tmdb');
      await getMovieCacheStats(123);

      // 日次全件同期で呼ばれるため、使わない credits / watch providers /
      // 予告動画をレスポンスに含めない
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('/movie/123');
    });

    it('同期に必要な項目だけを返す', async () => {
      mockGet.mockResolvedValue(mockStatsResponse);

      const { getMovieCacheStats } = require('./tmdb');
      const result = await getMovieCacheStats(123);

      expect(result).toEqual({
        genreIds: [28, 878],
        voteAverage: 7.5,
        voteCount: 1200,
        popularity: 98.7,
        originalLanguage: 'ja',
        // 一覧が参照する表示列。公開前に登録された作品は後からポスターや
        // 邦題が決まるため、日次同期で追従させる（#883）
        title: 'ハートランド',
        overview: 'あらすじ',
        posterPath: '/poster.jpg',
        backdropPath: '/backdrop.jpg',
      });
    });

    it('original_language が無ければ null を返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          id: 1,
          genres: [],
          vote_average: 0,
          vote_count: 0,
          popularity: 0,
        },
      });

      const { getMovieCacheStats } = require('./tmdb');
      const result = await getMovieCacheStats(1);

      expect(result.originalLanguage).toBeNull();
    });

    it('表示列が無ければ null を返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          id: 1,
          genres: [],
          vote_average: 0,
          vote_count: 0,
          popularity: 0,
        },
      });

      const { getMovieCacheStats } = require('./tmdb');
      const result = await getMovieCacheStats(1);

      expect(result.posterPath).toBeNull();
      expect(result.backdropPath).toBeNull();
      expect(result.title).toBeNull();
      expect(result.overview).toBeNull();
    });

    it('文字列のmovieIdが正しくパスに含まれる', async () => {
      mockGet.mockResolvedValue(mockStatsResponse);

      const { getMovieCacheStats } = require('./tmdb');
      await getMovieCacheStats('456');

      expect(mockGet).toHaveBeenCalledWith('/movie/456');
    });

    it('genres が欠けていても空配列を返す', async () => {
      mockGet.mockResolvedValue({
        data: { id: 123, vote_average: 0, popularity: 0 },
      });

      const { getMovieCacheStats } = require('./tmdb');
      const result = await getMovieCacheStats(123);

      expect(result.genreIds).toEqual([]);
    });

    it('vote_count が欠けていても0を返す', async () => {
      mockGet.mockResolvedValue({
        data: { id: 123, genres: [], vote_average: 0, popularity: 0 },
      });

      const { getMovieCacheStats } = require('./tmdb');
      const result = await getMovieCacheStats(123);

      expect(result.voteCount).toBe(0);
    });
  });

  describe('searchMovies', () => {
    it('query, page, year, genreがパラメータに含まれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { searchMovies } = require('./tmdb');
      await searchMovies({
        query: 'テスト',
        page: 2,
        year: 2025,
        genre: 28,
      });

      expect(mockGet).toHaveBeenCalledWith('/search/movie', {
        params: {
          query: 'テスト',
          page: 2,
          year: 2025,
          with_genres: 28,
        },
      });
    });

    it('オプショナルパラメータが未指定の場合undefinedになる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { searchMovies } = require('./tmdb');
      await searchMovies({ query: '映画' });

      expect(mockGet).toHaveBeenCalledWith('/search/movie', {
        params: {
          query: '映画',
          page: 1,
          year: undefined,
          with_genres: undefined,
        },
      });
    });

    it('adult作品と除外ジャンルの作品が結果から除外される', async () => {
      mockGet.mockResolvedValue(mixedContentResponse);

      const { searchMovies } = require('./tmdb');
      const result = await searchMovies({ query: 'テスト' });

      expect(result.results.map((m: { id: number }) => m.id)).toEqual([1, 4]);
    });

    it('すべてがadult作品の場合は空配列を返す', async () => {
      mockGet.mockResolvedValue({
        data: {
          page: 1,
          results: [
            createMovie({ id: 10, adult: true }),
            createMovie({ id: 11, adult: true }),
          ],
          total_pages: 1,
          total_results: 2,
        },
      });

      const { searchMovies } = require('./tmdb');
      const result = await searchMovies({ query: 'テスト' });

      expect(result.results).toEqual([]);
    });
  });

  describe('discoverMovies', () => {
    it('除外キーワード・除外ジャンルが既定で付与される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      await discoverMovies();

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          page: 1,
          without_keywords: EXCLUDED_KEYWORDS_PARAM,
          without_genres: EXCLUDED_GENRES_PARAM,
        },
      });
    });

    it('全パラメータが正しく渡される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      await discoverMovies({
        page: 3,
        'release_date.gte': '2025-01-01',
        'release_date.lte': '2025-12-31',
        with_release_type: '2|3',
        sort_by: 'popularity.desc',
      });

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          page: 3,
          without_keywords: EXCLUDED_KEYWORDS_PARAM,
          without_genres: EXCLUDED_GENRES_PARAM,
          'release_date.gte': '2025-01-01',
          'release_date.lte': '2025-12-31',
          with_release_type: '2|3',
          sort_by: 'popularity.desc',
        },
      });
    });

    it('明示指定された除外パラメータが既定値を上書きする', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      await discoverMovies({
        without_keywords: '100|200',
        without_genres: '10|20',
      });

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          page: 1,
          without_keywords: '100|200',
          without_genres: '10|20',
        },
      });
    });

    it('pageが省略された場合デフォルトで1になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      await discoverMovies({ sort_by: 'vote_average.desc' });

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          page: 1,
          without_keywords: EXCLUDED_KEYWORDS_PARAM,
          without_genres: EXCLUDED_GENRES_PARAM,
          sort_by: 'vote_average.desc',
        },
      });
    });

    it('レスポンスデータが正しく返される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      const result = await discoverMovies();

      expect(result).toEqual(mockResponse.data);
    });

    it('API側で漏れたadult作品・除外ジャンルを結果側でも除外する', async () => {
      mockGet.mockResolvedValue(mixedContentResponse);

      const { discoverMovies } = require('./tmdb');
      const result = await discoverMovies();

      expect(result.results.map((m: { id: number }) => m.id)).toEqual([1, 4]);
    });
  });

  describe('getGenres', () => {
    it('ジャンル一覧エンドポイントが呼ばれる', async () => {
      mockGet.mockResolvedValue(mockGenresResponse);

      const { getGenres } = require('./tmdb');
      const result = await getGenres();

      expect(mockGet).toHaveBeenCalledWith('/genre/movie/list');
      expect(result).toEqual([
        { id: 28, name: 'アクション' },
        { id: 35, name: 'コメディ' },
      ]);
    });
  });

  describe('getJpTheatricalReleaseDates', () => {
    /** release_dates レスポンスを組み立てる */
    const releasesResponse = (
      results: {
        iso_3166_1: string;
        release_dates: { type: number; release_date: string }[];
      }[],
    ) => ({ data: { id: 1, results } });

    it('日本の劇場公開（type2/type3）だけを昇順で返す', async () => {
      mockGet.mockResolvedValue(
        releasesResponse([
          {
            iso_3166_1: 'JP',
            release_dates: [
              { type: 3, release_date: '2026-09-04T00:00:00.000Z' },
              { type: 1, release_date: '2025-10-29T00:00:00.000Z' },
              { type: 2, release_date: '1996-09-14T00:00:00.000Z' },
              { type: 4, release_date: '2026-12-01T00:00:00.000Z' },
            ],
          },
        ]),
      );

      const { getJpTheatricalReleaseDates } = require('./tmdb');
      const result = await getJpTheatricalReleaseDates(1);

      // プレミア(1)とデジタル(4)は除外し、昇順に並べる
      expect(result).toEqual(['1996-09-14', '2026-09-04']);
      expect(mockGet).toHaveBeenCalledWith('/movie/1/release_dates');
    });

    it('日本以外の国のリリースは含めない', async () => {
      mockGet.mockResolvedValue(
        releasesResponse([
          {
            iso_3166_1: 'US',
            release_dates: [{ type: 3, release_date: '2020-01-01T00:00:00Z' }],
          },
          {
            iso_3166_1: 'JP',
            release_dates: [{ type: 3, release_date: '2026-03-01T00:00:00Z' }],
          },
        ]),
      );

      const { getJpTheatricalReleaseDates } = require('./tmdb');

      expect(await getJpTheatricalReleaseDates(1)).toEqual(['2026-03-01']);
    });

    it('日本のリリース情報が無ければ空配列を返す', async () => {
      mockGet.mockResolvedValue(
        releasesResponse([
          {
            iso_3166_1: 'US',
            release_dates: [{ type: 3, release_date: '2020-01-01T00:00:00Z' }],
          },
        ]),
      );

      const { getJpTheatricalReleaseDates } = require('./tmdb');

      expect(await getJpTheatricalReleaseDates(1)).toEqual([]);
    });

    it('日本に劇場公開が無ければ空配列を返す（プレミアのみ）', async () => {
      mockGet.mockResolvedValue(
        releasesResponse([
          {
            iso_3166_1: 'JP',
            release_dates: [{ type: 1, release_date: '2025-10-29T00:00:00Z' }],
          },
        ]),
      );

      const { getJpTheatricalReleaseDates } = require('./tmdb');

      expect(await getJpTheatricalReleaseDates(1)).toEqual([]);
    });

    it('results が空でも空配列を返す', async () => {
      mockGet.mockResolvedValue(releasesResponse([]));

      const { getJpTheatricalReleaseDates } = require('./tmdb');

      expect(await getJpTheatricalReleaseDates(1)).toEqual([]);
    });
  });

  describe('getJpStreamingAvailability', () => {
    /** watch/providers + release_dates の append レスポンスを組み立てる */
    const availabilityResponse = (
      providers: Record<string, unknown> | undefined,
      releases: {
        iso_3166_1: string;
        release_dates: { type: number; release_date: string }[];
      }[] = [],
      keywords: { id: number; name: string }[] = [],
    ) => ({
      data: {
        id: 1,
        'watch/providers': providers ? { results: providers } : undefined,
        release_dates: { results: releases },
        keywords: { keywords },
      },
    });

    it('watch/providersとrelease_datesを1リクエストで取得する', async () => {
      mockGet.mockResolvedValue(availabilityResponse({}));

      const { getJpStreamingAvailability } = require('./tmdb');
      await getJpStreamingAvailability(1);

      expect(mockGet).toHaveBeenCalledWith('/movie/1', {
        params: { append_to_response: TMDB_STREAMING_AVAILABILITY_APPEND },
      });
    });

    it('JPにflatrateがあれば配信中と判定する', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({
          JP: { link: 'https://example.com', flatrate: [{ provider_id: 8 }] },
        }),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect((await getJpStreamingAvailability(1)).isCurrentlyStreaming).toBe(
        true,
      );
    });

    it('JPにrentのみでも配信中と判定する', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({
          JP: { link: 'https://example.com', rent: [{ provider_id: 10 }] },
        }),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect((await getJpStreamingAvailability(1)).isCurrentlyStreaming).toBe(
        true,
      );
    });

    it('JPにbuyのみでも配信中と判定する', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({
          JP: { link: 'https://example.com', buy: [{ provider_id: 2 }] },
        }),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect((await getJpStreamingAvailability(1)).isCurrentlyStreaming).toBe(
        true,
      );
    });

    it('JP以外でしか配信されていない作品は配信中にしない', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({
          US: { link: 'https://example.com', flatrate: [{ provider_id: 8 }] },
        }),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect((await getJpStreamingAvailability(1)).isCurrentlyStreaming).toBe(
        false,
      );
    });

    it('JPのプロバイダーが空配列なら配信中にしない', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({
          JP: { link: 'https://example.com', flatrate: [], rent: [], buy: [] },
        }),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect((await getJpStreamingAvailability(1)).isCurrentlyStreaming).toBe(
        false,
      );
    });

    it('watch/providersが無くても例外にならず配信中にしない', async () => {
      mockGet.mockResolvedValue(availabilityResponse(undefined));

      const { getJpStreamingAvailability } = require('./tmdb');

      expect(await getJpStreamingAvailability(1)).toEqual({
        isCurrentlyStreaming: false,
        digitalReleaseDate: null,
        keywordIds: [],
        watchProviderIds: { flatrate: [], rent: [], buy: [] },
      });
    });

    it('キーワードIDを抽出して返す', async () => {
      // プロレス興行の判定に使う。append_to_response で同時に取得している
      mockGet.mockResolvedValue(
        availabilityResponse(
          {},
          [],
          [
            { id: 5970, name: 'wrestling' },
            { id: 206441, name: 'pro wrestling' },
          ],
        ),
      );

      const { getJpStreamingAvailability } = require('./tmdb');
      const result = await getJpStreamingAvailability(1);

      expect(result.keywordIds).toEqual([5970, 206441]);
    });

    it('キーワードが無ければ空配列を返す', async () => {
      mockGet.mockResolvedValue({
        data: { id: 1, 'watch/providers': undefined, release_dates: undefined },
      });

      const { getJpStreamingAvailability } = require('./tmdb');
      const result = await getJpStreamingAvailability(1);

      expect(result.keywordIds).toEqual([]);
    });

    it('append_to_response に keywords が含まれる', async () => {
      mockGet.mockResolvedValue(availabilityResponse({}));

      const { getJpStreamingAvailability } = require('./tmdb');
      await getJpStreamingAvailability(1);

      expect(mockGet.mock.calls[0][1].params.append_to_response).toContain(
        'keywords',
      );
    });

    it('JPのDigital（type=4）から最も早い日付を抽出する', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({}, [
          {
            iso_3166_1: 'JP',
            release_dates: [
              { type: 3, release_date: '2026-01-01T00:00:00.000Z' },
              { type: 4, release_date: '2026-05-20T00:00:00.000Z' },
              { type: 4, release_date: '2026-04-10T00:00:00.000Z' },
            ],
          },
        ]),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect((await getJpStreamingAvailability(1)).digitalReleaseDate).toBe(
        '2026-04-10',
      );
    });

    it('他国のDigitalは採用しない', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({}, [
          {
            iso_3166_1: 'US',
            release_dates: [
              { type: 4, release_date: '2026-02-01T00:00:00.000Z' },
            ],
          },
        ]),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect(
        (await getJpStreamingAvailability(1)).digitalReleaseDate,
      ).toBeNull();
    });

    it('JPにDigitalが無ければnullを返す（劇場公開のみ）', async () => {
      mockGet.mockResolvedValue(
        availabilityResponse({}, [
          {
            iso_3166_1: 'JP',
            release_dates: [
              { type: 3, release_date: '2026-02-01T00:00:00.000Z' },
            ],
          },
        ]),
      );

      const { getJpStreamingAvailability } = require('./tmdb');

      expect(
        (await getJpStreamingAvailability(1)).digitalReleaseDate,
      ).toBeNull();
    });

    it('TMDb取得失敗時は例外をそのまま投げる（配信終了扱いにしない）', async () => {
      mockGet.mockRejectedValue(new Error('TMDb API error'));

      const { getJpStreamingAvailability } = require('./tmdb');

      await expect(getJpStreamingAvailability(1)).rejects.toThrow(
        'TMDb API error',
      );
    });
  });

  describe('validatePage（各API関数経由で確認）', () => {
    it('page=0の場合1に補正される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      await getNowPlayingMovies(0);

      expect(mockGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 1 },
      });
    });

    it('page=501の場合500に補正される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      await getNowPlayingMovies(501);

      expect(mockGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 500 },
      });
    });

    it('page=250の場合そのまま250になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      await getNowPlayingMovies(250);

      expect(mockGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 250 },
      });
    });

    it('負のページ番号の場合1に補正される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { searchMovies } = require('./tmdb');
      await searchMovies({ query: 'テスト', page: -5 });

      expect(mockGet).toHaveBeenCalledWith(
        '/search/movie',
        expect.objectContaining({
          params: expect.objectContaining({ page: 1 }),
        }),
      );
    });

    it('page=1の場合そのまま1になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getNowPlayingMovies } = require('./tmdb');
      await getNowPlayingMovies(1);

      expect(mockGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 1 },
      });
    });

    it('page=500の場合そのまま500になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      await discoverMovies({ page: 500 });

      expect(mockGet).toHaveBeenCalledWith(
        '/discover/movie',
        expect.objectContaining({
          params: expect.objectContaining({ page: 500 }),
        }),
      );
    });
  });

  describe('リトライインターセプター', () => {
    it('configがない場合はそのままrejectする', async () => {
      require('./tmdb');

      const error = { config: undefined, response: { status: 429 } };

      await expect(interceptorRejected(error)).rejects.toEqual(error);
    });

    it('statusがない場合はそのままrejectする', async () => {
      require('./tmdb');

      const error = {
        config: { url: '/test' },
        response: undefined,
      };

      await expect(interceptorRejected(error)).rejects.toEqual(error);
    });

    it('リトライ対象外のステータスコードはそのままrejectする', async () => {
      require('./tmdb');

      const error = {
        config: { url: '/test' },
        response: { status: 404 },
      };

      await expect(interceptorRejected(error)).rejects.toEqual(error);
    });

    it('リトライ上限に達した場合はrejectする', async () => {
      require('./tmdb');

      const error = {
        config: { url: '/test', __retryCount: 3 },
        response: { status: 429, headers: {} },
      };

      await expect(interceptorRejected(error)).rejects.toEqual(error);
    });

    it('429エラーでリトライが実行される', async () => {
      require('./tmdb');

      jest.useFakeTimers();

      const config = { url: '/test', __retryCount: 0 };
      const error = {
        config,
        response: { status: 429, headers: {} },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const retryPromise = interceptorRejected(error);

      jest.advanceTimersByTime(1000);

      await retryPromise;

      expect(config.__retryCount).toBe(1);

      jest.useRealTimers();
    });

    it('503エラーでリトライが実行される', async () => {
      require('./tmdb');

      jest.useFakeTimers();

      const config = { url: '/test', __retryCount: 0 };
      const error = {
        config,
        response: { status: 503, headers: {} },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const retryPromise = interceptorRejected(error);

      jest.advanceTimersByTime(1000);

      await retryPromise;

      expect(config.__retryCount).toBe(1);

      jest.useRealTimers();
    });

    it('504エラーでリトライが実行される', async () => {
      require('./tmdb');

      jest.useFakeTimers();

      const config = { url: '/test', __retryCount: 0 };
      const error = {
        config,
        response: { status: 504, headers: {} },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const retryPromise = interceptorRejected(error);

      jest.advanceTimersByTime(1000);

      await retryPromise;

      expect(config.__retryCount).toBe(1);

      jest.useRealTimers();
    });

    it('retry-afterヘッダーがある場合その値を使用する', async () => {
      require('./tmdb');

      jest.useFakeTimers();

      const config = { url: '/test' };
      const error = {
        config,
        response: { status: 429, headers: { 'retry-after': '2' } },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const retryPromise = interceptorRejected(error);

      // retry-after=2秒なので2000ms待つ
      jest.advanceTimersByTime(2000);

      await retryPromise;

      jest.useRealTimers();
    });

    it('__retryCountが未定義の場合0から開始する', async () => {
      require('./tmdb');

      jest.useFakeTimers();

      const config = { url: '/test' };
      const error = {
        config,
        response: { status: 429, headers: {} },
      };

      mockGet.mockResolvedValueOnce(mockResponse);

      const retryPromise = interceptorRejected(error);

      jest.advanceTimersByTime(1000);

      await retryPromise;

      expect((config as { __retryCount?: number }).__retryCount).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('getPersonDetail', () => {
    /** 出演作クレジットのファクトリ */
    const createCredit = (overrides: Record<string, unknown> = {}) => ({
      id: 100,
      title: '出演作',
      poster_path: '/p.jpg',
      backdrop_path: null,
      overview: '概要',
      release_date: '2020-01-01',
      genre_ids: [28],
      original_language: 'en',
      popularity: 10,
      vote_average: 7,
      vote_count: 100,
      adult: false,
      character: '本人',
      ...overrides,
    });

    /** 人物レスポンスのファクトリ */
    const createPersonResponse = (overrides: Record<string, unknown> = {}) => ({
      data: {
        id: 500,
        name: 'テスト俳優',
        biography: '日本語の略歴',
        birthday: '1980-05-01',
        deathday: null,
        place_of_birth: '東京',
        profile_path: '/profile.jpg',
        known_for_department: 'Acting',
        adult: false,
        movie_credits: { cast: [createCredit()] },
        ...overrides,
      },
    });

    it('append_to_responseでmovie_creditsとtranslationsを同時に取得する', async () => {
      mockGet.mockResolvedValue(createPersonResponse());

      const { getPersonDetail } = require('./tmdb');
      await getPersonDetail(500);

      expect(mockGet).toHaveBeenCalledWith('/person/500', {
        params: { append_to_response: TMDB_PERSON_DETAIL_APPEND },
      });
      // 1リクエストにまとめること（出演作を別途取りに行かない）
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('adult作品を出演作から除外する', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          movie_credits: {
            cast: [
              createCredit({ id: 1, title: '一般映画' }),
              createCredit({ id: 2, title: 'アダルト作品', adult: true }),
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.cast.map((c: { id: number }) => c.id)).toEqual([1]);
    });

    it('除外ジャンルの作品を出演作から除外する', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          movie_credits: {
            cast: [
              createCredit({ id: 1 }),
              createCredit({ id: 2, genre_ids: [EXCLUDED_GENRE_IDS[0]] }),
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.cast.map((c: { id: number }) => c.id)).toEqual([1]);
    });

    describe('本人出演・メイキングの後方配置', () => {
      /** クレジットを並べ、整形後のID順を返す */
      const resolveIds = async (
        credits: {
          id: number;
          character: string;
          genre_ids?: number[];
          release_date?: string;
        }[],
      ) => {
        mockGet.mockResolvedValue(
          createPersonResponse({
            movie_credits: { cast: credits.map((c) => createCredit(c)) },
          }),
        );
        const { getPersonDetail } = require('./tmdb');
        const person = await getPersonDetail(500);
        return person.cast.map((c: { id: number }) => c.id);
      };

      it('役名が本人役のクレジットを演技クレジットより後ろに置く', async () => {
        // 実データ: クリスチャン・ベールの78件中22件がこの形
        const ids = await resolveIds([
          { id: 1, character: 'Self', release_date: '2024-01-01' },
          { id: 2, character: 'Self - Actor', release_date: '2023-01-01' },
          { id: 3, character: 'Self - Gorr', release_date: '2022-01-01' },
          { id: 4, character: 'Himself', release_date: '2021-01-01' },
          { id: 5, character: 'Herself', release_date: '2020-01-01' },
          { id: 6, character: 'Bruce Wayne', release_date: '2005-01-01' },
        ]);

        // 公開日では最古でも、演技クレジットが先頭に来る
        expect(ids).toEqual([6, 1, 2, 3, 4, 5]);
      });

      it('役名にアーカイブ映像の注記があるクレジットを後ろに置く', async () => {
        const ids = await resolveIds([
          {
            id: 1,
            character: 'Batman (archive footage)',
            release_date: '2024-01-01',
          },
          { id: 2, character: '(Archive footage)', release_date: '2023-01-01' },
          {
            id: 3,
            character: 'Self (archive footage)',
            release_date: '2022-01-01',
          },
          { id: 4, character: 'Bruce Wayne', release_date: '2005-01-01' },
        ]);

        expect(ids).toEqual([4, 1, 2, 3]);
      });

      it('「as Himself」のような前置きがある役名も後ろに置く', async () => {
        const ids = await resolveIds([
          {
            id: 1,
            character: 'Interviewee as Himself',
            release_date: '2024-01-01',
          },
          { id: 2, character: 'Bruce Wayne', release_date: '2005-01-01' },
        ]);

        expect(ids).toEqual([2, 1]);
      });

      it('Selfridge のように self で始まる実在の役名は後ろに回さない', async () => {
        // ジョヴァンニ・リビシの『アバター』シリーズ（Parker Selfridge, 34,930票）。
        // /self/i の部分一致で判定すると代表作が末尾へ飛ばされる
        const ids = await resolveIds([
          { id: 1, character: 'Parker Selfridge', release_date: '2009-01-01' },
          { id: 2, character: 'Self', release_date: '2024-01-01' },
          { id: 3, character: 'Selfridge', release_date: '2022-01-01' },
        ]);

        expect(ids).toEqual([3, 1, 2]);
      });

      it('ドキュメンタリーで役名が無いクレジットを後ろに置く', async () => {
        // 実データ: "A Ressureição de Cristo"（歴代のキリスト役を並べた
        // 22分のアーカイブ編集もの）はキャスト全員の役名が空欄
        const ids = await resolveIds([
          {
            id: 1,
            character: '',
            genre_ids: [DOCUMENTARY_GENRE_ID],
            release_date: '2026-04-09',
          },
          { id: 2, character: '', genre_ids: [18], release_date: '1983-12-01' },
        ]);

        expect(ids).toEqual([2, 1]);
      });

      it('ドキュメンタリーでも役名があれば演技クレジット側に置く', async () => {
        // ナレーション等で本人が仕事として関わっているもの
        const ids = await resolveIds([
          {
            id: 1,
            character: 'Self',
            genre_ids: [DOCUMENTARY_GENRE_ID],
            release_date: '2024-01-01',
          },
          {
            id: 2,
            character: 'Narrator / Dan Eldon (uncredited) (voice)',
            genre_ids: [DOCUMENTARY_GENRE_ID],
            release_date: '1998-09-14',
          },
        ]);

        expect(ids).toEqual([2, 1]);
      });

      it('ドキュメンタリーでなければ役名が空でも演技クレジット側に置く', async () => {
        // 邦画・邦ドラマは TMDb に役名が登録されていないことが多い。
        // 役所広司の「役名なし」14件はすべて実在の出演作だった
        const ids = await resolveIds([
          { id: 1, character: 'Self', release_date: '2024-01-01' },
          { id: 2, character: '', genre_ids: [18], release_date: '1983-12-01' },
          {
            id: 3,
            character: '   ',
            genre_ids: [28],
            release_date: '1984-02-09',
          },
        ]);

        expect(ids).toEqual([3, 2, 1]);
      });

      it('後ろに回したクレジットも1件も失わない', async () => {
        const ids = await resolveIds([
          { id: 1, character: 'Self', release_date: '2024-01-01' },
          { id: 2, character: 'Bruce Wayne', release_date: '2005-01-01' },
          {
            id: 3,
            character: '',
            genre_ids: [DOCUMENTARY_GENRE_ID],
            release_date: '2026-04-09',
          },
        ]);

        expect(ids).toHaveLength(3);
      });
    });

    it('同じ映画の複数役を1件にまとめ、役名を連結する', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          movie_credits: {
            cast: [
              createCredit({ id: 1, character: '兄' }),
              createCredit({ id: 1, character: '弟' }),
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.cast).toHaveLength(1);
      expect(person.cast[0].character).toBe('兄 / 弟');
    });

    it('同じ役名が重複して返っても二重に連結しない', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          movie_credits: {
            cast: [
              createCredit({ id: 1, character: '本人' }),
              createCredit({ id: 1, character: '本人' }),
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.cast[0].character).toBe('本人');
    });

    it('公開日の新しい順に並べ、公開日が無い作品は末尾に置く', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          movie_credits: {
            cast: [
              createCredit({ id: 1, release_date: '2010-01-01' }),
              createCredit({ id: 2, release_date: '' }),
              createCredit({ id: 3, release_date: '2024-06-01' }),
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.cast.map((c: { id: number }) => c.id)).toEqual([3, 1, 2]);
      // 空文字の公開日は null に正規化する
      expect(person.cast[2].release_date).toBeNull();
    });

    it('日本語の略歴があればフォールバックしない', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          biography: '日本語の略歴',
          translations: {
            translations: [
              { iso_639_1: 'en', data: { biography: 'English bio' } },
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.biography).toBe('日本語の略歴');
      expect(person.is_biography_fallback).toBe(false);
    });

    it('日本語の略歴が空なら英語原文へフォールバックする', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          biography: '',
          translations: {
            translations: [
              { iso_639_1: 'fr', data: { biography: 'Biographie' } },
              { iso_639_1: 'en', data: { biography: 'English bio' } },
            ],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.biography).toBe('English bio');
      expect(person.is_biography_fallback).toBe(true);
    });

    it('英語訳も空なら略歴は空文字でフォールバック扱いにしない', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          biography: '   ',
          translations: {
            translations: [{ iso_639_1: 'en', data: { biography: '' } }],
          },
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.biography).toBe('');
      expect(person.is_biography_fallback).toBe(false);
    });

    it('空文字の生没年月日・出生地はnullに正規化する', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({
          birthday: '',
          deathday: '',
          place_of_birth: '',
        }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.birthday).toBeNull();
      expect(person.deathday).toBeNull();
      expect(person.place_of_birth).toBeNull();
    });

    it('アダルト出演者フラグはそのまま返す（404への変換は呼び出し側の責務）', async () => {
      mockGet.mockResolvedValue(createPersonResponse({ adult: true }));

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.adult).toBe(true);
    });

    it('movie_creditsが欠けていても空配列を返す', async () => {
      mockGet.mockResolvedValue(
        createPersonResponse({ movie_credits: undefined }),
      );

      const { getPersonDetail } = require('./tmdb');
      const person = await getPersonDetail(500);

      expect(person.cast).toEqual([]);
    });
  });
});
