import { renderHook, act } from '@testing-library/react';

import { ANIMATION } from '@/constants';

import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.clearToasts();
    });
  });

  it('初期状態はtoastsが空配列', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toEqual([]);
  });

  it('toast()でトーストが追加される', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({
        title: 'テストタイトル',
        description: 'テスト説明',
        variant: 'success',
      });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      title: 'テストタイトル',
      description: 'テスト説明',
      variant: 'success',
    });
  });

  it('removeToast(id)で指定トーストが削除される', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'トースト1' });
      result.current.toast({ title: 'トースト2' });
    });

    expect(result.current.toasts).toHaveLength(2);

    const idToRemove = result.current.toasts[0].id;

    act(() => {
      result.current.removeToast(idToRemove);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('トースト2');
  });

  it('clearToasts()で全トーストが削除される', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'トースト1' });
      result.current.toast({ title: 'トースト2' });
      result.current.toast({ title: 'トースト3' });
    });

    expect(result.current.toasts).toHaveLength(3);

    act(() => {
      result.current.clearToasts();
    });

    expect(result.current.toasts).toEqual([]);
  });

  it("デフォルトvariantは'info'", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'テスト' });
    });

    expect(result.current.toasts[0].variant).toBe('info');
  });

  it('デフォルトdurationはANIMATION.TOAST_DURATION', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'テスト' });
    });

    expect(result.current.toasts[0].duration).toBe(ANIMATION.TOAST_DURATION);
  });
});
