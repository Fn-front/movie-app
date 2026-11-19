/**
 * ログインページコンテンツ
 *
 * LoginForm（パスワードログイン）と OtpLoginForm（メールOTPログイン）を切り替える。
 */

'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import { LoginForm } from '@/features/auth/loginForm/loginForm';
import { OtpLoginForm } from '@/features/auth/otpLoginForm/otpLoginForm';
import { takePendingCallbackUrl } from '@/features/auth/utils/pendingCallbackUrl';

type LoginMode = 'password' | 'otp';

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
   * OTP ログインには渡さない。失敗したのはパスワード/ソーシャルの画面で、
   * 切り替えた先に前の画面のエラーが残っていると文脈が合わない
   */
  initialError?: string;
}

export const SignInContent = memo<SignInContentProps>(function SignInContent({
  callbackUrl,
  initialIdentifier,
  initialError,
}) {
  const [loginMode, setLoginMode] = useState<LoginMode>('password');

  /**
   * 最初に受け取った文言を抱えておく
   *
   * `initialError` をそのまま下へ流すと、`?error=` を落としたあとの再描画で
   * prop が undefined になり文言が消えうる。読む前に消えたら、戻された
   * 理由が分からないままになる
   */
  const [displayError, setDisplayError] = useState(initialError);

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
   * 戻り先は `LoginForm` / `useOtpLogin` が `resolveSafeCallbackUrl` を
   * 通してから遷移するので、ここで検証はしない（預ける側も通している）。
   *
   * ⚠️ `useState` の遅延初期化でやらない。`takePendingCallbackUrl` は
   * 読むと同時に消す＝**副作用**で、レンダー中に置くと StrictMode や
   * 並行レンダリングで破棄・再実行されたときに戻り先が黙って失われる
   */
  const [restoredCallbackUrl, setRestoredCallbackUrl] = useState<
    string | undefined
  >(undefined);

  // `sessionStorage`（レンダーの外にある状態）を読み込むためのeffect。
  // 遷移に使うだけで描画はしないので、追加のレンダーは画面に出ない
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const pending = takePendingCallbackUrl();

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
   * - OTP に切り替えて戻ると `LoginForm` が再マウントされ、`useState` が
   *   初期化し直される。送信して別のエラーを出したあとでも、往復するだけで
   *   **古い文言に巻き戻る**
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

  const handleOtpLoginClick = useCallback(() => {
    setLoginMode('otp');
    // 画面を離れたらサーバー由来のエラーは役目を終える。抱えたままだと
    // パスワード画面へ戻ったときに `LoginForm` が再マウントされ、
    // **古い文言に巻き戻る**
    setDisplayError(undefined);
  }, []);

  const handlePasswordLoginClick = useCallback(() => {
    setLoginMode('password');
  }, []);

  if (loginMode === 'otp') {
    return (
      <OtpLoginForm
        onPasswordLoginClick={handlePasswordLoginClick}
        callbackUrl={effectiveCallbackUrl}
      />
    );
  }

  return (
    <LoginForm
      onOtpLoginClick={handleOtpLoginClick}
      callbackUrl={effectiveCallbackUrl}
      initialIdentifier={initialIdentifier}
      initialError={displayError}
    />
  );
});

SignInContent.displayName = 'SignInContent';
