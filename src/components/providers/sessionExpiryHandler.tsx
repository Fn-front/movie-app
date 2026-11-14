/**
 * セッション期限切れ検知コンポーネント
 *
 * セッションが確定的にunauthenticatedになった場合、NextAuthのsignOutを実行してログインページへ遷移する。
 * - authenticated → unauthenticated（ライブセッション切れ）
 *
 * ※ loading → unauthenticated（リロード時）はproxyがサーバーサイドで
 *   期限切れcookieの削除とリダイレクトを処理するため、クライアント側では対応しない。
 *   これにより未ログインユーザーが公開ページに正常にアクセスできる。
 */

'use client';

import { memo, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

import { ROUTES } from '@/constants';
import { logout } from '@/lib/auth/logout';
import { confirmSignedOut } from '@/lib/auth/sessionProbe';

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
    const wasAuthenticated = prevStatusRef.current === 'authenticated';
    const isAuthPage = AUTH_PATHS.some((path) => pathname.startsWith(path));
    prevStatusRef.current = status;

    if (!wasAuthenticated || status !== 'unauthenticated' || isAuthPage) return;

    let cancelled = false;

    // ⚠️ status の変化だけでログアウトしてはいけない（#1136）。
    // next-auth は `/api/auth/session` の通信失敗も非2xxも null に潰すため、
    // authenticated → unauthenticated は「期限切れ」と「応答を得られなかった」
    // の両方を意味する。後者で logout() を呼ぶと、回線が1度こけただけで
    // **サーバー側のセッションまで破棄**され（signOut は /api/auth/signout を
    // POST する）、Cookie 同意レコードも消える。
    void confirmSignedOut().then((signedOut) => {
      // 応答待ちの間に再取得が成功していたら、もう期限切れではない
      if (cancelled || !signedOut) return;
      void logout();
    });

    return () => {
      cancelled = true;
    };
  }, [status, pathname]);
}

export const SessionExpiryHandler = memo(function SessionExpiryHandler() {
  useSessionExpiry();
  return null;
});

SessionExpiryHandler.displayName = 'SessionExpiryHandler';
