/**
 * 管理者発行アカウントの画面状態を扱うカスタムフック
 *
 * 宛先メールアドレスはDBに保存しないため、送信後はフォームから消す。
 * 画面に残し続けると、誰に送ったかの履歴が画面上だけに溜まる。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  createIssuedAccount,
  fetchIssuedAccounts,
  reissueAccountLink,
  type IssuedAccount,
} from '@/lib/api/adminAccounts/adminAccounts';
import { ADMIN_ACCOUNT_MESSAGES } from '@/constants/adminAccount';
import { isAxiosError } from 'axios';

/**
 * サーバーが返したメッセージを優先して取り出す
 *
 * レート制限や「管理者発行ではないため再発行できません」など、原因が分かる
 * メッセージをそのまま見せたい。`formatErrorMessage` は `Response` を参照する
 * ため jsdom 環境のテストで落ちるので、ここでは使わない。
 *
 * @param cause - catch したエラー
 * @param fallback - サーバーのメッセージが取れないときの文言
 */
function toMessage(cause: unknown, fallback: string): string {
  if (isAxiosError(cause)) {
    const data = cause.response?.data as
      | { error?: { message?: unknown } }
      | undefined;
    const message = data?.error?.message;

    if (typeof message === 'string' && message) return message;
  }

  return fallback;
}

interface UseAdminAccountsResult {
  accounts: IssuedAccount[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  /** 発行したアカウント名（画面に一度だけ出す） */
  issuedUsername: string | null;
  createAccount: (email: string) => Promise<void>;
  reissueLink: (id: string, email: string) => Promise<void>;
  dismissNotice: () => void;
}

/**
 * アカウント一覧の取得・発行・再発行をまとめる
 */
export function useAdminAccounts(): UseAdminAccountsResult {
  const [accounts, setAccounts] = useState<IssuedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuedUsername, setIssuedUsername] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setAccounts(await fetchIssuedAccounts());
    } catch (cause) {
      setError(toMessage(cause, ADMIN_ACCOUNT_MESSAGES.FETCH_ERROR));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createAccount = useCallback(
    async (email: string) => {
      setIsSubmitting(true);
      setError(null);
      setNotice(null);
      setIssuedUsername(null);

      try {
        const username = await createIssuedAccount(email);
        setIssuedUsername(username);
        setNotice(ADMIN_ACCOUNT_MESSAGES.CREATED);
        await load();
      } catch (cause) {
        setError(toMessage(cause, ADMIN_ACCOUNT_MESSAGES.CREATE_ERROR));
      } finally {
        setIsSubmitting(false);
      }
    },
    [load],
  );

  const reissueLink = useCallback(async (id: string, email: string) => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    setIssuedUsername(null);

    try {
      await reissueAccountLink(id, email);
      setNotice(ADMIN_ACCOUNT_MESSAGES.REISSUED);
    } catch (cause) {
      setError(toMessage(cause, ADMIN_ACCOUNT_MESSAGES.REISSUE_ERROR));
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
    setIssuedUsername(null);
  }, []);

  return {
    accounts,
    isLoading,
    isSubmitting,
    error,
    notice,
    issuedUsername,
    createAccount,
    reissueLink,
    dismissNotice,
  };
}
