/**
 * パスワードリセット発行フォームのロジック
 */

'use client';

import { useCallback, useState } from 'react';

import { API_ENDPOINTS, UI_ERROR_MESSAGES } from '@/constants';
import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';
import type { PasswordResetRequestFormData } from '@/schema/auth';

interface UseForgotPasswordResult {
  /** 送信済みか（済んだら入力欄を隠して案内だけ出す） */
  isSent: boolean;
  isSubmitting: boolean;
  error: string | null;
  submit: (data: PasswordResetRequestFormData) => Promise<void>;
}

/**
 * パスワード再設定リンクの送信を扱う
 *
 * @returns 送信状態とハンドラー
 */
export function useForgotPassword(): UseForgotPasswordResult {
  const [isSent, setIsSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: PasswordResetRequestFormData) => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(API_ENDPOINTS.PASSWORD_RESET_REQUEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });

      const json = await response.json();

      if (!response.ok) {
        setError(json.error?.message || PASSWORD_RESET_MESSAGES.RESET_FAILED);
        return;
      }

      setIsSent(true);
    } catch {
      setError(UI_ERROR_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { isSent, isSubmitting, error, submit };
}
