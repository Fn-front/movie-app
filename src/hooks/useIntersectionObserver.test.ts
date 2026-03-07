import { renderHook } from '@testing-library/react';

import { useIntersectionObserver } from './useIntersectionObserver';

// --- Tests ---

describe('useIntersectionObserver', () => {
  it('refオブジェクトを返す', () => {
    const onIntersect = jest.fn();
    const { result } = renderHook(() =>
      useIntersectionObserver(onIntersect),
    );

    expect(result.current).toHaveProperty('current');
    expect(result.current.current).toBeNull();
  });

  it('enabled=falseの場合IntersectionObserverを作成しない', () => {
    const mockObserve = jest.fn();
    const mockDisconnect = jest.fn();
    const OriginalObserver = global.IntersectionObserver;

    global.IntersectionObserver = jest.fn(() => ({
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: jest.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
      takeRecords: jest.fn(),
    })) as unknown as typeof IntersectionObserver;

    const onIntersect = jest.fn();
    renderHook(() =>
      useIntersectionObserver(onIntersect, { enabled: false }),
    );

    expect(mockObserve).not.toHaveBeenCalled();

    global.IntersectionObserver = OriginalObserver;
  });
});
