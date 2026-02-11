import { renderHook } from '@testing-library/react';

import { useUpcoming } from './useUpcoming';
import type { UseMovieListOptions } from '@/features/movies/hooks/useMovieList';

// --- Mocks ---

const mockUseMovieList = jest.fn();
jest.mock('@/features/movies/hooks/useMovieList', () => ({
  useMovieList: (options: UseMovieListOptions) => mockUseMovieList(options),
}));

// --- Helpers ---

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Tests ---

describe('useUpcoming', () => {
  beforeEach(() => {
    mockUseMovieList.mockReturnValue({});
  });

  it('useMovieListにtimeFrame="upcoming"を渡す', () => {
    renderHook(() => useUpcoming());

    expect(mockUseMovieList).toHaveBeenCalledWith(
      expect.objectContaining({ timeFrame: 'upcoming' }),
    );
  });

  it('defaultDateRange.gteに今日の日付が設定される', () => {
    renderHook(() => useUpcoming());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    expect(options.defaultDateRange.gte).toBe(getTodayString());
  });

  it('defaultDateRange.lteは設定されない', () => {
    renderHook(() => useUpcoming());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    expect(options.defaultDateRange.lte).toBeUndefined();
  });

  it('defaultSortOrderは設定されない', () => {
    renderHook(() => useUpcoming());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    expect(options.defaultSortOrder).toBeUndefined();
  });

  it('useMovieListの返り値をそのまま返す', () => {
    const mockReturn = { movies: [], isLoading: false };
    mockUseMovieList.mockReturnValue(mockReturn);

    const { result } = renderHook(() => useUpcoming());
    expect(result.current).toBe(mockReturn);
  });
});
