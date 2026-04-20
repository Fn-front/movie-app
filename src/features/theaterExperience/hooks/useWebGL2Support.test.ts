/**
 * useWebGL2Support フック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';

import { useWebGL2Support } from './useWebGL2Support';

describe('useWebGL2Support', () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('WebGL2対応環境ではisSupportedがtrueになる', async () => {
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: (contextId: string) => {
            if (contextId === 'webgl2') return {};
            return null;
          },
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const { result } = renderHook(() => useWebGL2Support());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isSupported).toBe(true);
  });

  it('WebGL2非対応環境ではisSupportedがfalseになる', async () => {
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: () => null,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    const { result } = renderHook(() => useWebGL2Support());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isSupported).toBe(false);
  });

  it('例外発生時はisSupportedがfalseになる', async () => {
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        throw new Error('Canvas not available');
      }
      return originalCreateElement(tag);
    });

    const { result } = renderHook(() => useWebGL2Support());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isSupported).toBe(false);
  });

  it('チェック完了後はisCheckingがfalseになる', async () => {
    // jsdom環境ではgetContextが未実装のため例外が発生し、catchブロックで処理される
    const { result } = renderHook(() => useWebGL2Support());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });
  });
});
