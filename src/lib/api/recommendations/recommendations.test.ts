/**
 * レコメンドAPIクライアント テスト
 */

import { axiosInstance } from '@/lib/axios/axios';

import { getRecommendationsApi } from './recommendations';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
  },
}));

const mockGet = axiosInstance.get as jest.Mock;

describe('getRecommendationsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('レコメンド一覧を取得できる', async () => {
    const mockResponse = {
      data: {
        success: true,
        data: {
          recommendations: [
            {
              id: 'rec-1',
              tmdb_movie_id: 100,
              title: 'メッセージ',
              poster_path: '/arrival.jpg',
              release_date: '2016-11-11',
              vote_average: 7.9,
              genre_ids: [878],
              reason: 'SF好きにおすすめ',
              display_order: 1,
            },
          ],
          generated_at: '2026-03-15T03:00:00Z',
        },
      },
    };

    mockGet.mockResolvedValue(mockResponse);

    const result = await getRecommendationsApi();

    expect(mockGet).toHaveBeenCalledWith('/api/recommendations');
    expect(result.success).toBe(true);
    expect(result.data.recommendations).toHaveLength(1);
    expect(result.data.generated_at).toBe('2026-03-15T03:00:00Z');
  });

  it('レコメンドが空の場合、空配列を返す', async () => {
    const mockResponse = {
      data: {
        success: true,
        data: {
          recommendations: [],
          generated_at: null,
        },
      },
    };

    mockGet.mockResolvedValue(mockResponse);

    const result = await getRecommendationsApi();

    expect(result.data.recommendations).toHaveLength(0);
    expect(result.data.generated_at).toBeNull();
  });

  it('APIエラー時に例外をスローする', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(getRecommendationsApi()).rejects.toThrow('Network error');
  });
});
