/**
 * useRecommendationsフックのテスト
 */

import { renderHook } from '@testing-library/react';

import { useRecommendations } from './useRecommendations';

// --- Mocks ---
jest.mock('@/lib/api/recommendations/recommendations', () => ({
  getRecommendationsApi: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

describe('useRecommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('レコメンド一覧を返す', () => {
    const mockRecs = [
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
    ];

    mockUseQuery.mockReturnValue({
      data: {
        data: {
          recommendations: mockRecs,
          generated_at: '2026-03-15T03:00:00Z',
        },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.recommendations).toEqual(mockRecs);
    expect(result.current.generatedAt).toBe('2026-03-15T03:00:00Z');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('ローディング中はisLoadingがtrue', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.recommendations).toEqual([]);
    expect(result.current.generatedAt).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('エラー時はisErrorがtrue', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.recommendations).toEqual([]);
    expect(result.current.isError).toBe(true);
  });

  it('データがundefinedの場合は空配列とnullを返す', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.recommendations).toEqual([]);
    expect(result.current.generatedAt).toBeNull();
  });

  it('staleTimeとgcTimeが1時間に設定されている', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    renderHook(() => useRecommendations());

    const queryOptions = mockUseQuery.mock.calls[0][0];
    expect(queryOptions.staleTime).toBe(60 * 60 * 1000);
    expect(queryOptions.gcTime).toBe(60 * 60 * 1000);
  });
});
