/**
 * パスワード再設定フォームのロジック
 */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { API_ENDPOINTS, ROUTES, UI_ERROR_MESSAGES } from '@/constants';
import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';
import type { PasswordResetConfirmFormData } from '@/schema/auth';

interface UseResetPasswordParams {
  /** メールのリンクに載っていたトークン */
  token?: string;
}

interface UseResetPasswordResult {
  /** 再設定が完了したか */
  isCompleted: boolean;
  isSubmitting: boolean;
  error: string | null;
  submit: (data: PasswordResetConfirmFormData) => Promise<void>;
}

/**
 * パスワードの再設定を扱う
 *
 * @param params - トークン
 * @returns 送信状態とハンドラー
 */
export function useResetPassword({
  token,
}: UseResetPasswordParams): UseResetPasswordResult {
  const router = useRouter();
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (data: PasswordResetConfirmFormData) => {
      if (!token) {
        setError(PASSWORD_RESET_MESSAGES.TOKEN_MISSING);
        return;
      }

      setError(null);
      setIsSubmitting(true);

      try {
        const response = await fetch(API_ENDPOINTS.PASSWORD_RESET_CONFIRM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password: data.password }),
        });

        const json = await response.json();

        if (!response.ok) {
          setError(json.error?.message || PASSWORD_RESET_MESSAGES.RESET_FAILED);
          return;
        }

        setIsCompleted(true);
        // 再設定後は既存セッションが無効化されるため、ログインし直してもらう
        router.push(ROUTES.LOGIN);
      } catch {
        setError(UI_ERROR_MESSAGES.NETWORK_ERROR);
      } finally {
        setIsSubmitting(false);
      }
    },
    [token, router],
  );

  return { isCompleted, isSubmitting, error, submit };
}
