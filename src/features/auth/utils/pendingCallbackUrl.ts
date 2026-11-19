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

/** 預け先のキー。生成と読み出しで同じ値を使う */
const PENDING_CALLBACK_URL_KEY = 'auth:pendingCallbackUrl';

/**
 * ソーシャルログインを始める前に戻り先を預ける
 *
 * `sessionStorage` はプライベートブラウジングや容量超過で例外を投げる。
 * 戻り先はあれば嬉しい程度のものなので、失敗してもログインを止めない。
 *
 * @param callbackUrl - 預ける戻り先。空なら何もしない
 */
export function savePendingCallbackUrl(callbackUrl: string | undefined): void {
  if (!callbackUrl || typeof window === 'undefined') return;

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
