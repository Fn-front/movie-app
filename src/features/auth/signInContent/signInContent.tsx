/**
 * ログインページコンテンツ
 *
 * LoginForm（パスワードログイン）と OtpLoginForm（メールOTPログイン）を切り替える。
 */

'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { LoginForm } from '@/features/auth/loginForm/loginForm';
import { OtpLoginForm } from '@/features/auth/otpLoginForm/otpLoginForm';

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
  const router = useRouter();

  /**
   * 表示したら URL から `?error=` を落とす（#1242）
   *
   * 残しておくと**同じエラーが何度でも蘇る**。
   *
   * - `MissingCSRF` の文言は「画面を再読み込みしてから」だが、リロードすると
   *   クエリごと読み直して同じエラーが出る。言われたとおりにしても抜けられない
   * - OTP に切り替えて戻ると `LoginForm` が再マウントされ、`useState` が
   *   `initialError` で初期化し直される。送信して別のエラーを出したあとでも、
   *   往復するだけで**古い文言に巻き戻る**
   *
   * 消すのは URL だけで、表示中の文言は消さない（`LoginForm` の state は
   * 初期化済みなので prop が undefined に変わっても残る）。読む前に
   * 勝手に消えると、戻された理由が分からないままになる
   */
  useEffect(() => {
    if (!initialError || typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (!url.searchParams.has('error')) return;

    url.searchParams.delete('error');
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [initialError, router]);

  const handleOtpLoginClick = useCallback(() => {
    setLoginMode('otp');
  }, []);

  const handlePasswordLoginClick = useCallback(() => {
    setLoginMode('password');
  }, []);

  if (loginMode === 'otp') {
    return (
      <OtpLoginForm
        onPasswordLoginClick={handlePasswordLoginClick}
        callbackUrl={callbackUrl}
      />
    );
  }

  return (
    <LoginForm
      onOtpLoginClick={handleOtpLoginClick}
      callbackUrl={callbackUrl}
      initialIdentifier={initialIdentifier}
      initialError={initialError}
    />
  );
});

SignInContent.displayName = 'SignInContent';
