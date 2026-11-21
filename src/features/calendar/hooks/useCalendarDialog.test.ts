/**
 * useCalendarDialogフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useCalendarDialog } from './useCalendarDialog';

/**
 * 詳細は URL（`?movie_id=`）で開くようになった（#1077）
 *
 * ⚠️ 実体は `window.history.pushState` を直接叩くので、ここでは呼び出しだけを
 * 観測する。URL の組み立てそのものは `useMovieDetailQuery.test.ts` の担当。
 */
const mockOpenMovieDetail = jest.fn();
jest.mock('@/features/movies/hooks/useMovieDetailQuery', () => ({
  useOpenMovieDetail: () => mockOpenMovieDetail,
}));

describe('useCalendarDialog', () => {
  beforeEach(() => {
    mockOpenMovieDetail.mockClear();
  });

  it('初期状態ではダイアログが閉じている', () => {
    const { result } = renderHook(() => useCalendarDialog());

    expect(result.current.isOpen).toBe(false);
  });

  it('openCalendarでダイアログが開く', () => {
    const { result } = renderHook(() => useCalendarDialog());

    act(() => {
      result.current.openCalendar();
    });

    expect(result.current.isOpen).toBe(true);
  });

  /**
   * ⛔ **詳細はローカル state で持たない**（#1077）
   *
   * 以前はここに `selectedMovieId` を持ち、`AppLayout` が専用のモーダルを
   * 描いていた。そのためカレンダーから開いた詳細だけ URL を持たず、
   * リロードで消え、共有もできなかった。
   */
  it('映画を選ぶとダイアログが閉じて、詳細を URL で開く', () => {
    const { result } = renderHook(() => useCalendarDialog());

    act(() => {
      result.current.openCalendar();
    });

    act(() => {
      result.current.selectMovie(123);
    });

    expect(result.current.isOpen).toBe(false);
    // ⚠️ **置き換える**。カレンダーは自分の履歴エントリを持っており、
    //    push すると閉じる側の畳みと競合して開き直る（#1077 で実測）
    expect(mockOpenMovieDetail).toHaveBeenCalledWith(123, { replace: true });
  });

  it('setOpenでダイアログの開閉を切り替えられる', () => {
    const { result } = renderHook(() => useCalendarDialog());

    act(() => {
      result.current.openCalendar();
    });

    act(() => {
      result.current.setOpen(false);
    });

    expect(result.current.isOpen).toBe(false);
  });
});
