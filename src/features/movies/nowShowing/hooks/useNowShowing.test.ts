import { renderHook } from '@testing-library/react';

import { useNowShowing } from './useNowShowing';
import type { UseMovieListOptions } from '@/features/movies/hooks/useMovieList';

// --- Mocks ---

const mockUseMovieList = jest.fn();
jest.mock('@/features/movies/hooks/useMovieList', () => ({
  useMovieList: (options: UseMovieListOptions) => mockUseMovieList(options),
}));

// --- Tests ---

describe('useNowShowing', () => {
  beforeEach(() => {
    mockUseMovieList.mockReturnValue({});
  });

  it('useMovieListにtimeFrame="now_showing"を渡す', () => {
    renderHook(() => useNowShowing());

    expect(mockUseMovieList).toHaveBeenCalledWith(
      expect.objectContaining({ timeFrame: 'now_showing' }),
    );
  });

  it('defaultSortOrder="desc"を渡す', () => {
    renderHook(() => useNowShowing());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    expect(options.defaultSortOrder).toBe('desc');
  });

  it('defaultDateRangeが空オブジェクトである（サーバー側でis_now_playingフィルタ）', () => {
    renderHook(() => useNowShowing());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    expect(options.defaultDateRange).toEqual({});
  });

  it('useMovieListの返り値をそのまま返す', () => {
    const mockReturn = { movies: [], isLoading: false };
    mockUseMovieList.mockReturnValue(mockReturn);

    const { result } = renderHook(() => useNowShowing());
    expect(result.current).toBe(mockReturn);
  });
});
