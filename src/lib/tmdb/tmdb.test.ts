/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * TMDb APIクライアントのテスト
 *
 * axiosをモックし、各API関数が正しいエンドポイント・パラメータで
 * axiosインスタンスのgetを呼び出すことを検証する
 */

const mockGet = jest.fn();

jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: mockGet,
    interceptors: {
      response: { use: jest.fn() },
    },
  };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => mockAxiosInstance),
    },
  };
});

beforeAll(() => {
  process.env.NEXT_PUBLIC_TMDB_API_KEY = 'test-token';
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
        params: { append_to_response: 'credits' },
      });
    });

    it('文字列のmovieIdが正しくパスに含まれる', async () => {
      mockGet.mockResolvedValue(mockDetailResponse);

      const { getMovieDetail } = require('./tmdb');
      await getMovieDetail('456');

      expect(mockGet).toHaveBeenCalledWith('/movie/456', {
        params: { append_to_response: 'credits' },
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
  });
});
