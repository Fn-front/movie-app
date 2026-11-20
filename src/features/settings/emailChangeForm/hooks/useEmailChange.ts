/**
 * メールアドレス変更を扱うカスタムフック（#1359）
 *
 * 画面は「入力」→「コード入力」の2状態を行き来する。
 *
 * ⚠️ **成功するとログイン識別子が変わる。** セッションの `email` は古いままなので、
 * `update()` でセッションを更新しないと設定画面が旧アドレスを出し続ける。
 */

'use client';

import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';

import { API_ENDPOINTS } from '@/constants';
import {
  EMAIL_CHANGE_MESSAGES,
  EMAIL_CHANGE_VIEW,
  type EmailChangeView,
} from '@/constants/emailChange';

interface UseEmailChangeResult {
  view: EmailChangeView;
  /** コードの送信先（確認画面に出す） */
  pendingEmail: string;
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  /** 確認コードを送る */
  requestCode: (newEmail: string, currentPassword: string) => Promise<void>;
  /** コードを検証してアドレスを差し替える */
  confirmCode: (code: string) => Promise<void>;
  /** 入力画面へ戻る */
  reset: () => void;
}

/**
 * メールアドレス変更
 *
 * @returns 画面の状態とハンドラ
 */
export function useEmailChange(): UseEmailChangeResult {
  const { update } = useSession();
  const [view, setView] = useState<EmailChangeView>(EMAIL_CHANGE_VIEW.INPUT);
  const [pendingEmail, setPendingEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useCallback(() => {
    setView(EMAIL_CHANGE_VIEW.INPUT);
    setPendingEmail('');
    setError(null);
    setNotice(null);
  }, []);

  const requestCode = useCallback(
    async (newEmail: string, currentPassword: string) => {
      setIsSubmitting(true);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(API_ENDPOINTS.USER_EMAIL_CHANGE_REQUEST, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newEmail, currentPassword }),
        });

        const json = await response.json().catch(() => null);

        if (!response.ok || !json?.success) {
          setError(json?.error?.message ?? EMAIL_CHANGE_MESSAGES.FAILED);

          return;
        }

        // ⚠️ 送信先は**サーバーへ渡した値**を覚える。応答から取らないのは、
        //   正規化（小文字化）の結果が返ってこないため
        setPendingEmail(newEmail);
        setNotice(EMAIL_CHANGE_MESSAGES.CODE_SENT);
        setView(EMAIL_CHANGE_VIEW.CODE);
      } catch {
        setError(EMAIL_CHANGE_MESSAGES.FAILED);
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const confirmCode = useCallback(
    async (code: string) => {
      setIsSubmitting(true);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(API_ENDPOINTS.USER_EMAIL_CHANGE_CONFIRM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newEmail: pendingEmail, code }),
        });

        const json = await response.json().catch(() => null);

        if (!response.ok || !json?.success) {
          setError(json?.error?.message ?? EMAIL_CHANGE_MESSAGES.FAILED);

          return;
        }

        // ⚠️ **セッションを更新する。** しないと設定画面もパスワード変更
        //   フォームも旧アドレスを出し続け、利用者は変わったのか分からない
        await update();

        setNotice(EMAIL_CHANGE_MESSAGES.CHANGED);
        setView(EMAIL_CHANGE_VIEW.INPUT);
        setPendingEmail('');
      } catch {
        setError(EMAIL_CHANGE_MESSAGES.FAILED);
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingEmail, update],
  );

  return {
    view,
    pendingEmail,
    isSubmitting,
    error,
    notice,
    requestCode,
    confirmCode,
    reset,
  };
}
