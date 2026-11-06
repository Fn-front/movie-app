/**
 * 前ページの挿入でスクロール位置が飛ぶのを防ぐフック
 *
 * 双方向の無限リストでは、上方向のロードでリストの**先頭に**項目が差し込まれる。
 * 差し込まれたぶんだけ下の内容が押し下げられるため、何もしないと利用者が見て
 * いた場所が画面外へ飛ぶ。
 *
 * ブラウザのスクロールアンカリング（`overflow-anchor`）は、スクロール位置を
 * 明示的に設定した直後や先頭（`scrollTop === 0`）付近では働かない。
 * 上方向ロードはまさに先頭付近で起きるので、アンカリング任せにはできない。
 *
 * ## 全高の差分では補正できない
 *
 * `maxPages` を使うと、前ページの挿入と**同時に末尾ページが捨てられる**。
 * 実測（お気に入り132件・`maxPages: 5`）では、上に20件入って下から12件消え、
 * 全高の変化は +336px に過ぎなかった。一方アンカーより上に増えたのは
 * 約1500px で、全高の差分で補正すると1000px以上ずれたままになる。
 *
 * そこで**実在する要素の画面上の位置**を基準にする。更新前に画面内にある
 * 項目を1つ覚えておき、更新後に同じ要素がどれだけ動いたかぶんだけ
 * `scrollTop` を足す。要素が消えた場合は補正しない。
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

/** 更新前に控えた、基準要素とスクロール状態 */
interface AnchorSnapshot {
  scroller: HTMLElement;
  /** 基準にした要素。React が同じ DOM ノードを使い回す前提 */
  element: Element;
  /** 基準要素の、更新前の画面上の位置 */
  top: number;
}

/**
 * 要素のスクロール可能な祖先を探す
 *
 * リストが自前のスクロールコンテナを持つとは限らない。本アプリでは
 * `AppLayout` の main が内部スクロールするため、ページ側からは辿るしかない。
 *
 * @param element - 起点の要素
 * @returns スクロール可能な祖先。見つからなければ null
 */
function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;

  while (current) {
    const { overflowY } = getComputedStyle(current);
    const scrollable = overflowY === 'auto' || overflowY === 'scroll';
    if (scrollable && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * スクロール領域内に見えている最初の項目を選ぶ
 *
 * 画面外の項目を基準にすると、それ自体が捨てられる側だったときに補正できない。
 *
 * @param listElement - 項目を直接の子に持つ要素
 * @param scroller - スクロール可能な祖先
 * @returns 基準にする要素。見つからなければ null
 */
function pickVisibleItem(
  listElement: Element,
  scroller: HTMLElement,
): Element | null {
  const viewportTop = scroller.getBoundingClientRect().top;

  for (const child of listElement.children) {
    const { bottom } = child.getBoundingClientRect();
    if (bottom > viewportTop) return child;
  }

  return null;
}

/**
 * 前ページ挿入時にスクロール位置を補正する
 *
 * 返された `listRef` を**項目を直接の子に持つ要素**に付け、前ページの取得を
 * 始める直前に `captureBeforePrepend()` を呼ぶ。`anchorKey` が変わった描画の
 * 直後に、基準要素が動いたぶんだけ `scrollTop` を足して見た目を保つ。
 *
 * @param anchorKey - リスト先頭の識別子。これが変わった描画で補正する。
 *   **件数を渡してはいけない。** `maxPages` では前ページの挿入と同時に
 *   末尾ページが捨てられるため件数が変わらず、補正が発火しない
 *   （実測：2回目の挿入で1613pxずれた）
 * @returns 項目の親要素に付ける ref と、取得開始前に呼ぶ関数
 */
export function usePrependScrollAnchor<T extends HTMLElement>(
  anchorKey: string | number | undefined,
) {
  const listRef = useRef<T>(null);
  const snapshotRef = useRef<AnchorSnapshot | null>(null);

  const captureBeforePrepend = useCallback(() => {
    const listElement = listRef.current;
    if (!listElement) return;

    const scroller = findScrollableAncestor(listElement);
    if (!scroller) return;

    const element = pickVisibleItem(listElement, scroller);
    if (!element) return;

    snapshotRef.current = {
      scroller,
      element,
      top: element.getBoundingClientRect().top,
    };
  }, []);

  // 描画の確定後・ブラウザの描画前に補正する。
  // useEffect だと1フレーム分ちらつく
  useLayoutEffect(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;

    snapshotRef.current = null;

    const { scroller, element, top } = snapshot;

    // 基準要素が捨てられていたら補正しない（誤った位置へ飛ばすより無害）
    if (!element.isConnected) return;

    const moved = element.getBoundingClientRect().top - top;
    if (moved !== 0) {
      scroller.scrollTop += moved;
    }
  }, [anchorKey]);

  return { listRef, captureBeforePrepend };
}
