/**
 * ソーシャルログイン中の戻り先を預かる（#1246）
 *
 * Auth.js は失敗時のリダイレクト URL に `error` と `code` しか載せない
 * （`@auth/core/index.js:132-137`）。そのため `proxy.ts` が付けた
 * `callbackUrl` は OAuth の往復で消え、**`/watchlist` を見ようとして
 * ログインへ誘導された人が、ログインし直すとホームに着地する**。
 *
 * サーバー側で持ち回す手段が無いので、クライアントで預かって戻す。
 *
 * ⚠️ `sessionStorage` を使う（`localStorage` ではない）。タブを閉じれば
 * 消えるため、別の機会に開いたときへ持ち越さない。戻り先はその場限りの
 * 文脈で、残しておく価値が無い。
 */

import { resolveSafeCallbackUrl } from '@/utils/url';

/**
 * 預け先のキー。生成と読み出しで同じ値を使う
 *
 * ⚠️ テスト（単体・E2E とも）が「預かっている状態」を観測するために参照する。
 * OAuth の往復そのものは実プロバイダが要って再現できないため、
 * `sessionStorage` を直接読んで確かめるしかない。直書きさせると二重管理に
 * なるので export している（参照側は全部ここから取ること）。
 */
export const PENDING_CALLBACK_URL_KEY = 'auth:pendingCallbackUrl';

/**
 * ソーシャルログインを始める前に戻り先を預ける
 *
 * ⚠️ **`resolveSafeCallbackUrl` を通らない値は預けない。** 遷移の直前でも
 * 検証しているので二重だが、境界で潰しておかないと**取り出す側が1箇所でも
 * 検証を忘れた瞬間にオープンリダイレクトになる**。`sessionStorage` は
 * 同一オリジンのスクリプトなら誰でも書けるため、ここを信用してはいけない。
 *
 * `sessionStorage` はプライベートブラウジングや容量超過で例外を投げる。
 * 戻り先はあれば嬉しい程度のものなので、失敗してもログインを止めない。
 *
 * @param callbackUrl - 預ける戻り先。空や外部URLなら何もしない
 */
export function savePendingCallbackUrl(callbackUrl: string | undefined): void {
  if (!callbackUrl || typeof window === 'undefined') return;

  // 返ってくるのがホーム＝弾かれた値。預ける意味が無い
  if (resolveSafeCallbackUrl(callbackUrl) !== callbackUrl) return;

  try {
    window.sessionStorage.setItem(PENDING_CALLBACK_URL_KEY, callbackUrl);
  } catch {
    // 保存できなくてもログイン自体は続行する
  }
}

/**
 * 預けた戻り先を取り出して消す
 *
 * **読み出しと同時に消す。** 残すと、次に別の経路でログイン画面へ来た人が
 * 身に覚えのない場所へ飛ばされる。
 *
 * ⚠️ 戻り値をそのまま遷移先にしないこと。呼び出し側で
 * `resolveSafeCallbackUrl`（`src/utils/url.ts`）を通す。`sessionStorage` は
 * 同一オリジンのスクリプトなら誰でも書けるため、オープンリダイレクトの
 * 入口になりうる。
 *
 * @returns 預かっていた戻り先。無ければ undefined
 */
export function takePendingCallbackUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = window.sessionStorage.getItem(PENDING_CALLBACK_URL_KEY);
    window.sessionStorage.removeItem(PENDING_CALLBACK_URL_KEY);
    return stored ?? undefined;
  } catch {
    return undefined;
  }
}
