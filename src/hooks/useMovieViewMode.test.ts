import { act, renderHook } from '@testing-library/react';

import { STORAGE_KEYS } from '@/constants';
import { useMovieViewMode } from './useMovieViewMode';

describe('useMovieViewMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('既定はグリッド', () => {
    const { result } = renderHook(() => useMovieViewMode());

    expect(result.current.viewMode).toBe('grid');
  });

  it('保存済みの設定をマウント後に反映する', () => {
    localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

    const { result } = renderHook(() => useMovieViewMode());

    expect(result.current.viewMode).toBe('list');
  });

  it('切り替えると localStorage に保存する', () => {
    const { result } = renderHook(() => useMovieViewMode());

    act(() => result.current.setViewMode('list'));

    expect(localStorage.getItem(STORAGE_KEYS.MOVIE_VIEW_MODE)).toBe('list');
    expect(result.current.viewMode).toBe('list');
  });

  it('別のインスタンスにも即座に反映される', () => {
    // ツールバーのトグルと一覧コンテナは別インスタンスなので、
    // 片方の変更がもう片方へ伝わらないと表示が食い違う
    const toggle = renderHook(() => useMovieViewMode());
    const grid = renderHook(() => useMovieViewMode());

    act(() => toggle.result.current.setViewMode('list'));

    expect(grid.result.current.viewMode).toBe('list');
  });

  it('未知の保存値は既定に倒す', () => {
    localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'something-else');

    const { result } = renderHook(() => useMovieViewMode());

    expect(result.current.viewMode).toBe('grid');
  });

  it('localStorage が使えなくても落ちない', () => {
    // Safari のプライベートモードや Cookie 遮断環境
    const spy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    const { result } = renderHook(() => useMovieViewMode());

    expect(() => act(() => result.current.setViewMode('list'))).not.toThrow();
    // 保存値が唯一の真実源なので、書けない環境では既定のまま
    expect(result.current.viewMode).toBe('grid');

    spy.mockRestore();
  });
});
