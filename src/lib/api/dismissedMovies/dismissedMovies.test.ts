/**
 * 非表示映画APIクライアント テスト
 */

import { axiosInstance } from '@/lib/axios/axios';
import {
  getDismissedMovies,
  addDismissedMovie,
  removeDismissedMovie,
} from './dismissedMovies';

// axiosInstanceをモック
jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

describe('dismissedMovies API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDismissedMovies', () => {
    const mockDismissedMovies = [
      {
        id: 'dismissed-1',
        tmdb_movie_id: 12345,
        title: 'テスト映画1',
        poster_path: '/poster1.jpg',
        genre_ids: [28, 12],
        created_at: '2026-03-15T00:00:00Z',
      },
      {
        id: 'dismissed-2',
        tmdb_movie_id: 67890,
        title: 'テスト映画2',
        poster_path: null,
        genre_ids: [35],
        created_at: '2026-03-14T00:00:00Z',
      },
    ];

    it('一覧を正常に取得できる', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { success: true, data: mockDismissedMovies },
      });

      const result = await getDismissedMovies();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/dismissed-movies');
      expect(result).toEqual(mockDismissedMovies);
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Internal Server Error'));

      await expect(getDismissedMovies()).rejects.toThrow(
        'Internal Server Error',
      );
    });
  });

  describe('addDismissedMovie', () => {
    const mockResponse = {
      data: {
        success: true,
        message: '非表示リストに追加しました',
        data: {
          id: 'dismissed-1',
          tmdb_movie_id: 12345,
          title: 'テスト映画',
          genre_ids: [28, 12],
          created_at: '2026-03-15T00:00:00Z',
        },
      },
    };

    it('正常に追加できる', async () => {
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await addDismissedMovie({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        genre_ids: [28, 12],
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/dismissed-movies', {
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        genre_ids: [28, 12],
      });
      expect(result.success).toBe(true);
      expect(result.data.tmdb_movie_id).toBe(12345);
      expect(result.data.genre_ids).toEqual([28, 12]);
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Internal Server Error'));

      await expect(
        addDismissedMovie({
          tmdb_movie_id: 12345,
          title: 'テスト映画',
        }),
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('removeDismissedMovie', () => {
    it('正常に削除できる', async () => {
      mockedAxios.delete.mockResolvedValue({ data: { success: true } });

      await removeDismissedMovie(12345);

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        '/api/dismissed-movies?tmdb_movie_id=12345',
      );
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.delete.mockRejectedValue(new Error('Not Found'));

      await expect(removeDismissedMovie(99999)).rejects.toThrow('Not Found');
    });
  });
});
