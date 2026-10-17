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
  EXCLUDED_GENRE_IDS,
  EXCLUDED_GENRES_PARAM,
  EXCLUDED_KEYWORDS_PARAM,
} from '@/constants/movies';
import { TMDB_MOVIE_DETAIL_APPEND } from '@/constants/tmdb';

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
        params: { append_to_response: TMDB_MOVIE_DETAIL_APPEND },
      });
    });

    it('文字列のmovieIdが正しくパスに含まれる', async () => {
      mockGet.mockResolvedValue(mockDetailResponse);

      const { getMovieDetail } = require('./tmdb');
      await getMovieDetail('456');

      expect(mockGet).toHaveBeenCalledWith('/movie/456', {
        params: { append_to_response: TMDB_MOVIE_DETAIL_APPEND },
      });
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
});
