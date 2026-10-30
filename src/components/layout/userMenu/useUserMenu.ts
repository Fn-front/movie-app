/**
 * UserMenuコンポーネントのロジックフック
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { ROUTES } from '@/constants/common';

/**
 * UserMenuのロジックを管理するカスタムフック
 */
export const useUserMenu = () => {
  const router = useRouter();

  /** 設定画面へ遷移 */
  const handleNavigateToSettings = useCallback(() => {
    router.push(ROUTES.SETTINGS);
  }, [router]);

  /** アカウント管理画面へ遷移（admin ロールのみ導線を出す） */
  const handleNavigateToAdminAccounts = useCallback(() => {
    router.push(ROUTES.ADMIN_ACCOUNTS);
  }, [router]);

  /** ログアウト処理 */
  const handleLogout = useCallback(async () => {
    await signOut({ callbackUrl: ROUTES.LOGIN });
  }, []);

  return {
    handleNavigateToSettings,
    handleNavigateToAdminAccounts,
    handleLogout,
  };
};
