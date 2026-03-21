/**
 * 受賞作品APIクライアント テスト
 */

import { axiosInstance } from '@/lib/axios/axios';

import { getAwards } from './awards';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
  },
}));

const mockGet = axiosInstance.get as jest.Mock;

describe('getAwards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('指定年度の受賞作品データを取得する', async () => {
    const mockData = {
      year: 2026,
      availableYears: [2026],
      awards: [
        {
          awardName: 'academy_awards',
          label: 'アカデミー賞',
          categories: [],
        },
      ],
    };

    mockGet.mockResolvedValue({
      data: { success: true, data: mockData },
    });

    const result = await getAwards(2026);

    expect(result).toEqual(mockData);
    expect(mockGet).toHaveBeenCalledWith('/api/awards', {
      params: { year: 2026 },
    });
  });

  it('yearパラメータがクエリに含まれる', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { year: 2025, availableYears: [2025], awards: [] },
      },
    });

    await getAwards(2025);

    expect(mockGet).toHaveBeenCalledWith('/api/awards', {
      params: { year: 2025 },
    });
  });

  it('APIエラー時は例外がスローされる', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(getAwards(2026)).rejects.toThrow('Network error');
  });
});
