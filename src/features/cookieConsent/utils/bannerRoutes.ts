/**
 * 同意バナーを出さないルートの判定
 *
 * 認証フローの画面は、メールのリンクなどから「1つの作業を終える」ために
 * 来る場所で、無関係な同意の判断を割り込ませたくない（#1229）。
 *
 * **聞くのを後ろへ倒せるのは、同意の既定が `denied` だから。** 未同意の
 * あいだ Cookie は書かれず、送られるのは Consent Mode advanced の
 * cookieless ping だけ。同意状態は `unset` のまま残るので、フローを抜けた
 * 最初の通常ページでバナーが出る。
 *
 * `bannerSuppression.ts` の抑止とは軸が違う。あちらは「同意状態がまだ
 * 確定していない／もう画面を離れる」という**時間軸**の話で、こちらは
 * 場所の話。条件を混ぜると、どちらの理由で消えているのか読めなくなる。
 */

/**
 * 認証フローのパス接頭辞
 *
 * 個別に列挙しない。`/auth/` 配下にページが増えるたびに追従漏れが起きる。
 * 現在実在するのは signin / signup / forgot-password / reset-password /
 * two-factor の5つ。
 *
 * ⚠️ `ROUTES.AUTH_ERROR`（`/auth/error`）は NextAuth の `pages.error` に
 * 指定されているが**ページが無く 404 になる**（`src/lib/auth/auth.ts:333`）。
 * 実装されればプレフィックスで自動的に対象へ入る。
 *
 * 末尾のスラッシュを含めるのは `/authors` のようなパスを巻き込まないため。
 */
const AUTH_ROUTE_PREFIX = '/auth/';

/**
 * 同意バナーを出さないルートか
 *
 * @param pathname - 現在のパス。確定前は null
 * @returns 隠すなら true
 */
export function isConsentBannerHiddenRoute(pathname: string | null): boolean {
  // 判定できないあいだ隠すと、通常ページでバナーが出ない窓ができる
  if (pathname === null) return false;

  return pathname.startsWith(AUTH_ROUTE_PREFIX);
}
