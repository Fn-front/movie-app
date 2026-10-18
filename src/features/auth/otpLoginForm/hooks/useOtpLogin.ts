/**
 * OTPログイン用カスタムフック
 *
 * メールアドレス入力 → OTP送信 → OTP検証 → セッション発行のフローを管理する。
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

import { OTP_ACTION } from '@/constants/otp';
import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  TOAST_TITLES,
  TOAST_MESSAGES,
} from '@/constants';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import { resolveSafeCallbackUrl } from '@/utils/url';

type OtpLoginStep = 'email' | 'otp';

/**
 * `signIn` が返した code を、利用者に見せるメッセージに変換する
 *
 * 二段階認証が有効なユーザーはこの経路を使えない（#642）。そのことを伝えないと、
 * 「メールアドレスまたはパスワードが正しくありません」とだけ出て、
 * 利用者はパスワード＋認証コードで入り直せばよいと気づけず詰む。
 *
 * それ以外は認証情報エラーに丸める。どのアカウントが存在するかを推測させないため。
 */
const resolveSignInErrorMessage = (code: string | undefined): string =>
  code === AUTH_ERROR_CODE.OTP_LOGIN_DISABLED
    ? AUTH_ERROR_MESSAGES.OTP_LOGIN_DISABLED_BY_TOTP
    : AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;

interface UseOtpLoginReturn {
  step: OtpLoginStep;
  email: string;
  isSubmitting: boolean;
  apiError: string | null;
  handleSendOtp: (email: string) => Promise<void>;
  handleOtpVerifySuccess: (verificationToken?: string) => Promise<void>;
  handleBackToEmail: () => void;
}

export function useOtpLogin(callbackUrl?: string): UseOtpLoginReturn {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<OtpLoginStep>('email');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleSendOtp = useCallback(async (inputEmail: string) => {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inputEmail,
          action: OTP_ACTION.LOGIN,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setApiError(
          data.error?.message || 'ログインコードの送信に失敗しました。',
        );
        return;
      }

      setEmail(inputEmail);
      setStep('otp');
    } catch (error) {
      const { message } = handleApiError(error);
      setApiError(message || 'ネットワークエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const handleOtpVerifySuccess = useCallback(
    async (verificationToken?: string) => {
      setIsSubmitting(true);
      setApiError(null);

      try {
        const result = await signIn('credentials', {
          redirect: false,
          email,
          loginMethod: 'otp',
          verificationToken,
        });

        if (result?.error) {
          const message = resolveSignInErrorMessage(result.code);
          setApiError(message);
          toast({
            title: TOAST_TITLES.LOGIN_ERROR,
            description: message,
            variant: 'error',
          });
          return;
        }

        toast({
          title: TOAST_TITLES.LOGIN_SUCCESS,
          description: TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
          variant: 'success',
        });

        router.push(resolveSafeCallbackUrl(callbackUrl));
      } catch (error) {
        const { message } = handleApiError(error);
        setApiError(message || AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        toast({
          title: TOAST_TITLES.LOGIN_ERROR,
          description: message || AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
          variant: 'error',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, router, toast, callbackUrl],
  );

  const handleBackToEmail = useCallback(() => {
    setStep('email');
    setApiError(null);
  }, []);

  return {
    step,
    email,
    isSubmitting,
    apiError,
    handleSendOtp,
    handleOtpVerifySuccess,
    handleBackToEmail,
  };
}
