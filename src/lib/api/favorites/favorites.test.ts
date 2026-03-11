/**
 * お気に入りAPIクライアント テスト
 */

import { FAVORITES_SUCCESS_MESSAGES } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import {
  getFavorites,
  addFavorite,
  updateFavoriteRating,
  removeFavorite,
} from './favorites';

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

describe('favorites API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFavorites', () => {
    const mockResponse = {
      data: {
        success: true,
        data: {
          favorites: [
            {
              id: 'fav-1',
              tmdb_movie_id: 100,
              title: '映画A',
              poster_path: '/a.jpg',
              release_date: '2026-01-01',
              rating: 8,
              added_at: '2026-01-10T00:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        },
      },
    };

    it('デフォルトパラメータでお気に入りを取得できる', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await getFavorites();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/favorites', {
        params: {},
      });
      expect(result.data.favorites).toHaveLength(1);
      expect(result.data.total).toBe(1);
    });

    it('ソート・ページ指定でお気に入りを取得できる', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      await getFavorites({ sort_by: 'rating', sort_order: 'asc', page: 2 });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/favorites', {
        params: { sort_by: 'rating', sort_order: 'asc', page: 2 },
      });
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(getFavorites()).rejects.toThrow('Network Error');
    });
  });

  describe('addFavorite', () => {
    const mockResponse = {
      data: {
        success: true,
        message: FAVORITES_SUCCESS_MESSAGES.ADDED,
        data: {
          id: 'new-fav-id',
          tmdb_movie_id: 12345,
          title: 'テスト映画',
          poster_path: '/test.jpg',
          release_date: '2026-03-01',
          rating: 8,
          added_at: '2026-03-10T00:00:00Z',
        },
      },
    };

    it('お気に入りに追加できる', async () => {
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await addFavorite({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        poster_path: '/test.jpg',
        release_date: '2026-03-01',
        rating: 8,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/favorites', {
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        poster_path: '/test.jpg',
        release_date: '2026-03-01',
        rating: 8,
      });
      expect(result.data.tmdb_movie_id).toBe(12345);
      expect(result.data.rating).toBe(8);
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Conflict'));

      await expect(
        addFavorite({
          tmdb_movie_id: 12345,
          title: 'テスト映画',
          rating: 8,
        }),
      ).rejects.toThrow('Conflict');
    });
  });

  describe('updateFavoriteRating', () => {
    const mockResponse = {
      data: {
        success: true,
        message: FAVORITES_SUCCESS_MESSAGES.UPDATED,
        data: {
          id: 'fav-123',
          tmdb_movie_id: 12345,
          title: 'テスト映画',
          poster_path: '/test.jpg',
          release_date: '2026-03-01',
          rating: 7,
          added_at: '2026-03-10T00:00:00Z',
        },
      },
    };

    it('評価を更新できる', async () => {
      mockedAxios.patch.mockResolvedValue(mockResponse);

      const result = await updateFavoriteRating('fav-123', { rating: 7 });

      expect(mockedAxios.patch).toHaveBeenCalledWith('/api/favorites/fav-123', {
        rating: 7,
      });
      expect(result.data.rating).toBe(7);
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.patch.mockRejectedValue(new Error('Not Found'));

      await expect(
        updateFavoriteRating('non-existent', { rating: 5 }),
      ).rejects.toThrow('Not Found');
    });
  });

  describe('removeFavorite', () => {
    it('お気に入りから削除できる', async () => {
      mockedAxios.delete.mockResolvedValue({ data: { success: true } });

      await removeFavorite('fav-123');

      expect(mockedAxios.delete).toHaveBeenCalledWith('/api/favorites/fav-123');
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.delete.mockRejectedValue(new Error('Not Found'));

      await expect(removeFavorite('non-existent')).rejects.toThrow('Not Found');
    });
  });
});
