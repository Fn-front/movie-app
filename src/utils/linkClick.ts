/**
 * リンクの左クリックだけを横取りしてよいかを判定する
 */

import type { MouseEvent } from 'react';

/**
 * ブラウザの既定動作に任せるべきクリックか
 *
 * 一覧のタイトルは `<a href="/movies/<id>">` のままにして、左クリックのときだけ
 * `preventDefault()` してモーダルで開く（#1033）。**修飾キー付き・中クリック・
 * 既に止められたイベントには触らない**。触ると「新しいタブで開く」「リンクを
 * コピーする」といったブラウザの機能を奪ってしまう。
 *
 * @example
 * ```tsx
 * const handleClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
 *   if (shouldLetBrowserHandle(event)) return;
 *   event.preventDefault();
 *   openMovieDetail(id);
 * }, [openMovieDetail, id]);
 * ```
 */
export function shouldLetBrowserHandle(event: MouseEvent): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
