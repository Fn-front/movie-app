/**
 * Next.js Proxy - ルーティング層の軽量認証チェック
 *
 * Next.js 16 で middleware → proxy に移行。
 * auth() ラッパーを使わず、cookieの有無による軽量チェックのみ行う。
 * JWT署名検証や権限チェック等の詳細な認証検証は
 * Server Components / layouts で実施する。
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { ROUTES } from '@/constants/common';

/** セッションcookie名（環境に応じて切り替え） */
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

/** 認証が必要なパス */
const protectedPaths = [ROUTES.WATCHLIST, ROUTES.SETTINGS, ROUTES.FAVORITES];

/** 認証ページ */
const authPaths = [ROUTES.LOGIN, ROUTES.REGISTER];

export function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  const isProtectedPath = protectedPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );
  const isAuthPath = authPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  // 未認証（cookieなし）で保護されたパスにアクセス → サインインページへリダイレクト
  if (isProtectedPath && !hasSessionCookie) {
    return NextResponse.redirect(new URL(ROUTES.LOGIN, nextUrl));
  }

  // 認証済み（cookieあり）で認証ページにアクセス → ホームへリダイレクト
  if (isAuthPath && hasSessionCookie) {
    return NextResponse.redirect(new URL(ROUTES.HOME, nextUrl));
  }

  return NextResponse.next();
}

// Proxyを適用するパスを設定
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
