/**
 * Next.js Middleware - 認証保護 + CSP nonce 付与
 */

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/auth';
import { ROUTES, AUTH_REQUIRED_ROUTES } from '@/constants/common';
import { buildCspHeader, generateNonce } from '@/lib/security/csp';

/** セッションcookie名（環境に応じて切り替え） */
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

/** 認証が必要なパス（ナビゲーションと共通定義） */
const protectedPaths = AUTH_REQUIRED_ROUTES;

/** 認証ページ */
const authPaths = [ROUTES.LOGIN, ROUTES.REGISTER];

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth;

  // --- CSP nonce の生成とヘッダ準備 ---
  // リクエストごとに nonce を生成し CSP ヘッダを組み立てる。
  // x-nonce はリクエストヘッダに載せ、Server Component（layout.tsx）から
  // 参照できるようにする。CSP はリクエスト/レスポンス双方に設定する
  // （Next.js が自身のスクリプトへ nonce を付与するにはリクエスト側の CSP が必要）。
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = buildCspHeader(nonce, isDev);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  /** 通常応答（NextResponse.next）に nonce 付きリクエストヘッダと CSP を適用する */
  const buildNextResponse = () => {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  };

  /** リダイレクト応答にも CSP を付与する */
  const withCsp = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  };

  const isProtectedPath = protectedPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );
  const isAuthPath = authPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  // ログイン後に元のページへ戻すための callbackUrl 付きサインインURLを生成する
  const buildSignInUrl = () => {
    const signInUrl = new URL(ROUTES.LOGIN, nextUrl);
    signInUrl.searchParams.set(
      'callbackUrl',
      nextUrl.pathname + nextUrl.search,
    );
    return signInUrl;
  };

  // セッション期限切れ検知: cookieはあるがJWT検証に失敗 → cookieを削除してログアウト
  const hasSessionCookie = req.cookies.has(SESSION_COOKIE_NAME);

  if (!isAuthenticated && hasSessionCookie) {
    const response = isProtectedPath
      ? withCsp(NextResponse.redirect(buildSignInUrl()))
      : buildNextResponse();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // 未認証で保護されたパスにアクセス → サインインページへリダイレクト（戻り先を保持）
  if (isProtectedPath && !isAuthenticated) {
    return withCsp(NextResponse.redirect(buildSignInUrl()));
  }

  // 認証済みで認証ページにアクセス → ホームへリダイレクト
  if (isAuthPath && isAuthenticated) {
    return withCsp(NextResponse.redirect(new URL(ROUTES.HOME, nextUrl)));
  }

  return buildNextResponse();
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
