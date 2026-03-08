/**
 * セッション期限切れ検知コンポーネント
 *
 * セッションが確定的にunauthenticatedになった場合、NextAuthのsignOutを実行してログインページへ遷移する。
 * - authenticated → unauthenticated（ライブセッション切れ）
 * - loading → unauthenticated（リロード時にセッション期限切れ）
 */

'use client';

import { memo, useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

import { ROUTES } from '@/constants';

/** signOut対象外のパス（認証ページ） */
const AUTH_PATHS = [ROUTES.LOGIN, ROUTES.REGISTER];

/**
 * セッション期限切れを検知してログアウトするフック
 */
export function useSessionExpiry() {
  const { status } = useSession();
  const pathname = usePathname();
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const wasLoading = prevStatusRef.current === 'loading';
    const wasAuthenticated = prevStatusRef.current === 'authenticated';
    const isAuthPage = AUTH_PATHS.some((path) => pathname.startsWith(path));

    if (
      (wasLoading || wasAuthenticated) &&
      status === 'unauthenticated' &&
      !isAuthPage
    ) {
      signOut({ callbackUrl: ROUTES.LOGIN });
    }
    prevStatusRef.current = status;
  }, [status, pathname]);
}

export const SessionExpiryHandler = memo(function SessionExpiryHandler() {
  useSessionExpiry();
  return null;
});

SessionExpiryHandler.displayName = 'SessionExpiryHandler';
