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
