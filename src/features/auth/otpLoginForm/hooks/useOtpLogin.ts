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
  AUTH_ERROR_MESSAGES,
  TOAST_TITLES,
  TOAST_MESSAGES,
  ROUTES,
} from '@/constants';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';

type OtpLoginStep = 'email' | 'otp';

interface UseOtpLoginReturn {
  step: OtpLoginStep;
  email: string;
  isSubmitting: boolean;
  apiError: string | null;
  handleSendOtp: (email: string) => Promise<void>;
  handleOtpVerifySuccess: () => Promise<void>;
  handleBackToEmail: () => void;
}

export function useOtpLogin(): UseOtpLoginReturn {
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

  const handleOtpVerifySuccess = useCallback(async () => {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        loginMethod: 'otp',
      });

      if (result?.error) {
        setApiError(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        toast({
          title: TOAST_TITLES.LOGIN_ERROR,
          description: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
          variant: 'error',
        });
        return;
      }

      toast({
        title: TOAST_TITLES.LOGIN_SUCCESS,
        description: TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
        variant: 'success',
      });

      router.push(ROUTES.HOME);
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
  }, [email, router, toast]);

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
