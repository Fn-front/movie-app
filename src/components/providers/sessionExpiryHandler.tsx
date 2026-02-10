/**
 * セッション期限切れ検知コンポーネント
 *
 * authenticated → unauthenticated に変化した場合、自動的にログアウトしてログインページへリダイレクトする。
 */

'use client';

import { memo, useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';

import { ROUTES } from '@/constants';

/**
 * セッション期限切れを検知してログアウトするフック
 */
export function useSessionExpiry() {
  const { status } = useSession();
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (
      prevStatusRef.current === 'authenticated' &&
      status === 'unauthenticated'
    ) {
      signOut({ callbackUrl: ROUTES.LOGIN });
    }
    prevStatusRef.current = status;
  }, [status]);
}

export const SessionExpiryHandler = memo(function SessionExpiryHandler() {
  useSessionExpiry();
  return null;
});

SessionExpiryHandler.displayName = 'SessionExpiryHandler';
