/**
 * アカウント削除を扱うカスタムフック（#932）
 *
 * ⚠️ **成功したらもう戻れない。** 失敗の扱いが他のフォームと違う点に注意。
 * 削除そのものが成功したあとにログアウトで落ちても、アカウントは消えている。
 * 「やり直してください」と出すと利用者を混乱させる。
 */

'use client';

import { useCallback, useState } from 'react';

import { API_ENDPOINTS, ROUTES } from '@/constants';
import { ACCOUNT_DELETE_MESSAGES } from '@/constants/auth';
import { logout } from '@/lib/auth/logout';
import { clearConsentRecord } from '@/utils/cookieConsent';

/** 削除に添える確認情報 */
export interface DeleteAccountInput {
  /** 現在のパスワード。持っていない利用者（ソーシャル連携のみ）は省く */
  currentPassword?: string;
  /** 第2要素のコード。未設定の利用者は省く */
  code?: string;
}

interface UseDeleteAccountResult {
  isSubmitting: boolean;
  error: string | null;
  /**
   * 第2要素のコードが要るか
   *
   * ⚠️ 判定できるまで `null`。`false` で初期化すると、**設定済みの利用者に
   * 一瞬だけ入力欄の無いダイアログを見せて**送信できてしまう。
   */
  secondFactorRequired: boolean | null;
  /** ダイアログを開くときに呼ぶ。第2要素の有無を取りにいく */
  loadRequirement: () => Promise<void>;
  /** 削除する。成功するとログアウトして遷移するため、通常は戻ってこない */
  deleteAccount: (input: DeleteAccountInput) => Promise<void>;
  clearError: () => void;
}

/**
 * アカウント削除
 *
 * @returns 送信状態とハンドラ
 */
export function useDeleteAccount(): UseDeleteAccountResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondFactorRequired, setSecondFactorRequired] = useState<
    boolean | null
  >(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * 第2要素の有無を取りにいく
   *
   * ⚠️ 設定ページに常時リクエストを足さないよう、**ダイアログを開いたときだけ**
   * 呼ぶ。取得に失敗したら「要る」側へ倒す —— 入力欄を出さずに送ると
   * サーバーが 400 を返すだけで、利用者には理由が分からない。
   */
  const loadRequirement = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.USER_TOTP);
      const json = await response.json();

      setSecondFactorRequired(response.ok ? Boolean(json?.data?.method) : true);
    } catch {
      setSecondFactorRequired(true);
    }
  }, []);

  const deleteAccount = useCallback(async (input: DeleteAccountInput) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.USER, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        setError(json?.error?.message ?? ACCOUNT_DELETE_MESSAGES.FAILED);
        setIsSubmitting(false);

        return;
      }

      // ⚠️ ここから先で失敗しても**アカウントは消えている**。
      //   `isSubmitting` を戻さないのは、再送信させないため

      // ⚠️ `clearOwnedConsent()` ではない。あちらは owner が空なら
      //   何もしないので、退会には無条件消去のほうが正しい（#932）
      clearConsentRecord();

      await logout(ROUTES.HOME);
    } catch {
      // ⚠️ 削除が通った後のログアウト失敗もここに来る。どちらか分からないので
      //   「消えたかもしれない」を前提に、やり直しではなく再読み込みを促す
      setError(ACCOUNT_DELETE_MESSAGES.LOGOUT_FAILED);
      setIsSubmitting(false);
    }
  }, []);

  return {
    isSubmitting,
    error,
    secondFactorRequired,
    loadRequirement,
    deleteAccount,
    clearError,
  };
}
