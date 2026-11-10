import { renderHook, act } from '@testing-library/react';

import { ANIMATION } from '@/constants';

import { useToast, useToastDispatch } from './useToast';

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

// 出すだけの呼び出し側が一覧を購読すると、アプリ内のどこでトーストが
// 出ても再レンダリングされる。memo では止まらない（原因が props ではなく
// 自身のフック購読のため / #939）
describe('useToastDispatch', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.clearToasts();
    });
  });

  it('toast()でトーストが追加される', () => {
    const { result: dispatch } = renderHook(() => useToastDispatch());
    const { result: list } = renderHook(() => useToast());

    act(() => {
      dispatch.current.toast({ title: '送出テスト', variant: 'success' });
    });

    expect(list.current.toasts).toHaveLength(1);
    expect(list.current.toasts[0]).toMatchObject({
      title: '送出テスト',
      variant: 'success',
    });
  });

  it('トーストが追加されても再レンダリングされない', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useToastDispatch();
    });

    const before = renderCount;

    act(() => {
      result.current.toast({ title: 'テスト' });
    });

    expect(renderCount).toBe(before);
  });

  it('トーストが削除されても再レンダリングされない', () => {
    const { result: list } = renderHook(() => useToast());
    act(() => {
      list.current.toast({ title: 'テスト' });
    });

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useToastDispatch();
    });

    const before = renderCount;

    act(() => {
      result.current.removeToast(list.current.toasts[0].id);
    });

    expect(renderCount).toBe(before);
  });

  // 上の2件が「購読していないこと」を示すには、購読する側が実際に
  // 再レンダリングされることとの対比が要る
  it('対比: useToast はトースト追加で再レンダリングされる', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useToast();
    });

    const before = renderCount;

    act(() => {
      result.current.toast({ title: 'テスト' });
    });

    expect(renderCount).toBeGreaterThan(before);
  });

  it('返す関数は再レンダリングをまたいで同一参照', () => {
    const { result, rerender } = renderHook(() => useToastDispatch());

    const first = result.current;
    rerender();

    expect(result.current.toast).toBe(first.toast);
    expect(result.current.removeToast).toBe(first.removeToast);
    expect(result.current.clearToasts).toBe(first.clearToasts);
  });
});
