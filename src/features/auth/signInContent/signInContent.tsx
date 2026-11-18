/**
 * ログインページコンテンツ
 *
 * LoginForm（パスワードログイン）と OtpLoginForm（メールOTPログイン）を切り替える。
 */

'use client';

import { memo, useCallback, useState } from 'react';

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
}

export const SignInContent = memo<SignInContentProps>(function SignInContent({
  callbackUrl,
  initialIdentifier,
}) {
  const [loginMode, setLoginMode] = useState<LoginMode>('password');

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
    />
  );
});

SignInContent.displayName = 'SignInContent';
