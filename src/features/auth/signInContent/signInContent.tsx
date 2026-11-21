/**
 * ログインページコンテンツ
 *
 * LoginForm（パスワード／ソーシャル）の周りで、戻り先の復元と
 * `?error=` の後始末だけを受け持つ。
 *
 * ⚠️ メールOTPログイン（パスワード不要の経路）は #1361 で削除した。
 *   受信箱を押さえられるとログインできてしまう経路が、パスワード再設定と
 *   二重に存在していたため。復旧手段はリセットが残る。
 */

'use client';

import { memo, useEffect, useState } from 'react';

import { LoginForm } from '@/features/auth/loginForm/loginForm';
import { takePendingCallbackUrl } from '@/features/auth/utils/pendingCallbackUrl';

interface SignInContentProps {
  /** ログイン後の戻り先（proxyが付与する callbackUrl） */
  callbackUrl?: string;
  /**
   * ログイン欄の初期値（#1237）
   *
   * パスワード設定の完了画面から渡ってくるアカウント名。発行アカウントの
   * 利用者は自分のメールアドレスを入れて失敗しがちなので、分かっている値を
   * 入れておく
   */
  initialIdentifier?: string;
  /**
   * ソーシャルログインの失敗文言（#1242）
   *
   * `/auth/signin?error=` で戻ってきたときにページが解決して渡す。
   */
  initialError?: string;
}

export const SignInContent = memo<SignInContentProps>(function SignInContent({
  callbackUrl,
  initialIdentifier,
  initialError,
}) {
  /**
   * 最初に受け取った文言を抱えておく
   *
   * `initialError` をそのまま下へ流すと、`?error=` を落としたあとの再描画で
   * prop が undefined になり文言が消えうる。読む前に消えたら、戻された
   * 理由が分からないままになる
   */
  const [displayError] = useState(initialError);

  /**
   * ソーシャルログインに失敗したときの戻り先を復元する（#1246）
   *
   * Auth.js は失敗時のリダイレクトに `error` と `code` しか載せないため
   * （`@auth/core/index.js:132-137`）、`proxy.ts` が付けた `callbackUrl` は
   * OAuth の往復で消える。`/watchlist` を見ようとして誘導された人が、
   * ログインし直すとホームに着地していた。
   *
   * ⚠️ `initialError` があるときだけ**採る**。無条件に採ると、ソーシャル
   * ログインを始めたまま別タブでログイン画面を開いた人が、身に覚えのない
   * 場所へ飛ばされる。
   *
   * ⚠️ URL の `callbackUrl` を優先する。そちらは `proxy.ts` が今まさに
   * 付けた値で、預かっていたものより新しい。ただし**採らない場合も消す**。
   * 残すと、次に別の理由で戻されたときに古い戻り先が蘇る。
   * 失敗せずにこの画面へ来たときも同じで、預かり分は役目を終えている。
   *
   * 戻り先は `LoginForm` が `resolveSafeCallbackUrl` を通してから遷移するので、
   * ここで検証はしない（預ける側も通している）。
   *
   * ⚠️ `useState` の遅延初期化でやらない。`takePendingCallbackUrl` は
   * 読むと同時に消す＝**副作用**で、レンダー中に置くと StrictMode や
   * 並行レンダリングで破棄・再実行されたときに戻り先が黙って失われる
   */
  const [restoredCallbackUrl, setRestoredCallbackUrl] = useState<
    string | undefined
  >(undefined);

  /*
    `sessionStorage`（レンダーの外にある状態）を読み込むためのeffect。
    遷移に使うだけで描画はしないので、追加のレンダーは画面に出ない。
    effect 内 setState は承知のうえ。

    ⛔ **取り出せなかった回で上書きしない（#1383）。** `takePendingCallbackUrl`
    は読むと同時に消すので、2回目は必ず `undefined` になる。結果をそのまま
    state へ入れていたため、**2回目が `undefined` で上書き**して戻り先を
    失っていた。StrictMode（`next.config.mjs` の `reactStrictMode: true`）の
    dev では effect が必ず2回走るので、**開発サーバーでは #1246 の修正が
    効いていなかった**。

    `SignInBackLink`（`signInBackLink.tsx:48`）が同じ形で、あちらは壊れていない。

    ⚠️ 消すのは**早期 return より前**。「採らない場合も消す」（上記）は
    この順序で保たれている。
  */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const pending = takePendingCallbackUrl();
    if (!pending) return;

    if (initialError) {
      setRestoredCallbackUrl(pending);
    }
  }, [initialError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const effectiveCallbackUrl = callbackUrl ?? restoredCallbackUrl;

  /**
   * 表示したら URL から `?error=` を落とす（#1242）
   *
   * 残しておくと**同じエラーが何度でも蘇る**。
   *
   * - `MissingCSRF` の文言は「画面を再読み込みしてから」だが、リロードすると
   *   クエリごと読み直して同じエラーが出る。言われたとおりにしても抜けられない
   *
   * ⚠️ `router.replace` を使ってはいけない。サーバーの再描画が走って
   * **エラー表示ごと消える**（本番ビルドの E2E で実測。jsdom では
   * `replace` がモックなので再描画が起きず、単体テストでは気づけない）。
   *
   * `window.history.replaceState` は Next.js がルーターに統合しているので、
   * `usePathname` / `useSearchParams` は追従しつつ再描画は起きない
   * （`next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:346-348`）。
   */
  useEffect(() => {
    if (!initialError || typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (!url.searchParams.has('error')) return;

    url.searchParams.delete('error');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [initialError]);

  return (
    <LoginForm
      callbackUrl={effectiveCallbackUrl}
      initialIdentifier={initialIdentifier}
      initialError={displayError}
    />
  );
});

SignInContent.displayName = 'SignInContent';
