/**
 * useMovieDetailModal テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useMovieDetailModal } from './useMovieDetailModal';

const mockItems = [
  { id: 1, title: '映画A' },
  { id: 2, title: '映画B' },
  { id: 3, title: '映画C' },
];

describe('useMovieDetailModal', () => {
  it('初期状態ではselectedMovieIdがnullである', () => {
    const { result } = renderHook(() => useMovieDetailModal(mockItems));

    expect(result.current.selectedMovieId).toBeNull();
    expect(result.current.selectedMovieTitle).toBeUndefined();
  });

  it('handleMovieClickで映画を選択できる', () => {
    const { result } = renderHook(() => useMovieDetailModal(mockItems));

    act(() => {
      result.current.handleMovieClick(2);
    });

    expect(result.current.selectedMovieId).toBe(2);
    expect(result.current.selectedMovieTitle).toBe('映画B');
  });

  it('handleModalCloseで選択をクリアできる', () => {
    const { result } = renderHook(() => useMovieDetailModal(mockItems));

    act(() => {
      result.current.handleMovieClick(1);
    });
    expect(result.current.selectedMovieId).toBe(1);

    act(() => {
      result.current.handleModalClose();
    });
    expect(result.current.selectedMovieId).toBeNull();
    expect(result.current.selectedMovieTitle).toBeUndefined();
  });

  it('存在しないIDを選択した場合はタイトルがundefinedになる', () => {
    const { result } = renderHook(() => useMovieDetailModal(mockItems));

    act(() => {
      result.current.handleMovieClick(999);
    });

    expect(result.current.selectedMovieId).toBe(999);
    expect(result.current.selectedMovieTitle).toBeUndefined();
  });

  it('空の配列でも正常に動作する', () => {
    const { result } = renderHook(() => useMovieDetailModal([]));

    act(() => {
      result.current.handleMovieClick(1);
    });

    expect(result.current.selectedMovieId).toBe(1);
    expect(result.current.selectedMovieTitle).toBeUndefined();
  });
});
