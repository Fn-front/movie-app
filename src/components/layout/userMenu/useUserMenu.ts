/**
 * UserMenuコンポーネントのロジックフック
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { ROUTES } from '@/constants/common';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { useToastDispatch } from '@/hooks/useToast';
import { logout } from '@/lib/auth/logout';

/**
 * UserMenuのロジックを管理するカスタムフック
 */
export const useUserMenu = () => {
  const router = useRouter();
  const { toast } = useToastDispatch();

  /** 設定画面へ遷移 */
  const handleNavigateToSettings = useCallback(() => {
    router.push(ROUTES.SETTINGS);
  }, [router]);

  /** アカウント管理画面へ遷移（admin ロールのみ導線を出す） */
  const handleNavigateToAdminAccounts = useCallback(() => {
    router.push(ROUTES.ADMIN_ACCOUNTS);
  }, [router]);

  /** 受賞作品の手動同期画面へ遷移（admin ロールのみ導線を出す） */
  const handleNavigateToAdminAwardSync = useCallback(() => {
    router.push(ROUTES.ADMIN_AWARDS);
  }, [router]);

  /**
   * ログアウト処理
   *
   * ⚠️ `logout()` は失敗すると throw して**遷移しない**（#1195）。
   * 握り潰すと「押したのに何も起きない」になるうえ、Radix の `onSelect` は
   * 返り値の Promise を見ないので unhandled rejection になる。
   * 利用者に伝えてから止める
   */
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      toast({
        title: 'エラー',
        description: AUTH_ERROR_MESSAGES.LOGOUT_FAILED,
        variant: 'error',
      });
    }
  }, [toast]);

  return {
    handleNavigateToSettings,
    handleNavigateToAdminAccounts,
    handleNavigateToAdminAwardSync,
    handleLogout,
  };
};
