/**
 * useOverlayHistory のテスト
 *
 * ⚠️ 実タイマー前提。`history.back()` の非同期性こそが検証対象（#1041）なので、
 * fake timers は使わない。このファイルに fake timers を持ち込むと、
 * popstate が流れず無言で素通りする。
 */

import { act, cleanup, renderHook } from '@testing-library/react';

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

/**
 * `history.back()` が実ブラウザでするのと同じことを再現する。
 *
 * ブラウザは back() の呼び出しをキューに積み、**非同期に** popstate を出す。
 * ここを同期の no-op にしてしまうと「自分が起こした戻りが自分のリスナーに
 * 届く」経路が一度も走らず、入れ子の取り違え（#1039 と同種の見落とし）を
 * 検出できない。
 */
function installAsyncBack(): jest.SpyInstance {
  return jest.spyOn(window.history, 'back').mockImplementation(() => {
    setTimeout(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, 0);
  });
}

/** キューに積まれた popstate を流す */
async function flushAsyncBack(): Promise<void> {
  await act(async () => {
    // 畳む判断はマイクロタスク後に確定する（引き継ぎの猶予）
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useOverlayHistory', () => {
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    window.history.replaceState(null, '', '/movies/now-showing');
    // 実際に戻すと jsdom の履歴ポインタが動いてテスト間で干渉するため、
    // ポインタは動かさずに popstate だけを実ブラウザと同じ非同期で再現する
    backSpy = installAsyncBack();
  });

  afterEach(async () => {
    // フックはモジュールスコープに状態を持つため、テスト間で持ち越さない。
    // アンマウント時にも履歴を畳むことがあるので、先に unmount させてから
    // キューに残った自分の戻りを消化する（RTL の自動 cleanup はこの
    // afterEach より後に走るため、順序を自分で決める必要がある）
    // act で包まないと unmount の cleanup が後のタスクへ回り、
    // 畳むための back がこの afterEach の外で走って次のテストへ漏れる
    await act(async () => {
      cleanup();
    });
    await flushAsyncBack();
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

  it('戻って閉じたときは履歴を二重に消費しない', async () => {
    const onClose = jest.fn();
    const { rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, onClose),
      { initialProps: { open: true } },
    );

    dispatchPopState();
    // onClose を受けて呼び出し側が閉じる
    act(() => rerender({ open: false }));
    await flushAsyncBack();

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('アプリ側が閉じた場合も畳む（閉じ方で分けない）', async () => {
    // 以前は「ユーザーが閉じたときだけ」に限っていたため、フィルターの
    // 「適用」やナビリンクのようにアプリ側が open を落とす経路で
    // エントリが残り、戻るが空振りした（#1043）
    const { rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, jest.fn()),
      { initialProps: { open: true } },
    );

    act(() => rerender({ open: false }));
    await flushAsyncBack();

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('遷移を申告したときは畳まない（router の URL 更新を取り消さない）', async () => {
    // フィルターの「適用」のように、閉じるのと同時に router.replace が走る経路。
    // router の履歴操作は cleanup の後に効くため、cleanup 時点では自分の
    // エントリがまだ最前面に見える。そのまま畳むと後から届く back が
    // その更新を打ち消す（実測で確認）
    const { result, rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, jest.fn()),
      { initialProps: { open: true } },
    );

    act(() => result.current.notifyNavigating());
    act(() => rerender({ open: false }));
    await flushAsyncBack();

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('開き直すと遷移の申告は持ち越さない', async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, jest.fn()),
      { initialProps: { open: true } },
    );

    act(() => result.current.notifyNavigating());
    act(() => rerender({ open: false }));
    act(() => rerender({ open: true }));
    act(() => rerender({ open: false }));
    await flushAsyncBack();

    // 2回目は普通に閉じただけなので畳む
    expect(backSpy).toHaveBeenCalledTimes(1);
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

  it('入れ子のとき、内側を × で閉じても外側は閉じない', async () => {
    // 内側の cleanup が履歴を畳むために呼ぶ history.back() は非同期。
    // その popstate を自分のリスナーが拾うと、最前面＝外側を閉じてしまう
    const closeOuter = jest.fn();
    const closeInner = jest.fn();

    renderHook(() => useOverlayHistory(true, closeOuter));
    const inner = renderHook(
      ({ open }) => useOverlayHistory(open, closeInner),
      { initialProps: { open: true } },
    );

    act(() => inner.rerender({ open: false }));
    await flushAsyncBack();

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('× で閉じた後に開き直しても、次の戻るを飲み込まない', async () => {
    // 畳むための history.back() は非同期なので、その popstate を
    // 読み飛ばす仕組みが要る。ただし読み飛ばしが次の「本物の戻る」にまで
    // 効いてしまうと、オーバーレイが閉じなくなる
    const first = renderHook(({ open }) => useOverlayHistory(open, jest.fn()), {
      initialProps: { open: true },
    });
    act(() => first.rerender({ open: false }));
    await flushAsyncBack();

    const onCloseSecond = jest.fn();
    renderHook(() => useOverlayHistory(true, onCloseSecond));

    dispatchPopState();

    expect(onCloseSecond).toHaveBeenCalledTimes(1);
  });

  it('自分が積んだエントリが最前面でなければ畳まない', async () => {
    // 入れ子の内側が積んだエントリが最前面に残っているとき、外側が
    // 閉じても畳んではいけない（他人のエントリを消してしまう）。
    // 目印を真偽値で持つと所有者を区別できず、取り違える
    const outer = renderHook(({ open }) => useOverlayHistory(open, jest.fn()), {
      initialProps: { open: true },
    });
    renderHook(() => useOverlayHistory(true, jest.fn()));

    act(() => outer.rerender({ open: false }));
    await flushAsyncBack();

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('前回の目印が履歴に残っていても、それを自分のものとして畳まない', async () => {
    // Next のルーターは state を引き継いで replaceState するため、
    // オーバーレイを開いたままリロードすると目印だけが残りうる
    window.history.replaceState(
      { __overlayHistory: 'overlay-stale' },
      '',
      '/movies/now-showing',
    );

    const { rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, jest.fn()),
      { initialProps: { open: true } },
    );

    // 自分のトークンではなく、前回の残骸が最前面にある状態に戻す
    window.history.replaceState(
      { __overlayHistory: 'overlay-stale' },
      '',
      '/movies/now-showing',
    );

    act(() => rerender({ open: false }));
    await flushAsyncBack();

    expect(backSpy).not.toHaveBeenCalled();
  });

  /**
   * 閉じるのと同時に別のオーバーレイが開く経路。
   *
   * `history.back()` は非同期で、呼んでから解決するまでの間に `pushState`
   * されたエントリは捨てられる。素直に畳むと新しいオーバーレイのエントリが
   * 消え、戻るとページごと離脱する（#1026 の回帰）。
   * 畳むのを1マイクロタスク遅らせ、その間に開いた側が引き継ぐ
   */
  describe('エントリの引き継ぎ', () => {
    it('閉じるのと同時に開くと、積まずに引き継いで back も呼ばない', async () => {
      const pushSpy = jest.spyOn(window.history, 'pushState');
      const replaceSpy = jest.spyOn(window.history, 'replaceState');

      const first = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn()),
        { initialProps: { open: true } },
      );
      expect(pushSpy).toHaveBeenCalledTimes(1);

      pushSpy.mockClear();
      replaceSpy.mockClear();

      // 同じコミットで「1つ目が閉じ、2つ目が開く」を再現する
      act(() => {
        first.rerender({ open: false });
        renderHook(() => useOverlayHistory(true, jest.fn()));
      });
      await flushAsyncBack();

      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).not.toHaveBeenCalled();
      expect(backSpy).not.toHaveBeenCalled();

      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });
  });

  /**
   * オーバーレイ内からの遷移を `replace` にしてよいかの判定。
   *
   * `open` で代用すると、エントリが無いときに replace して
   * **利用者の実ページ**を消す（実測で確認）
   */
  describe('shouldReplaceNavigation', () => {
    it('閉じているあいだは false', () => {
      const { result } = renderHook(() => useOverlayHistory(false, jest.fn()));

      expect(result.current.shouldReplaceNavigation).toBe(false);
    });

    /**
     * `open` で代用すると、エントリを積む effect が走る前の描画でも
     * true になる。その瞬間に遷移すると置き換わるのは実ページのエントリ
     */
    it('開いた直後の最初の描画はまだ false で、エントリを積んでから true になる', () => {
      const seen: boolean[] = [];

      renderHook(() => {
        const handlers = useOverlayHistory(true, jest.fn());
        seen.push(handlers.shouldReplaceNavigation);
        return handlers;
      });

      expect(seen[0]).toBe(false);
      expect(seen[seen.length - 1]).toBe(true);
    });

    it('閉じたら false に戻る', async () => {
      const { result, rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn()),
        { initialProps: { open: true } },
      );
      expect(result.current.shouldReplaceNavigation).toBe(true);

      act(() => rerender({ open: false }));
      await flushAsyncBack();

      expect(result.current.shouldReplaceNavigation).toBe(false);
    });
  });

  it('単独のとき、閉じた後の戻るで余計に閉じない', async () => {
    const onClose = jest.fn();
    const { rerender } = renderHook(
      ({ open }) => useOverlayHistory(open, onClose),
      { initialProps: { open: true } },
    );

    act(() => rerender({ open: false }));
    await flushAsyncBack();

    expect(onClose).not.toHaveBeenCalled();
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

  it('ルーターが先に遷移していれば畳まない', async () => {
    const { unmount } = renderHook(() => useOverlayHistory(true, jest.fn()));

    // ルーターが遷移し、自分が積んだエントリはもう最前面ではない
    act(() => {
      window.history.pushState({ router: 'next' }, '', '/person/500');
    });
    act(() => unmount());
    await flushAsyncBack();

    expect(backSpy).not.toHaveBeenCalled();
  });
});
