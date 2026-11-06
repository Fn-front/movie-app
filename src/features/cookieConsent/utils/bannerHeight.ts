/**
 * 同意バナーの高さを CSS 変数へ公開する
 *
 * バナーは position: fixed なので、そのままだとフッターや本文末尾を覆う。
 * 高さを変数に出し、AppLayout の height / body の padding-bottom /
 * トーストの bottom から差し引くことで場所を空ける。
 * バナーが無いときは 0px のままなので、レイアウトは変更前と完全に同一になる。
 *
 * 高さは文量と画面幅で変わるため固定値では合わない。呼び出し側は
 * ResizeObserver で実測値を渡す。
 */

/** `_theme.scss` の :root で 0px を初期値として定義している */
export const BANNER_HEIGHT_VAR = '--cookie-banner-height';

/**
 * ResizeObserver の entry から、画面を覆う高さを取り出す
 *
 * **境界ボックス**を返す。バナーは `position: fixed` なので、フッターや本文を
 * 覆うのは境界線を含めた高さ。`entry.contentRect` は内容ボックスで境界線を
 * 含まないため、`border-top: 1px`（`cookieConsentBanner.module.scss:18`）の
 * ぶんだけ足りず、フッター最下 1px にバナーの境界線が重なっていた（#966）。
 *
 * コンポーネント側に置くと検証できない。`jest.setup.js` の ResizeObserver は
 * コールバックが発火しない no-op スタブなので、純関数として切り出して
 * entry のモックで固定する。
 *
 * @param entry ResizeObserver のエントリ
 * @returns 境界ボックスの高さ（ピクセル）
 */
export function resolveBannerHeight(entry: ResizeObserverEntry): number {
  // `observe()` のボックス指定に関わらず、entry には borderBoxSize が常に
  // 設定される（observedBox が決めるのは発火条件だけ）。
  // blockSize が height と一致するのは横書きのとき。本リポジトリに
  // writing-mode の指定は0件なので問題ない
  const blockSize = entry.borderBoxSize?.[0]?.blockSize;
  if (blockSize !== undefined) return blockSize;

  // borderBoxSize は Safari 15.4 以降。それ以前向けの保険。
  // getBoundingClientRect は transform 込みのため、将来バナーにスライドインを
  // 足すとこの経路だけ値がずれる点に注意
  return entry.target.getBoundingClientRect().height;
}

/**
 * バナー高さを反映する
 *
 * @param px 高さ（ピクセル）。null ならバナーが消えたとみなして変数を外す
 */
export function setBannerHeightVar(px: number | null): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (px === null) {
    // document.documentElement.style は React ツリー外なので、
    // 消さないとクライアント遷移後もトーストが浮いたままになる
    root.style.removeProperty(BANNER_HEIGHT_VAR);
    return;
  }

  // 単位を落とすと calc(100vh - 0) が invalid at computed-value time になり
  // height: auto へフォールバックしてレイアウトが崩れる
  const next = `${Math.ceil(px)}px`;

  // 同値なら書かない（ResizeObserver のフィードバックループ回避）
  if (root.style.getPropertyValue(BANNER_HEIGHT_VAR) === next) return;

  root.style.setProperty(BANNER_HEIGHT_VAR, next);
}
