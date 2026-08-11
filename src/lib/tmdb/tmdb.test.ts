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

import { TMDB_MOVIE_DETAIL_APPEND } from '@/constants/tmdb';

beforeAll(() => {
  process.env.TMDB_API_KEY = 'test-token';
});

const mockResponse = {
  data: { page: 1, results: [], total_pages: 1, total_results: 0 },
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

  describe('getPopularMovies', () => {
    it('正しいエンドポイントとパラメータでgetが呼ばれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getPopularMovies } = require('./tmdb');
      await getPopularMovies(2);

      expect(mockGet).toHaveBeenCalledWith('/movie/popular', {
        params: { page: 2 },
      });
    });

    it('デフォルトページが1になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getPopularMovies } = require('./tmdb');
      await getPopularMovies();

      expect(mockGet).toHaveBeenCalledWith('/movie/popular', {
        params: { page: 1 },
      });
    });
  });

  describe('getUpcomingMovies', () => {
    it('正しいエンドポイントとパラメータでgetが呼ばれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getUpcomingMovies } = require('./tmdb');
      await getUpcomingMovies(3);

      expect(mockGet).toHaveBeenCalledWith('/movie/upcoming', {
        params: { page: 3 },
      });
    });

    it('デフォルトページが1になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getUpcomingMovies } = require('./tmdb');
      await getUpcomingMovies();

      expect(mockGet).toHaveBeenCalledWith('/movie/upcoming', {
        params: { page: 1 },
      });
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
  });

  describe('getTopRatedMovies', () => {
    it('正しいエンドポイントとパラメータでgetが呼ばれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getTopRatedMovies } = require('./tmdb');
      await getTopRatedMovies(5);

      expect(mockGet).toHaveBeenCalledWith('/movie/top_rated', {
        params: { page: 5 },
      });
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

  describe('getMovieKeywordIds', () => {
    it('正しいエンドポイントでgetが呼ばれキーワードID配列を返す', async () => {
      mockGet.mockResolvedValue(mockKeywordsResponse);

      const { getMovieKeywordIds } = require('./tmdb');
      const result = await getMovieKeywordIds(123);

      expect(mockGet).toHaveBeenCalledWith('/movie/123/keywords');
      expect(result).toEqual([1, 2]);
    });

    it('文字列のmovieIdでも正しく動作する', async () => {
      mockGet.mockResolvedValue(mockKeywordsResponse);

      const { getMovieKeywordIds } = require('./tmdb');
      const result = await getMovieKeywordIds('789');

      expect(mockGet).toHaveBeenCalledWith('/movie/789/keywords');
      expect(result).toEqual([1, 2]);
    });

    it('キーワードが空の場合は空配列を返す', async () => {
      mockGet.mockResolvedValue({ data: { id: 123, keywords: [] } });

      const { getMovieKeywordIds } = require('./tmdb');
      const result = await getMovieKeywordIds(123);

      expect(result).toEqual([]);
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
  });

  describe('discoverMovies', () => {
    it('デフォルトパラメータで正しく呼ばれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { discoverMovies } = require('./tmdb');
      await discoverMovies();

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          page: 1,
          include_adult: false,
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
        without_keywords: '100|200',
        without_genres: '10|20',
      });

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          page: 3,
          include_adult: false,
          'release_date.gte': '2025-01-01',
          'release_date.lte': '2025-12-31',
          with_release_type: '2|3',
          sort_by: 'popularity.desc',
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
          include_adult: false,
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

  describe('getMoviesByGenre', () => {
    it('discoverエンドポイントが正しいパラメータで呼ばれる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getMoviesByGenre } = require('./tmdb');
      await getMoviesByGenre(28, 3);

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          with_genres: 28,
          page: 3,
          sort_by: 'popularity.desc',
        },
      });
    });

    it('デフォルトページが1になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getMoviesByGenre } = require('./tmdb');
      await getMoviesByGenre(35);

      expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
        params: {
          with_genres: 35,
          page: 1,
          sort_by: 'popularity.desc',
        },
      });
    });
  });

  describe('validatePage（各API関数経由で確認）', () => {
    it('page=0の場合1に補正される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getPopularMovies } = require('./tmdb');
      await getPopularMovies(0);

      expect(mockGet).toHaveBeenCalledWith('/movie/popular', {
        params: { page: 1 },
      });
    });

    it('page=501の場合500に補正される', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getTopRatedMovies } = require('./tmdb');
      await getTopRatedMovies(501);

      expect(mockGet).toHaveBeenCalledWith('/movie/top_rated', {
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

      const { getPopularMovies } = require('./tmdb');
      await getPopularMovies(-5);

      expect(mockGet).toHaveBeenCalledWith('/movie/popular', {
        params: { page: 1 },
      });
    });

    it('page=1の場合そのまま1になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getPopularMovies } = require('./tmdb');
      await getPopularMovies(1);

      expect(mockGet).toHaveBeenCalledWith('/movie/popular', {
        params: { page: 1 },
      });
    });

    it('page=500の場合そのまま500になる', async () => {
      mockGet.mockResolvedValue(mockResponse);

      const { getPopularMovies } = require('./tmdb');
      await getPopularMovies(500);

      expect(mockGet).toHaveBeenCalledWith('/movie/popular', {
        params: { page: 500 },
      });
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
