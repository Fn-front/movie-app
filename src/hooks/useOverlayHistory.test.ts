import { act, renderHook } from '@testing-library/react';

import { useOverlayHistory } from './useOverlayHistory';

/**
 * 戻る操作を再現する。
 *
 * ブラウザは「履歴ポインタを戻す」→「popstate を発火」の順で動く。
 * jsdom の `history.back()` は非同期かつ length を減らさないため、
 * 観測対象である popstate だけを直接起こす。
 */
function dispatchPopState(): void {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

describe('useOverlayHistory', () => {
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    window.history.replaceState(null, '', '/movies/now-showing');
    // 実際に戻すと jsdom の履歴ポインタが動いてテスト間で干渉するため、
    // 「エントリを畳んだか」は呼び出しの有無で見る
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    backSpy.mockRestore();
  });

  it('開くと履歴エントリを1つ積む', () => {
    const before = window.history.length;

    renderHook(() => useOverlayHistory(true, jest.fn()));

    expect(window.history.length).toBe(before + 1);
  });

  it('閉じているあいだは履歴を積まない', () => {
    const before = window.history.length;

    renderHook(() => useOverlayHistory(false, jest.fn()));

    expect(window.history.length).toBe(before);
  });

  it('URL は変えない（オーバーレイは共有対象ではない）', () => {
    renderHook(() => useOverlayHistory(true, jest.fn()));

    expect(window.location.pathname).toBe('/movies/now-showing');
  });

  it('戻ると onClose を呼ぶ', () => {
    const onClose = jest.fn();
    renderHook(() => useOverlayHistory(true, onClose));

    dispatchPopState();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('戻って閉じたときは履歴を二重に消費しない', () => {
    const onClose = jest.fn();
    const { rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, onClose),
      { initialProps: { open: true } },
    );

    dispatchPopState();
    // onClose を受けて呼び出し側が閉じる
    act(() => rerender({ open: false }));

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('× やEscで閉じたときは積んだエントリを自分で畳む', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, jest.fn()),
      { initialProps: { open: true } },
    );

    act(() => result.current.notifyDismissed());
    act(() => rerender({ open: false }));

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('アプリ側が閉じたときは畳まない（URL更新や遷移を取り消さない）', () => {
    // フィルターの「適用」のように、閉じると同時に router が URL を変える経路。
    // ここで畳むと非同期の history.back() がその更新を打ち消す
    const { rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, jest.fn()),
      { initialProps: { open: true } },
    );

    act(() => rerender({ open: false }));

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('入れ子のとき、戻るは最前面のオーバーレイだけを閉じる', () => {
    const closeOuter = jest.fn();
    const closeInner = jest.fn();

    renderHook(() => useOverlayHistory(true, closeOuter));
    renderHook(() => useOverlayHistory(true, closeInner));

    dispatchPopState();

    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('onClose の参照が変わっても履歴を積み直さない', () => {
    const before = window.history.length;
    const { rerender } = renderHook(
      ({ onClose }: { onClose: () => void }) =>
        useOverlayHistory(true, onClose),
      { initialProps: { onClose: jest.fn() } },
    );

    act(() => rerender({ onClose: jest.fn() }));

    expect(window.history.length).toBe(before + 1);
  });

  it('ユーザーが閉じていても、ルーターが先に遷移していれば畳まない', () => {
    const { result, unmount } = renderHook(() =>
      useOverlayHistory(true, jest.fn()),
    );

    act(() => result.current.notifyDismissed());
    // ルーターが遷移し、自分が積んだエントリはもう最前面ではない
    act(() => {
      window.history.pushState({ router: 'next' }, '', '/person/500');
    });
    act(() => unmount());

    expect(backSpy).not.toHaveBeenCalled();
  });
});
