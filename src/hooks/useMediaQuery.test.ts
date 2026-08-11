import { renderHook, act } from '@testing-library/react';

import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('クエリがマッチする場合trueを返す', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('クエリがマッチしない場合falseを返す', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('境界値: unmount 時に removeEventListener が呼ばれる（メモリリーク防止）', () => {
    const removeEventListener = jest.fn();
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener,
    }));

    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('境界値: change イベント発火時に state が更新される', () => {
    let changeHandler: (() => void) | null = null;
    let currentMatches = false;

    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      get matches() {
        return currentMatches;
      },
      media: query,
      addEventListener: (event: string, cb: () => void) => {
        if (event === 'change') changeHandler = cb;
      },
      removeEventListener: jest.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(result.current).toBe(false);

    // メディアクエリの状態変化を模擬
    currentMatches = true;
    // useSyncExternalStore は subscribe callback で更新をトリガー
    act(() => {
      changeHandler?.();
    });

    expect(result.current).toBe(true);
  });

  it('境界値: クエリ文字列変更で新しい matchMedia が呼ばれる', () => {
    const matchMediaMock = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    window.matchMedia = matchMediaMock;

    const { rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: '(max-width: 768px)' } },
    );

    matchMediaMock.mockClear();

    rerender({ query: '(min-width: 1024px)' });

    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1024px)');
  });
});
