/**
 * オーバーレイをブラウザ履歴に載せるフック
 *
 * ダイアログやドロワーは履歴に載っていないと、戻る操作で「閉じる」のではなく
 * ページごと離脱してしまう（#1026）。Android の戻るジェスチャーはオーバーレイを
 * 閉じる第一の手段なので、スマホで特に影響が大きい。
 *
 * 開いているあいだだけ履歴エントリを1つ積み、戻るでそれが外れたら閉じる。
 * URL は変えない。オーバーレイを共有・ブックマーク可能にするのは別の話で、
 * それには URL を持つルート（intercepting route 等）への作り替えが要る。
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * 自分が積んだエントリであることの目印。
 *
 * ルーターの遷移で閉じた場合に、間違って `history.back()` して遷移を
 * 取り消さないための判定に使う。
 */
const OVERLAY_STATE_KEY = '__overlayHistory';

/** 開いているオーバーレイ。末尾が最前面 */
interface OverlayEntry {
  close: () => void;
  /** 戻る操作で外れたか（× やEscで閉じた場合と区別する） */
  popped: boolean;
}

const openOverlays: OverlayEntry[] = [];

let isListening = false;

/**
 * 戻る操作で最前面のオーバーレイだけを閉じる。
 *
 * 入れ子（映画詳細の上に予告動画）のとき、各フックが個別に popstate を
 * 購読すると全部が同時に閉じてしまう。購読はモジュールで1つだけ持ち、
 * スタックの最後だけに伝える。
 */
function handlePopState(): void {
  const top = openOverlays[openOverlays.length - 1];

  if (!top) {
    return;
  }

  top.popped = true;
  top.close();
}

function startListening(): void {
  if (isListening) {
    return;
  }

  window.addEventListener('popstate', handlePopState);
  isListening = true;
}

function stopListening(): void {
  if (!isListening || openOverlays.length > 0) {
    return;
  }

  window.removeEventListener('popstate', handlePopState);
  isListening = false;
}

/** {@link useOverlayHistory} の戻り値 */
export interface OverlayHistoryHandlers {
  /**
   * 「ユーザーがオーバーレイを閉じた」ことを伝える。
   *
   * ×・Esc・オーバーレイ外クリックのように**オーバーレイ自身の閉じる操作**で
   * 閉じたときだけ呼ぶこと。呼ばれた場合に限り、積んだ履歴エントリを畳む。
   */
  notifyDismissed: () => void;
}

/**
 * オーバーレイの開閉をブラウザ履歴に同期する。
 *
 * @param open オーバーレイが開いているか
 * @param onClose 戻る操作で閉じるときに呼ばれる。呼び出し側は `open` を false にすること
 * @returns ユーザー操作で閉じたことを伝えるハンドラ
 *
 * @example
 * ```tsx
 * const { notifyDismissed } = useOverlayHistory(open, handleHistoryClose);
 *
 * // Radix が閉じようとしたとき（× / Esc / 外側クリック）だけ通知する
 * const handleOpenChange = (next: boolean) => {
 *   if (!next) notifyDismissed();
 *   onOpenChange(next);
 * };
 * ```
 */
export function useOverlayHistory(
  open: boolean,
  onClose: () => void,
): OverlayHistoryHandlers {
  // onClose の参照が変わるたびに履歴を積み直さないよう、ref 経由で読む
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /**
   * ユーザー操作で閉じたか。
   *
   * アプリ側が `open` を false にして閉じる場合（フィルターの「適用」で
   * URL を更新する、ナビゲーションリンクで遷移する等）に履歴を畳むと、
   * 非同期の `history.back()` がその遷移を取り消してしまう。実際に
   * `include_regions` の反映・ログイン誘導・カレンダー・キャスト遷移が壊れた。
   * そのため「自分で畳んでよいのは、ユーザーが閉じたときだけ」に限定する。
   */
  const dismissedRef = useRef(false);

  const notifyDismissed = useCallback(() => {
    dismissedRef.current = true;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    dismissedRef.current = false;

    const entry: OverlayEntry = {
      close: () => onCloseRef.current(),
      popped: false,
    };

    openOverlays.push(entry);
    startListening();

    window.history.pushState(
      { ...window.history.state, [OVERLAY_STATE_KEY]: true },
      '',
      window.location.href,
    );

    return () => {
      const index = openOverlays.indexOf(entry);

      if (index !== -1) {
        openOverlays.splice(index, 1);
      }

      stopListening();

      if (entry.popped) {
        // 戻るで外れた分なので、ここで畳むと1つ余計に戻ってしまう
        return;
      }

      if (!dismissedRef.current) {
        // 遷移やURL更新に伴う close。畳むとその遷移を取り消してしまう
        return;
      }

      // ルーターが新しいエントリを積んでいたら、最前面はもう自分ではない
      if (!window.history.state?.[OVERLAY_STATE_KEY]) {
        return;
      }

      window.history.back();
    };
  }, [open]);

  return { notifyDismissed };
}
