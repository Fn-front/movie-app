import { renderHook } from '@testing-library/react';

import { useUpcoming } from './useUpcoming';
import type { UseMovieListOptions } from '@/features/movies/hooks/useMovieList';

// --- Mocks ---

const mockUseMovieList = jest.fn();
jest.mock('@/features/movies/hooks/useMovieList', () => ({
  useMovieList: (options: UseMovieListOptions) => mockUseMovieList(options),
}));

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

  it('defaultDateRangeが空オブジェクトである（サーバー側で日付デフォルト処理）', () => {
    renderHook(() => useUpcoming());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    expect(options.defaultDateRange).toEqual({});
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
