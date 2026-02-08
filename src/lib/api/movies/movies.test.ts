/**
 * 映画APIクライアントのテスト
 */

import { axiosInstance } from '@/lib/axios/axios';
import { getMovies } from './movies';

// axiosInstanceをモック
jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

describe('movies API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMovies', () => {
    const mockResponse = {
      data: {
        success: true,
        data: {
          movies: [
            {
              id: 1,
              title: 'テスト映画',
              poster_path: '/test.jpg',
              backdrop_path: '/backdrop.jpg',
              release_date: '2026-03-01',
              overview: 'テスト概要',
              vote_average: 7.5,
              popularity: 100.0,
              genre_ids: [28, 12],
              release_type: 'theatrical',
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 5,
            totalItems: 100,
            itemsPerPage: 20,
          },
          genres: {
            28: 'アクション',
            12: 'アドベンチャー',
          },
        },
      },
    };

    it('デフォルトパラメータで映画一覧を取得できること', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await getMovies();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies', {
        params: {},
      });
      expect(result.data.movies).toHaveLength(1);
      expect(result.data.movies[0].title).toBe('テスト映画');
      expect(result.data.pagination.currentPage).toBe(1);
      expect(result.data.genres).toEqual({
        28: 'アクション',
        12: 'アドベンチャー',
      });
    });

    it('ページとソート指定で映画一覧を取得できること', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      await getMovies({ page: 2, sort_by: 'popularity' });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies', {
        params: { page: 2, sort_by: 'popularity' },
      });
    });

    it('release_typeを指定して映画一覧を取得できること', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      await getMovies({ release_type: 'streaming' });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies', {
        params: { release_type: 'streaming' },
      });
    });

    it('genre_idsを指定して映画一覧を取得できること', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      await getMovies({ genre_ids: '28,12' });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies', {
        params: { genre_ids: '28,12' },
      });
    });

    it('全パラメータを指定して映画一覧を取得できること', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      await getMovies({
        page: 2,
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: '28,12,878',
      });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies', {
        params: {
          page: 2,
          sort_by: 'popularity',
          release_type: 'streaming',
          genre_ids: '28,12,878',
        },
      });
    });

    it('APIエラー時にエラーがスローされること', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(getMovies()).rejects.toThrow('Network Error');
    });
  });
});
