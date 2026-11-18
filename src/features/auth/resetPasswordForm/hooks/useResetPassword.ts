/**
 * パスワード再設定フォームのロジック
 */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { API_ENDPOINTS, ROUTES, UI_ERROR_MESSAGES } from '@/constants';
import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';
import { cleanUpBeforeSignOut } from '@/lib/auth/logout';
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

        // ログイン中に行われた Cookie 同意（owner 付き）を消す。
        //
        // サーバーがセッション Cookie を失効させる（#1234）が、それは
        // `logout()` を通らない経路なので後始末が走らない。`useSession` は
        // ポーリングしないため（`sessionProvider.tsx` に refetchInterval が
        // 無く、再取得は visibilitychange と storage のみ）、Cookie が消えても
        // status は `authenticated` のまま据え置かれ、`useConsentServerSync` の
        // 保険も発火しない。
        //
        // 残すと、このままタブを閉じた端末を次に使った人へ**前の利用者の
        // 同意が1ページロード分適用される**（`layout.tsx` の `<head>` は
        // 認証状態を同期読みできない）。`logout.ts` が塞いだ窓と同じ
        cleanUpBeforeSignOut();

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
