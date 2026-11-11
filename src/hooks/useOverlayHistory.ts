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
 * 履歴エントリに載せる所有者トークンのキー。
 *
 * 真偽値だと「誰かのオーバーレイが積んだ」ことしか分からず、入れ子では
 * **他人のエントリを自分のものとして畳んでしまう**（例: 映画詳細の上で
 * 評価モーダルを開き、評価モーダルを閉じずに詳細を × で閉じると、
 * 詳細が評価モーダルのエントリを消す）。エントリごとに一意の値を入れ、
 * 「最前面が自分のものか」を厳密に判定する。
 *
 * ルーターが遷移すると state ごと差し替わるため、遷移に伴う close で
 * 間違って `history.back()` して遷移を取り消すことも防げる。
 */
const OVERLAY_STATE_KEY = '__overlayHistory';

let nextOverlayToken = 0;

/** エントリ固有のトークンを採番する（`crypto` に依存しない） */
function createOverlayToken(): string {
  nextOverlayToken += 1;
  return `overlay-${nextOverlayToken}`;
}

/** 開いているオーバーレイ。末尾が最前面 */
interface OverlayEntry {
  close: () => void;
  /** 戻る操作で外れたか（× やEscで閉じた場合と区別する） */
  popped: boolean;
}

const openOverlays: OverlayEntry[] = [];

let isListening = false;

/**
 * 自分が積んだエントリを畳むために呼んだ `history.back()` のうち、
 * まだ popstate が届いていない数。
 *
 * `history.back()` は**非同期**なので、入れ子のときに残っているリスナーが
 * その popstate を拾い、「ユーザーが戻った」と誤解して別のオーバーレイ
 * （＝外側）を閉じてしまう。自分で起こした分はここで数えて読み飛ばす。
 *
 * 「popstate が来ずカウンタが詰まる」心配は要らない。畳むのは
 * 最前面が**自分のトークンを持つエントリ**のときだけで、それは
 * `pushState` で作った同一ドキュメント・同一URLのエントリなので、
 * 必ず1つ前が存在し `back()` が空振りしない。
 */
let pendingSelfBacks = 0;

/**
 * 戻る操作で最前面のオーバーレイだけを閉じる。
 *
 * 入れ子（映画詳細の上に予告動画）のとき、各フックが個別に popstate を
 * 購読すると全部が同時に閉じてしまう。購読はモジュールで1つだけ持ち、
 * スタックの最後だけに伝える。
 */
function handlePopState(): void {
  if (pendingSelfBacks > 0) {
    // 自分が畳むために起こした戻り。オーバーレイには伝えない。
    // 最後の1つを消化し終え、開いているオーバーレイも無ければ購読を外す
    // （cleanup 側は未着の戻りがあるあいだ外さずに残している）
    pendingSelfBacks -= 1;
    stopListening();
    return;
  }

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

/**
 * 購読を外す。
 *
 * 自分で起こした戻りが未着のあいだは外さない。外すと popstate を
 * 読み飛ばせず、`pendingSelfBacks` が減らないまま次の戻るを飲み込む。
 */
function stopListening(): void {
  if (!isListening || openOverlays.length > 0 || pendingSelfBacks > 0) {
    return;
  }

  window.removeEventListener('popstate', handlePopState);
  isListening = false;
}

/** 自分が積んだエントリを1つ畳む */
function foldOwnEntry(): void {
  pendingSelfBacks += 1;
  window.history.back();
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
    const token = createOverlayToken();

    openOverlays.push(entry);
    startListening();

    window.history.pushState(
      { ...window.history.state, [OVERLAY_STATE_KEY]: token },
      '',
      window.location.href,
    );

    return () => {
      const index = openOverlays.indexOf(entry);

      if (index !== -1) {
        openOverlays.splice(index, 1);
      }

      // 畳むかどうかを先に決める。
      // - popped: 戻るで外れた分。ここで畳むと1つ余計に戻ってしまう
      // - !dismissed: 遷移やURL更新に伴う close。畳むとその遷移を取り消す
      // - トークン不一致: 最前面は自分のエントリではない。
      //   入れ子の内側が畳まずに残した場合や、ルーターが遷移した場合。
      //   ここで畳むと他人のエントリや遷移を消してしまう
      const shouldFold =
        !entry.popped &&
        dismissedRef.current &&
        window.history.state?.[OVERLAY_STATE_KEY] === token;

      if (shouldFold) {
        foldOwnEntry();
      }

      // 購読の解除は畳む判断の後。先に外すと、自分で起こした戻りの
      // popstate を読み飛ばせず、次の戻るを飲み込んでしまう
      stopListening();
    };
  }, [open]);

  return { notifyDismissed };
}
