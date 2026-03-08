/**
 * useHomeフック テスト
 */

import { renderHook } from '@testing-library/react';

import { useHome } from './useHome';

// --- Mocks ---

const mockUseMovieList = jest.fn().mockReturnValue({
  movies: [],
  isLoading: false,
});

jest.mock('@/features/movies/hooks/useMovieList', () => ({
  useMovieList: (...args: unknown[]) => mockUseMovieList(...args),
}));

// --- Tests ---

describe('useHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('useMovieListをdefaultDateRange: {}で呼び出す', () => {
    renderHook(() => useHome());

    expect(mockUseMovieList).toHaveBeenCalledWith({ defaultDateRange: {} });
  });

  it('useMovieListの返り値をそのまま返す', () => {
    const mockReturn = {
      movies: [{ id: 1 }],
      isLoading: false,
      hasNextPage: true,
    };
    mockUseMovieList.mockReturnValue(mockReturn);

    const { result } = renderHook(() => useHome());

    expect(result.current).toBe(mockReturn);
  });
});
