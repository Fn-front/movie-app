/**
 * useCalendarDialogフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useCalendarDialog } from './useCalendarDialog';

describe('useCalendarDialog', () => {
  it('初期状態ではダイアログも詳細モーダルも閉じている', () => {
    const { result } = renderHook(() => useCalendarDialog());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedMovieId).toBeNull();
  });

  it('openCalendarでダイアログが開く', () => {
    const { result } = renderHook(() => useCalendarDialog());

    act(() => {
      result.current.openCalendar();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('映画を選ぶとダイアログが閉じて詳細モーダルが開く', () => {
    const { result } = renderHook(() => useCalendarDialog());

    act(() => {
      result.current.openCalendar();
    });

    act(() => {
      result.current.selectMovie(123);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedMovieId).toBe(123);
  });

  it('詳細モーダルを閉じると選択映画がクリアされる', () => {
    const { result } = renderHook(() => useCalendarDialog());

    act(() => {
      result.current.selectMovie(123);
    });

    act(() => {
      result.current.closeMovieDetail();
    });

    expect(result.current.selectedMovieId).toBeNull();
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
