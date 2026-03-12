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

export const SignInContent = memo(function SignInContent() {
  const [loginMode, setLoginMode] = useState<LoginMode>('password');

  const handleOtpLoginClick = useCallback(() => {
    setLoginMode('otp');
  }, []);

  const handlePasswordLoginClick = useCallback(() => {
    setLoginMode('password');
  }, []);

  if (loginMode === 'otp') {
    return <OtpLoginForm onPasswordLoginClick={handlePasswordLoginClick} />;
  }

  return <LoginForm onOtpLoginClick={handleOtpLoginClick} />;
});

SignInContent.displayName = 'SignInContent';
