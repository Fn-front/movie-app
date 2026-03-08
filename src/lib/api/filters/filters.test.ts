/**
 * フィルターAPIクライアントのテスト
 */

import { axiosInstance } from '@/lib/axios/axios';
import { getSavedFilter, saveFilter } from './filters';
import type { FilterConditions } from '@/schema/filters';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

describe('filters API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSavedFilter', () => {
    it('保存済みフィルター条件を取得できる', async () => {
      const mockConditions: FilterConditions = {
        sort_by: 'popularity',
        release_type: 'streaming',
        genre_ids: [28, 12],
        date_range_gte: '2026-03-01',
        date_range_lte: '2026-06-30',
        is_revival: true,
      };

      mockedAxios.get.mockResolvedValue({
        data: {
          success: true,
          data: { filter_conditions: mockConditions },
        },
      });

      const result = await getSavedFilter();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/filters');
      expect(result).toEqual(mockConditions);
    });

    it('未保存の場合、空オブジェクトを返す', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          success: true,
          data: { filter_conditions: {} },
        },
      });

      const result = await getSavedFilter();

      expect(result).toEqual({});
    });

    it('APIエラー時にエラーをスローする', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(getSavedFilter()).rejects.toThrow('Network Error');
    });
  });

  describe('saveFilter', () => {
    it('フィルター条件を保存できる', async () => {
      const conditions: FilterConditions = {
        sort_by: 'popularity',
        genre_ids: [28],
        is_revival: false,
      };

      mockedAxios.put.mockResolvedValue({
        data: { success: true },
      });

      await saveFilter(conditions);

      expect(mockedAxios.put).toHaveBeenCalledWith('/api/filters', conditions);
    });

    it('空のフィルター条件を保存できる', async () => {
      mockedAxios.put.mockResolvedValue({
        data: { success: true },
      });

      await saveFilter({});

      expect(mockedAxios.put).toHaveBeenCalledWith('/api/filters', {});
    });

    it('APIエラー時にエラーをスローする', async () => {
      mockedAxios.put.mockRejectedValue(new Error('Server Error'));

      await expect(
        saveFilter({ sort_by: 'popularity' }),
      ).rejects.toThrow('Server Error');
    });
  });
});
