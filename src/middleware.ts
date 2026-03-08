/**
 * Next.js Middleware - 認証保護
 */

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/auth';

/** セッションcookie名（環境に応じて切り替え） */
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth;

  // 認証が必要なパス
  const protectedPaths = ['/dashboard', '/profile', '/watchlist', '/settings'];

  // 認証ページ
  const authPaths = ['/auth/signin', '/auth/signup'];

  const isProtectedPath = protectedPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );
  const isAuthPath = authPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  // セッション期限切れ検知: cookieはあるがJWT検証に失敗 → cookieを削除してログアウト
  const hasSessionCookie = req.cookies.has(SESSION_COOKIE_NAME);

  if (!isAuthenticated && hasSessionCookie) {
    const response = isProtectedPath
      ? NextResponse.redirect(new URL('/auth/signin', nextUrl))
      : NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // 未認証で保護されたパスにアクセス → サインインページへリダイレクト
  if (isProtectedPath && !isAuthenticated) {
    return Response.redirect(new URL('/auth/signin', nextUrl));
  }

  // 認証済みで認証ページにアクセス → ホームへリダイレクト
  if (isAuthPath && isAuthenticated) {
    return Response.redirect(new URL('/', nextUrl));
  }

  return;
});

// Middlewareを適用するパスを設定
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
