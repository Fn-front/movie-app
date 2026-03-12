/**
 * 検索APIクライアントのテスト
 */

import { axiosInstance } from '@/lib/axios/axios';
import { searchMoviesApi } from './search';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

describe('searchMoviesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockResponse = {
    success: true,
    data: {
      movies: [
        {
          id: 1,
          title: 'テスト映画',
          original_title: 'Test Movie',
          overview: 'テスト概要',
          poster_path: '/test.jpg',
          backdrop_path: '/backdrop.jpg',
          release_date: '2024-01-01',
          vote_average: 7.5,
          vote_count: 100,
          popularity: 50,
          genre_ids: [28, 12],
          adult: false,
          original_language: 'ja',
        },
      ],
      pagination: {
        page: 1,
        totalPages: 5,
        totalResults: 100,
        isServerFiltered: false,
      },
    },
  };

  it('検索パラメータを正しくAPIに渡す', async () => {
    mockedAxios.get.mockResolvedValue({ data: mockResponse });

    const params = {
      query: 'テスト',
      page: 2,
      genre: '28,12',
      year: 2024,
      vote_average_gte: 7.0,
    };

    const result = await searchMoviesApi(params);

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies/search', {
      params,
      signal: undefined,
    });
    expect(result).toEqual(mockResponse);
  });

  it('AbortSignalを渡せる', async () => {
    mockedAxios.get.mockResolvedValue({ data: mockResponse });

    const controller = new AbortController();
    await searchMoviesApi({ query: 'テスト' }, { signal: controller.signal });

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/movies/search', {
      params: { query: 'テスト' },
      signal: controller.signal,
    });
  });

  it('APIエラー時にエラーをスローする', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(searchMoviesApi({ query: 'テスト' })).rejects.toThrow(
      'Network Error',
    );
  });
});
