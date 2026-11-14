/**
 * ボトムナビの高さを CSS 変数へ公開する（#1028）
 *
 * ナビは position: fixed なので、そのままだと本文末尾とフッターを覆う。
 * 高さを `--bottom-nav-height` に出し、AppLayout の padding-bottom と
 * トーストの bottom へ足すことで場所を空ける。
 * ナビが無いとき（lg 以上）は 0px になるので、レイアウトは追加前と同一になる。
 *
 * 作りは同意バナーの `src/features/cookieConsent/utils/bannerHeight.ts` に
 * 揃えている（同値なら書かない・アンマウントで removeProperty する・
 * 境界ボックスで測る）。あちらが解決した #966 の罠をもう一度踏まないため。
 */

'use client';

import { useRef, type RefObject } from 'react';

import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';

/**
 * ボトムナビの実高を持つ CSS 変数名
 *
 * バナーの `--cookie-banner-height` と違い `:root` の初期値は置かない。
 * 参照側は必ず `var(--bottom-nav-height, 0px)` と既定値つきで読むこと
 * （ナビを描かないページでも 0px に倒れる）。
 */
export const BOTTOM_NAV_HEIGHT_VAR = '--bottom-nav-height';

/**
 * ResizeObserver の entry から、画面を覆う高さを取り出す
 *
 * **境界ボックス**を返す。ナビは position: fixed なので、本文を覆うのは
 * 境界線を含めた高さ。`contentRect` は内容ボックスで `border-top: 1px` を
 * 含まず、フッター最下 1px に境界線が重なる（バナーで実際に起きた #966）。
 *
 * @param entry ResizeObserver のエントリ
 * @returns 境界ボックスの高さ（ピクセル）
 */
export function resolveNavHeight(entry: ResizeObserverEntry): number {
  // 型の上では必ず取れるが、borderBoxSize は Safari 15.4 以降なので
  // 実行時のエンジン差への防御として fallback を残す（bannerHeight.ts と同じ）
  const blockSize = entry.borderBoxSize?.[0]?.blockSize;
  if (blockSize !== undefined) return blockSize;

  return entry.target.getBoundingClientRect().height;
}

/**
 * ボトムナビの高さを反映する
 *
 * @param px 高さ（ピクセル）。null ならナビが消えたとみなして変数を外す
 */
export function setBottomNavHeightVar(px: number | null): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (px === null) {
    // document.documentElement.style は React ツリー外なので、
    // 消さないとアンマウント後も本文の下に余白が残る
    root.style.removeProperty(BOTTOM_NAV_HEIGHT_VAR);
    return;
  }

  // 単位を落とすと calc(0px + 0) が invalid at computed-value time になり、
  // トーストの bottom が効かなくなる
  const next = `${Math.ceil(px)}px`;

  // 同値なら書かない（ResizeObserver のフィードバックループ回避）
  if (root.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR) === next) return;

  root.style.setProperty(BOTTOM_NAV_HEIGHT_VAR, next);
}

/**
 * ボトムナビの実高を測って CSS 変数へ公開するフック
 *
 * 高さは安全領域（`env(safe-area-inset-bottom)`）と端末幅で変わるため、
 * 固定値では合わない。
 *
 * **lg 以上で `display: none` になると 0px が書かれる。** ResizeObserver は
 * 箱を失った要素を 0×0 として報告するため、メディアクエリを JS 側へ
 * 二重定義しなくても本文の padding が戻る。lg で初回マウントしたときも、
 * Chromium は `display: none` の要素に対して**初回観測を1回返す**ので
 * （1280px でハードリロードした `/privacy` の `documentElement` に
 * `--bottom-nav-height: 0px` がインラインで載ることを実測）、同じく 0px になる。
 * どちらにせよ参照側は `var(--bottom-nav-height, 0px)` と既定値つきで読むため
 * 結果は変わらない。
 *
 * @returns ナビ要素に渡す ref
 */
export function useBottomNavHeight(): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);

  // レイアウト効果にするのは、下の同期書き込みを**初回ペイント前**に
  // 済ませるため。useEffect だと1フレームぶん変数が未確定のまま描かれる
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // ⚠️ RO を張る前に一度**同期で**書く。RO の初回観測は次フレームなので、
    // それだけに任せると変数が未確定の窓ができる。`AppLayout` はセクションを
    // またぐ遷移のたびに remount するため、この窓は毎回開く：cleanup の
    // removeProperty が先に走り、新しい観測が来るまでの間だけ本文の
    // padding-bottom とトーストの bottom が 0 に落ちる（`/privacy` →
    // `/search` を 8ms 間隔で採ると 372 サンプル中1件で再現）。
    // 同意バナー（`cookieConsentBanner.tsx`）も同じ形にしてある。
    // 以前は「あちらはセッション中に一度しかマウントしないので不要」と
    // 書いていたが、それは**再マウントの窓**の話であって、**初回マウントの
    // 窓**は塞がっていなかった（#1155）
    setBottomNavHeightVar(element.getBoundingClientRect().height);

    const observer = new ResizeObserver(([entry]) => {
      setBottomNavHeightVar(resolveNavHeight(entry));
    });
    // 境界ボックスの変化で発火させる。既定（content-box）だと border-top の
    // 幅だけが変わったときにコールバックが呼ばれず、変数が古い値で残る
    observer.observe(element, { box: 'border-box' });

    return () => {
      // カスタム lint は ResizeObserver を検出しないので手動で担保する
      observer.disconnect();
      setBottomNavHeightVar(null);
    };
  }, []);

  return ref;
}
