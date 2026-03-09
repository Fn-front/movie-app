import { renderHook, act } from '@testing-library/react';

import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('初期値を返す', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');
  });

  it('値を更新するとlocalStorageに保存される', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('updated'));
  });

  it('localStorageに既存値がある場合それを返す', () => {
    localStorage.setItem('test-key', JSON.stringify('existing'));

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('existing');
  });

  it('削除関数で初期値に戻る＆localStorageから削除', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    // まず値を更新
    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('updated'));

    // 削除関数を呼び出し
    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe('initial');
    expect(localStorage.getItem('test-key')).toBeNull();
  });

  it('関数型更新が動作する', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);

    act(() => {
      result.current[1]((prev) => prev + 10);
    });

    expect(result.current[0]).toBe(11);
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify(11));
  });

  // --- カバレッジ拡充テスト ---

  it('localStorageのgetItemでエラーが発生した場合、初期値を返す', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage error');
    });

    const { result } = renderHook(() =>
      useLocalStorage('error-key', 'fallback'),
    );

    expect(result.current[0]).toBe('fallback');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error reading localStorage key "error-key":',
      expect.any(Error),
    );
  });

  it('localStorageのsetItemでエラーが発生した場合、エラーをログに出力する', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    const { result } = renderHook(() =>
      useLocalStorage('error-key', 'initial'),
    );

    act(() => {
      result.current[1]('new-value');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error setting localStorage key "error-key":',
      expect.any(Error),
    );
  });

  it('removeValueでlocalStorageのremoveItemがエラーを投げた場合、エラーをログに出力する', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Remove error');
    });

    const { result } = renderHook(() =>
      useLocalStorage('error-key', 'initial'),
    );

    act(() => {
      result.current[2]();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error removing localStorage key "error-key":',
      expect.any(Error),
    );
  });

  it('他タブからのstorageイベントで値が更新される', () => {
    const { result } = renderHook(() => useLocalStorage('sync-key', 'initial'));

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'sync-key',
        newValue: JSON.stringify('from-other-tab'),
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('from-other-tab');
  });

  it('他タブからのstorageイベントでkeyが異なる場合は無視される', () => {
    const { result } = renderHook(() => useLocalStorage('my-key', 'initial'));

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'other-key',
        newValue: JSON.stringify('should-not-update'),
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('initial');
  });

  it('storageイベントでnewValueがnullの場合は無視される', () => {
    const { result } = renderHook(() => useLocalStorage('null-key', 'initial'));

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'null-key',
        newValue: null,
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('initial');
  });

  it('storageイベントでJSON.parseがエラーを投げた場合、エラーをログに出力する', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() =>
      useLocalStorage('parse-error-key', 'initial'),
    );

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'parse-error-key',
        newValue: 'invalid-json{{{',
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('initial');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error parsing storage event for key "parse-error-key":',
      expect.any(Error),
    );
  });

  it('アンマウント時にstorageイベントリスナーが削除される', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useLocalStorage('cleanup-key', 'initial'),
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'storage',
      expect.any(Function),
    );
  });

  it('オブジェクト型の値を正しく保存・復元できる', () => {
    const initialObj = { name: 'test', count: 0 };

    const { result } = renderHook(() => useLocalStorage('obj-key', initialObj));

    act(() => {
      result.current[1]({ name: 'updated', count: 5 });
    });

    expect(result.current[0]).toEqual({ name: 'updated', count: 5 });
    expect(localStorage.getItem('obj-key')).toBe(
      JSON.stringify({ name: 'updated', count: 5 }),
    );
  });

  it('localStorageに不正なJSONがある場合、初期値を返す', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    localStorage.setItem('bad-json-key', 'not-valid-json{');

    const { result } = renderHook(() =>
      useLocalStorage('bad-json-key', 'default'),
    );

    expect(result.current[0]).toBe('default');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('removeValue時にwindowがundefined相当でもエラーにならない', () => {
    const { result } = renderHook(() =>
      useLocalStorage('remove-ssr-key', 'initial'),
    );

    // removeItemがundefined環境をシミュレート（setStoredValueは動くがlocalStorage操作がスキップされる状態）
    const removeItemSpy = jest
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {});

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe('initial');
    removeItemSpy.mockRestore();
  });

  it('keyが変更されたときstorageイベントリスナーが再登録される', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { rerender } = renderHook(
      ({ storageKey }: { storageKey: string }) =>
        useLocalStorage(storageKey, 'initial'),
      { initialProps: { storageKey: 'key-1' } },
    );

    const firstHandler = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === 'storage',
    )?.[1];

    rerender({ storageKey: 'key-2' });

    // 前のリスナーが削除されている
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'storage',
      firstHandler,
    );
  });
});
