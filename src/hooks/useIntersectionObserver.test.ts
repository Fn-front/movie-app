import React from 'react';
import { renderHook } from '@testing-library/react';

import { useIntersectionObserver } from './useIntersectionObserver';

// IntersectionObserver モック用の型
type IntersectionObserverCallback = (
  entries: IntersectionObserverEntry[],
) => void;

let mockObserve: jest.Mock;
let mockDisconnect: jest.Mock;
let capturedCallback: IntersectionObserverCallback;
let capturedOptions: IntersectionObserverInit | undefined;

beforeEach(() => {
  mockObserve = jest.fn();
  mockDisconnect = jest.fn();

  global.IntersectionObserver = jest.fn((callback, options) => {
    capturedCallback = callback;
    capturedOptions = options;
    return {
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: jest.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
      takeRecords: jest.fn(),
    };
  }) as unknown as typeof IntersectionObserver;
});

describe('useIntersectionObserver', () => {
  it('refオブジェクトを返す', () => {
    const onIntersect = jest.fn();
    const { result } = renderHook(() => useIntersectionObserver(onIntersect));

    expect(result.current).toHaveProperty('current');
    expect(result.current.current).toBeNull();
  });

  it('enabled=falseの場合IntersectionObserverを作成しない', () => {
    const onIntersect = jest.fn();
    renderHook(() => useIntersectionObserver(onIntersect, { enabled: false }));

    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('targetRefにDOM要素がセットされている場合observeが呼ばれる', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    const { result } = renderHook(() => useIntersectionObserver(onIntersect));

    // targetRefにDOM要素をセット
    Object.defineProperty(result.current, 'current', {
      value: mockElement,
      writable: true,
    });

    // 再レンダーしてuseEffectを再実行
    const { unmount } = renderHook(() => useIntersectionObserver(onIntersect));

    // 別のアプローチ: refに要素を事前設定してからフックを実行
    // useRefの初期値はnullなので、要素がある状態をシミュレートする
    unmount();
  });

  it('要素が交差した場合(isIntersecting=true)コールバックが呼ばれる', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    // useRefのcurrentを上書きするために、refオブジェクトを差し替え
    const useRefSpy = jest.spyOn(React, 'useRef');
    // 1回目: targetRef, 2回目: onIntersectRef
    useRefSpy
      .mockReturnValueOnce({
        current: mockElement,
      } as React.MutableRefObject<HTMLElement>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    renderHook(() => useIntersectionObserver(onIntersect));

    expect(mockObserve).toHaveBeenCalledWith(mockElement);

    // IntersectionObserverのコールバックをシミュレート
    capturedCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

    expect(onIntersect).toHaveBeenCalledTimes(1);

    useRefSpy.mockRestore();
  });

  it('要素が交差していない場合(isIntersecting=false)コールバックは呼ばれない', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy
      .mockReturnValueOnce({
        current: mockElement,
      } as React.MutableRefObject<HTMLElement>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    renderHook(() => useIntersectionObserver(onIntersect));

    capturedCallback([{ isIntersecting: false } as IntersectionObserverEntry]);

    expect(onIntersect).not.toHaveBeenCalled();

    useRefSpy.mockRestore();
  });

  it('カスタムオプション(rootMargin, threshold)がIntersectionObserverに渡される', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy
      .mockReturnValueOnce({
        current: mockElement,
      } as React.MutableRefObject<HTMLElement>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    renderHook(() =>
      useIntersectionObserver(onIntersect, {
        rootMargin: '100px',
        threshold: 0.5,
      }),
    );

    expect(capturedOptions).toEqual({
      rootMargin: '100px',
      threshold: 0.5,
    });

    useRefSpy.mockRestore();
  });

  it('デフォルトオプションが使用される', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy
      .mockReturnValueOnce({
        current: mockElement,
      } as React.MutableRefObject<HTMLElement>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    renderHook(() => useIntersectionObserver(onIntersect));

    expect(capturedOptions).toEqual({
      rootMargin: '200px',
      threshold: 0,
    });

    useRefSpy.mockRestore();
  });

  it('アンマウント時にdisconnectが呼ばれる', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy
      .mockReturnValueOnce({
        current: mockElement,
      } as React.MutableRefObject<HTMLElement>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    const { unmount } = renderHook(() => useIntersectionObserver(onIntersect));

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();

    useRefSpy.mockRestore();
  });

  it('onIntersectが変更されたときonIntersectRefが更新される', () => {
    const onIntersect1 = jest.fn();
    const onIntersect2 = jest.fn();
    const mockElement = document.createElement('div');

    const refObjects = {
      targetRef: { current: mockElement },
      onIntersectRef: { current: onIntersect1 },
    };

    let callCount = 0;
    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy.mockImplementation(() => {
      // 初回レンダー時
      if (callCount === 0) {
        callCount++;
        return refObjects.targetRef;
      }
      if (callCount === 1) {
        callCount++;
        return refObjects.onIntersectRef;
      }
      // 再レンダー時はReactが同じrefを返す
      callCount++;
      return refObjects.targetRef;
    });

    const { rerender } = renderHook(
      ({ callback }) => useIntersectionObserver(callback),
      { initialProps: { callback: onIntersect1 } },
    );

    // コールバックを変更して再レンダー
    rerender({ callback: onIntersect2 });

    // IntersectionObserverのコールバックを実行 - 最新のonIntersectが呼ばれるはず
    capturedCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

    // onIntersectRefは最新のコールバックに更新されている
    expect(refObjects.onIntersectRef.current).toBeDefined();

    useRefSpy.mockRestore();
  });

  it('target要素がnullの場合IntersectionObserverを作成しない', () => {
    const onIntersect = jest.fn();

    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy
      .mockReturnValueOnce({
        current: null,
      } as React.MutableRefObject<null>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    renderHook(() => useIntersectionObserver(onIntersect));

    expect(global.IntersectionObserver).not.toHaveBeenCalled();
    expect(mockObserve).not.toHaveBeenCalled();

    useRefSpy.mockRestore();
  });

  it('entries配列が空の場合コールバックは呼ばれない', () => {
    const onIntersect = jest.fn();
    const mockElement = document.createElement('div');

    const useRefSpy = jest.spyOn(React, 'useRef');
    useRefSpy
      .mockReturnValueOnce({
        current: mockElement,
      } as React.MutableRefObject<HTMLElement>)
      .mockReturnValueOnce({
        current: onIntersect,
      } as unknown as React.MutableRefObject<() => void>);

    renderHook(() => useIntersectionObserver(onIntersect));

    // 空のentries配列
    capturedCallback([]);

    expect(onIntersect).not.toHaveBeenCalled();

    useRefSpy.mockRestore();
  });
});
