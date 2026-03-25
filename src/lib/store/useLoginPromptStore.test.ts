/**
 * useLoginPromptStore テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useLoginPromptStore } from './useLoginPromptStore';

describe('useLoginPromptStore', () => {
  beforeEach(() => {
    act(() => {
      useLoginPromptStore.getState().close();
    });
  });

  it('初期状態ではモーダルが閉じている', () => {
    const { result } = renderHook(() => useLoginPromptStore());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.message).toBe('');
  });

  it('openでモーダルが開きメッセージが設定される', () => {
    const { result } = renderHook(() => useLoginPromptStore());

    act(() => {
      result.current.open('ログインが必要です。');
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.message).toBe('ログインが必要です。');
  });

  it('closeでモーダルが閉じメッセージがクリアされる', () => {
    const { result } = renderHook(() => useLoginPromptStore());

    act(() => {
      result.current.open('テストメッセージ');
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.message).toBe('');
  });

  it('openを連続呼び出しでメッセージが上書きされる', () => {
    const { result } = renderHook(() => useLoginPromptStore());

    act(() => {
      result.current.open('メッセージ1');
    });
    act(() => {
      result.current.open('メッセージ2');
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.message).toBe('メッセージ2');
  });
});
