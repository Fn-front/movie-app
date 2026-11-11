import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, renderHook } from '@testing-library/react';

import { STORAGE_KEYS } from '@/constants';
import { DEFAULT_MOVIE_VIEW_MODE, useMovieViewMode } from './useMovieViewMode';

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

  // 別タブでの変更は storage イベントで届く
  describe('別タブからの変更', () => {
    const dispatchStorage = (key: string | null, newValue: string | null) => {
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
      });
    };

    it('別タブで切り替えると追従する', () => {
      const { result } = renderHook(() => useMovieViewMode());

      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');
      dispatchStorage(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

      expect(result.current.viewMode).toBe('list');
    });

    it('別タブで localStorage をクリアすると既定へ戻る', () => {
      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');
      const { result } = renderHook(() => useMovieViewMode());
      expect(result.current.viewMode).toBe('list');

      localStorage.clear();
      // clear() の storage イベントは key が null で届く
      dispatchStorage(null, null);

      expect(result.current.viewMode).toBe('grid');
    });

    it('無関係なキーの変更では再読み込みしない', () => {
      const { result } = renderHook(() => useMovieViewMode());

      // 値だけ先に書き換えてから、別キーのイベントを投げる。
      // フィルタが効いていれば表示は既定のまま
      localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');
      dispatchStorage('movie-app:unrelated-key', 'whatever');

      expect(result.current.viewMode).toBe('grid');
    });
  });

  // 静的プリレンダした HTML は常にグリッド。サーバー側が保存値を返すと
  // ハイドレーションが食い違う
  it('サーバー描画では保存値によらず既定になる', () => {
    localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

    const Probe = () => {
      const { viewMode } = useMovieViewMode();
      return createElement('span', null, viewMode);
    };

    expect(renderToStaticMarkup(createElement(Probe))).toBe(
      `<span>${DEFAULT_MOVIE_VIEW_MODE}</span>`,
    );
  });

  it('localStorage の読み出しが例外を投げても落ちない', () => {
    // Cookie 遮断環境では getItem 自体が throw する。
    // 描画中に投げるのでエラーバウンダリまで飛ぶ
    const spy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });

    const { result } = renderHook(() => useMovieViewMode());

    expect(result.current.viewMode).toBe('grid');

    spy.mockRestore();
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
