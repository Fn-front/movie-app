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

  /**
   * 進むで開き直す（#1053）
   *
   * 戻るで閉じても**履歴エントリは消えていない**。進むでそれが復活したとき、
   * 以前は「閉じる」方向にしか解釈しておらず、エントリだけ戻って
   * オーバーレイは閉じたまま＝次の戻るが空振りした。
   *
   * ⚠️ ブラウザの進むは「履歴ポインタを進める（state が入れ替わる）」→
   * 「popstate を発火」の順。state を戻さずに popstate だけ起こしても
   * 実機の再現にならないので、state の入れ替えも再現する。
   */
  describe('進むで開き直す', () => {
    /** 現在のエントリに載っているトークン */
    const currentToken = (): unknown =>
      (window.history.state ?? {})['__overlayHistory'];

    /** 履歴ポインタの移動（state の入れ替え）を再現してから popstate を出す */
    const movePointerTo = (state: unknown): void => {
      act(() => {
        window.history.replaceState(state, '', window.location.href);
      });
      dispatchPopState();
    };

    it('戻るで閉じたあと進むと onReopen を呼ぶ', async () => {
      const onClose = jest.fn();
      const onReopen = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, onClose, onReopen),
        { initialProps: { open: true } },
      );

      const token = currentToken();
      expect(token).toBeTruthy();

      // 戻る: 1つ前のエントリへ（トークンは載っていない）
      movePointerTo(null);
      expect(onClose).toHaveBeenCalledTimes(1);
      rerender({ open: false });
      await flushAsyncBack();

      // 進む: 自分のエントリが復活する
      movePointerTo({ __overlayHistory: token });

      expect(onReopen).toHaveBeenCalledTimes(1);
    });

    it('× で閉じたあと進んでも開き直す（back は前方のエントリを消さない）', async () => {
      const onClose = jest.fn();
      const onReopen = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, onClose, onReopen),
        { initialProps: { open: true } },
      );

      const token = currentToken();

      // × で閉じる（アプリ側が open を false にする）
      rerender({ open: false });
      await flushAsyncBack();
      expect(onClose).not.toHaveBeenCalled();

      movePointerTo({ __overlayHistory: token });

      expect(onReopen).toHaveBeenCalledTimes(1);
    });

    it('開き直しても履歴は増えない', async () => {
      const onReopen = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), onReopen),
        { initialProps: { open: true } },
      );

      const token = currentToken();
      const afterOpen = window.history.length;

      movePointerTo(null);
      rerender({ open: false });
      await flushAsyncBack();

      movePointerTo({ __overlayHistory: token });
      // 呼び出し側が開き直す
      rerender({ open: true });

      // エントリは進むで戻ってきている。積み直すと戻る回数が合わなくなる
      expect(window.history.length).toBe(afterOpen);
      expect(currentToken()).toBe(token);
    });

    it('開き直したあとの戻るで閉じる（空振りしない）', async () => {
      const onClose = jest.fn();
      const onReopen = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, onClose, onReopen),
        { initialProps: { open: true } },
      );

      const token = currentToken();

      movePointerTo(null);
      rerender({ open: false });
      await flushAsyncBack();

      movePointerTo({ __overlayHistory: token });
      rerender({ open: true });

      onClose.mockClear();
      movePointerTo(null);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // onReopen を渡さないオーバーレイは従来どおり。壊れるより何も起きないほうがまし
    it('onReopen を渡していなければ何も起きない', async () => {
      const onClose = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, onClose),
        { initialProps: { open: true } },
      );

      const token = currentToken();

      movePointerTo(null);
      rerender({ open: false });
      await flushAsyncBack();

      onClose.mockClear();
      movePointerTo({ __overlayHistory: token });

      expect(onClose).not.toHaveBeenCalled();
    });

    /*
      アンマウントしたら開き直さない（レビュー指摘）

      ⚠️ この取り消しは**主 effect の cleanup より後ろ**で走らないと効かない。
      React はアンマウント時に cleanup を定義順で走らせるため、前に置くと
      消した直後に主 effect が登録し直す
    */
    it('開いたままアンマウントしたあと、進んでも開き直さない', async () => {
      const onReopen = jest.fn();
      /*
        ⚠️ **開いたままアンマウントすること。** 先に閉じてからだと主 effect は
        早期 return していて cleanup を持たず、登録し直す経路を踏まない
        （＝順序を入れ替えても落ちないテストになる）
      */
      const { unmount } = renderHook(() =>
        useOverlayHistory(true, jest.fn(), onReopen),
      );

      const token = currentToken();
      expect(token).toBeTruthy();

      unmount();
      await flushAsyncBack();

      movePointerTo({ __overlayHistory: token });

      expect(onReopen).not.toHaveBeenCalled();
    });

    /*
      開かなかったオーバーレイの印を、別のオーバーレイが拾わない（レビュー指摘）

      `onReopen` を渡していても呼び出し側が `open === true` を無視する
      オーバーレイ（ログイン誘導・評価モーダル）では、進んでも開かないので
      印が残る。自分のものか見ないと、次に開いた別のオーバーレイが
      そのトークンを引き継ぎ、**自分のエントリを積まない**
    */
    it('開き直さなかった印を、別のオーバーレイが引き継がない', async () => {
      // A: onReopen は渡すが、呼び出し側は開き直さない
      const a = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), jest.fn()),
        { initialProps: { open: true } },
      );
      const tokenA = currentToken();

      movePointerTo(null);
      a.rerender({ open: false });
      await flushAsyncBack();

      // 進む: A の印が立つが、A は開き直さない
      movePointerTo({ __overlayHistory: tokenA });

      // B: 別のオーバーレイを開く
      const before = window.history.length;
      renderHook(() => useOverlayHistory(true, jest.fn(), jest.fn()));

      // B は自分のエントリを積む（A のトークンを引き継がない）
      expect(window.history.length).toBe(before + 1);
      expect(currentToken()).not.toBe(tokenA);
    });

    // 進むで復活したエントリは、そのオーバーレイのものだけに届く
    it('入れ子では、進んだ先のエントリを持つオーバーレイだけが開き直す', async () => {
      const outerReopen = jest.fn();
      const innerReopen = jest.fn();

      const outer = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), outerReopen),
        { initialProps: { open: true } },
      );
      const outerToken = currentToken();

      const inner = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), innerReopen),
        { initialProps: { open: true } },
      );
      const innerToken = currentToken();
      expect(innerToken).not.toBe(outerToken);

      // 内側 → 外側 の順に戻って閉じる
      movePointerTo({ __overlayHistory: outerToken });
      inner.rerender({ open: false });
      await flushAsyncBack();

      movePointerTo(null);
      outer.rerender({ open: false });
      await flushAsyncBack();

      // 進む1回目は外側のエントリ
      movePointerTo({ __overlayHistory: outerToken });
      expect(outerReopen).toHaveBeenCalledTimes(1);
      expect(innerReopen).not.toHaveBeenCalled();

      // 進む2回目で内側
      outer.rerender({ open: true });
      movePointerTo({ __overlayHistory: innerToken });
      expect(innerReopen).toHaveBeenCalledTimes(1);
    });
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
  /**
   * 閉じた直後、cleanup より先に「進む」が届く（#1304）
   *
   * 休止登録（`dormantOverlays`）はオーバーレイの cleanup で行うが、
   * React の passive effect は**閉じた描画の後**に走る。遅いマシンでは
   * その隙に進むの popstate が届き、登録がまだ空のまま素通りして
   * **閉じているものをもう一度閉じて**進むを握り潰していた。
   *
   * CI の E2E（`e2e/mobile/overlayHistory.spec.ts`）で実際に落ちた。
   * trace では `goForward()` 直後の `toBeVisible()` が10秒タイムアウトし、
   * コンソールエラーは0件だった
   */
  describe('cleanup より先に進むが届く', () => {
    /** 進むでエントリが復活した状態の popstate */
    const dispatchForward = (token: unknown) => {
      act(() => {
        window.history.replaceState(
          { __overlayHistory: token },
          '',
          window.location.href,
        );
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    };

    it('cleanup が走っていなくても開き直す', () => {
      const onClose = jest.fn();
      const onReopen = jest.fn();
      renderHook(() => useOverlayHistory(true, onClose, onReopen));
      const token = window.history.state?.__overlayHistory;

      // 戻るで閉じる。再描画しない＝ cleanup はまだ走っていない
      dispatchPopState();
      expect(onClose).toHaveBeenCalledTimes(1);
      onClose.mockClear();

      dispatchForward(token);

      expect(onReopen).toHaveBeenCalledTimes(1);
      // ⚠️ 同じ popstate を閉じる方向にも解釈しないこと。
      // 解釈すると開き直した直後に閉じ、#1304 の症状のまま
      expect(onClose).not.toHaveBeenCalled();
    });

    it('遅れて cleanup が走っても、復活したエントリを畳まない', async () => {
      // 畳むと history.back() で進むを打ち消してしまう
      const onReopen = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), onReopen),
        { initialProps: { open: true } },
      );
      const token = window.history.state?.__overlayHistory;

      dispatchPopState();
      dispatchForward(token);

      // ここで React が溜めていた cleanup（open: false）を走らせ、
      // 続けて開き直しの setup（open: true）を走らせる
      rerender({ open: false });
      rerender({ open: true });
      await flushAsyncBack();

      expect(backSpy).not.toHaveBeenCalled();
    });

    it('開き直したあと履歴は増えない', () => {
      // 進むでエントリは既に戻っている。積み直すと戻る回数が合わなくなる
      const onReopen = jest.fn();
      const { rerender } = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), onReopen),
        { initialProps: { open: true } },
      );
      const token = window.history.state?.__overlayHistory;
      const length = window.history.length;

      dispatchPopState();
      dispatchForward(token);
      rerender({ open: false });
      rerender({ open: true });

      expect(window.history.length).toBe(length);
    });

    it('開き直したあと、入れ子の戻るを握り潰さない', () => {
      // 遅れて走る cleanup が休止登録を**無条件に**行うため、既に復活して
      // 開いているトークンが `dormantOverlays` に残りうる。残ると、上に
      // 積んだオーバーレイを戻るで閉じようとしたときに、そちらが先に
      // 当たって**内側が閉じない**
      const outerReopen = jest.fn();
      const outer = renderHook(
        ({ open }) => useOverlayHistory(open, jest.fn(), outerReopen),
        { initialProps: { open: true } },
      );
      const token = window.history.state?.__overlayHistory;

      // 戻る → cleanup 前に進む → 遅れて cleanup/setup
      dispatchPopState();
      dispatchForward(token);
      outer.rerender({ open: false });
      outer.rerender({ open: true });

      // 進むでの開き直しはここまでで済んでいる。以降は呼ばれてはいけない
      expect(outerReopen).toHaveBeenCalledTimes(1);
      outerReopen.mockClear();

      // 上に別のオーバーレイを積む
      const innerClose = jest.fn();
      renderHook(() => useOverlayHistory(true, innerClose));

      // 戻ると内側のエントリが外れ、下の外側のエントリ（token）が最前面に戻る。
      // 閉じるべきは**内側**
      dispatchForward(token);

      expect(innerClose).toHaveBeenCalledTimes(1);
      expect(outerReopen).not.toHaveBeenCalled();
    });

    it('他人のトークンでは開き直さない', () => {
      // 自分のエントリでないものに反応すると、別のオーバーレイを巻き込む
      const onReopen = jest.fn();
      renderHook(() => useOverlayHistory(true, jest.fn(), onReopen));

      dispatchPopState();
      dispatchForward('overlay-999');

      expect(onReopen).not.toHaveBeenCalled();
    });
  });
});
