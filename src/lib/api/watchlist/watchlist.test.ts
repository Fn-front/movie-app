/**
 * ウォッチリストAPIクライアント テスト
 */

import { WATCHLIST_SUCCESS_MESSAGES } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import {
  getWatchlist,
  addWatchlist,
  removeWatchlist,
  getWatchlistWatchedYears,
  getWatchlistWatched,
  bulkDeleteWatchlist,
} from './watchlist';

// axiosInstanceをモック
jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

describe('watchlist API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWatchlist', () => {
    const mockResponse = {
      data: {
        success: true,
        data: {
          watchlist: [
            {
              id: 'wl-1',
              tmdb_movie_id: 100,
              title: '映画A',
              poster_path: '/a.jpg',
              release_date: '2026-01-01',
              added_at: '2026-01-10T00:00:00Z',
            },
          ],
          next_cursor: null,
          has_more: false,
        },
      },
    };

    it('デフォルトパラメータでウォッチリストを取得できる', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await getWatchlist();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/watchlist', {
        params: {},
      });
      expect(result.data.watchlist).toHaveLength(1);
      expect(result.data.has_more).toBe(false);
    });

    it('カーソル指定でウォッチリストを取得できる', async () => {
      mockedAxios.get.mockResolvedValue(mockResponse);

      await getWatchlist({ cursor: '2026-01-05T00:00:00Z', limit: 10 });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/watchlist', {
        params: { cursor: '2026-01-05T00:00:00Z', limit: 10 },
      });
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(getWatchlist()).rejects.toThrow('Network Error');
    });
  });

  describe('addWatchlist', () => {
    const mockResponse = {
      data: {
        success: true,
        message: WATCHLIST_SUCCESS_MESSAGES.ADDED,
        data: {
          id: 'new-wl-id',
          tmdb_movie_id: 12345,
          title: 'テスト映画',
          poster_path: '/test.jpg',
          release_date: '2026-03-01',
          added_at: '2026-03-10T00:00:00Z',
        },
      },
    };

    it('ウォッチリストに追加できる', async () => {
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await addWatchlist({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        poster_path: '/test.jpg',
        release_date: '2026-03-01',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/watchlist', {
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        poster_path: '/test.jpg',
        release_date: '2026-03-01',
      });
      expect(result.data.tmdb_movie_id).toBe(12345);
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Conflict'));

      await expect(
        addWatchlist({ tmdb_movie_id: 12345, title: 'テスト映画' }),
      ).rejects.toThrow('Conflict');
    });
  });

  describe('removeWatchlist', () => {
    it('ウォッチリストから削除できる', async () => {
      mockedAxios.delete.mockResolvedValue({ data: { success: true } });

      await removeWatchlist('wl-123');

      expect(mockedAxios.delete).toHaveBeenCalledWith('/api/watchlist/wl-123');
    });

    it('APIエラー時にエラーがスローされる', async () => {
      mockedAxios.delete.mockRejectedValue(new Error('Not Found'));

      await expect(removeWatchlist('non-existent')).rejects.toThrow(
        'Not Found',
      );
    });
  });

  describe('getWatchlistWatchedYears', () => {
    it('追加年一覧を取得する', async () => {
      const mockResponse = {
        success: true,
        data: { years: [{ year: 2024, count: 12 }] },
      };
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      const result = await getWatchlistWatchedYears();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/api/watchlist/watched-years',
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getWatchlistWatched', () => {
    it('年とページングパラメータを渡す', async () => {
      const mockResponse = {
        success: true,
        data: { watchlist: [], next_cursor: null, has_more: false },
      };
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      const result = await getWatchlistWatched({ year: 2024, cursor: '20' });

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/watchlist/watched', {
        params: { year: 2024, cursor: '20' },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('bulkDeleteWatchlist', () => {
    it('年と除外IDをPOSTする', async () => {
      const mockResponse = {
        success: true,
        message: '10件を削除しました',
        data: { deleted_count: 10 },
      };
      mockedAxios.post.mockResolvedValue({ data: mockResponse });

      const result = await bulkDeleteWatchlist({
        year: 2024,
        exclude_ids: ['11111111-1111-4111-8111-111111111111'],
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/watchlist/bulk-delete',
        {
          year: 2024,
          exclude_ids: ['11111111-1111-4111-8111-111111111111'],
        },
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
