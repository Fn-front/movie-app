/**
 * useShowFinancialInfoカスタムフックのテスト
 *
 * 予算・興行収入の出し分けは、以前 useMovieListContent が一覧カードの
 * データから決めていた。URLを持つルートへ移った後は詳細データだけが
 * 手がかりになるため、判定をこのフックへ移している（#1033）。
 */

import { renderHook } from '@testing-library/react';

import type { MovieDetail } from '@/lib/types';

import { useShowFinancialInfo } from './useShowFinancialInfo';

const mockUseMovieDetail = jest.fn();

jest.mock('@/features/movies/hooks/useMovieDetail', () => ({
  useMovieDetail: (movieId: number | null) => mockUseMovieDetail(movieId),
}));

const setMovie = (movie: Partial<MovieDetail> | undefined) => {
  mockUseMovieDetail.mockReturnValue({
    movie,
    isLoading: false,
    isError: false,
  });
};

describe('useShowFinancialInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('公開済みならtrueを返す', () => {
    setMovie({ release_date: '2020-01-01' });

    const { result } = renderHook(() => useShowFinancialInfo(42));

    expect(result.current).toBe(true);
  });

  it('未公開ならfalseを返す', () => {
    setMovie({ release_date: '2099-12-31' });

    const { result } = renderHook(() => useShowFinancialInfo(42));

    expect(result.current).toBe(false);
  });

  // 「未公開である確証が無いなら公開済み扱い」にする isMovieReleased とは
  // 判定を分ける。守りたいのは未確定の数字を出さないこと
  it('公開日が無ければfalseを返す', () => {
    setMovie({ release_date: null as unknown as string });

    const { result } = renderHook(() => useShowFinancialInfo(42));

    expect(result.current).toBe(false);
  });

  it('取得前はfalseを返す', () => {
    setMovie(undefined);

    const { result } = renderHook(() => useShowFinancialInfo(42));

    expect(result.current).toBe(false);
  });

  it('渡された映画IDで詳細を引く', () => {
    setMovie({ release_date: '2020-01-01' });

    renderHook(() => useShowFinancialInfo(550));

    expect(mockUseMovieDetail).toHaveBeenCalledWith(550);
  });
});
