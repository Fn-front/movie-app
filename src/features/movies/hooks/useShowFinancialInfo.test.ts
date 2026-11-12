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

  /**
   * リバイバル上映（`is_revival`）を別途判定しないことの固定
   *
   * 一覧カードの `release_date` は「日本での再上映日」で未来になるが、
   * **映画詳細が返すのは元の公開日**なので過去日が入る（実測:
   * アメリ=2001-04-25 / 南極料理人=2009-08-08 に対し一覧は 2026-11-13）。
   * この前提が崩れると、リバイバル作品で予算・興行収入が消える。
   */
  it('リバイバル作品（詳細は元の公開日）でもtrueを返す', () => {
    setMovie({ release_date: '2001-04-25' });

    const { result } = renderHook(() => useShowFinancialInfo(194));

    expect(result.current).toBe(true);
  });

  // 「未公開である確証が無いなら公開済み扱い」にする isMovieReleased とは
  // 判定を分ける。守りたいのは未確定の数字を出さないこと。
  // ⚠️ モーダル時代は release_date が無くても is_revival なら true だったが、
  //    詳細データに is_revival は無く、リバイバルは上のとおり公開日が入るので
  //    この分岐には到達しない
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
