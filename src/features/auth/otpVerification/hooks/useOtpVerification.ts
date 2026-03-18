/**
 * OTP検証カスタムフック
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

import { OTP_CONFIG } from '@/constants/otp';
import type { OtpAction } from '@/constants/otp';
import { UI_ERROR_MESSAGES } from '@/constants';

interface UseOtpVerificationProps {
  email: string;
  action: OtpAction;
  onVerifySuccess?: () => void;
}

interface UseOtpVerificationReturn {
  isSubmitting: boolean;
  isResending: boolean;
  resendCountdown: number;
  canResend: boolean;
  apiError: string | null;
  remainingAttempts: number | null;
  handleVerify: (code: string) => Promise<void>;
  handleResend: () => Promise<void>;
}

export function useOtpVerification({
  email,
  action,
  onVerifySuccess,
}: UseOtpVerificationProps): UseOtpVerificationReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState<number>(
    OTP_CONFIG.RESEND_INTERVAL_SECONDS,
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(
    null,
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // カウントダウンタイマー
  useEffect(() => {
    if (resendCountdown > 0) {
      timerRef.current = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resendCountdown]);

  const canResend = resendCountdown === 0 && !isResending;

  const handleVerify = useCallback(
    async (code: string) => {
      setIsSubmitting(true);
      setApiError(null);

      try {
        const response = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, action }),
        });

        const data = await response.json();

        if (!response.ok) {
          setApiError(
            data.error?.message || UI_ERROR_MESSAGES.OTP_VERIFY_FAILED,
          );
          if (data.error?.details?.remainingAttempts !== undefined) {
            setRemainingAttempts(data.error.details.remainingAttempts);
          }
          return;
        }

        setRemainingAttempts(null);
        onVerifySuccess?.();
      } catch {
        setApiError(UI_ERROR_MESSAGES.NETWORK_ERROR);
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, action, onVerifySuccess],
  );

  const handleResend = useCallback(async () => {
    setIsResending(true);
    setApiError(null);

    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });

      const data = await response.json();

      if (!response.ok) {
        setApiError(data.error?.message || UI_ERROR_MESSAGES.OTP_RESEND_FAILED);
        return;
      }

      // カウントダウンリセット
      setResendCountdown(OTP_CONFIG.RESEND_INTERVAL_SECONDS);
      setRemainingAttempts(null);
    } catch {
      setApiError(UI_ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsResending(false);
    }
  }, [email, action]);

  return {
    isSubmitting,
    isResending,
    resendCountdown,
    canResend,
    apiError,
    remainingAttempts,
    handleVerify,
    handleResend,
  };
}
