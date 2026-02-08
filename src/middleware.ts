/**
 * Next.js Middleware - 認証保護
 */

import { auth } from '@/lib/auth/auth';

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
