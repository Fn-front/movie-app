import { renderHook } from '@testing-library/react';

import { useNowShowing } from './useNowShowing';
import { NOW_SHOWING_MONTHS_BACK } from '@/constants';
import type { UseMovieListOptions } from '@/features/movies/hooks/useMovieList';

// --- Mocks ---

const mockUseMovieList = jest.fn();
jest.mock('@/features/movies/hooks/useMovieList', () => ({
  useMovieList: (options: UseMovieListOptions) => mockUseMovieList(options),
}));

// --- Helpers ---

function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getExpectedDateRange() {
  const now = new Date();
  const pastDate = new Date(now);
  pastDate.setMonth(pastDate.getMonth() - NOW_SHOWING_MONTHS_BACK);

  return {
    gte: formatDateToString(pastDate),
    lte: formatDateToString(now),
  };
}

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

  it('defaultDateRange.gteに2ヶ月前の日付が設定される', () => {
    renderHook(() => useNowShowing());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    const expected = getExpectedDateRange();
    expect(options.defaultDateRange.gte).toBe(expected.gte);
  });

  it('defaultDateRange.lteに今日の日付が設定される', () => {
    renderHook(() => useNowShowing());

    const options = mockUseMovieList.mock.calls[0][0] as UseMovieListOptions;
    const expected = getExpectedDateRange();
    expect(options.defaultDateRange.lte).toBe(expected.lte);
  });

  it('useMovieListの返り値をそのまま返す', () => {
    const mockReturn = { movies: [], isLoading: false };
    mockUseMovieList.mockReturnValue(mockReturn);

    const { result } = renderHook(() => useNowShowing());
    expect(result.current).toBe(mockReturn);
  });
});
