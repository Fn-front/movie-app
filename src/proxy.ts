/**
 * Next.js Proxy - 認証保護（旧 middleware.ts / Next.js 16 対応）
 *
 * CSP は static prerender を維持するため next.config.mjs で静的配信する
 * （script-src 'unsafe-inline' 許容により nonce 不要）。ここでは認証保護のみを担う。
 *
 * proxy はネットワーク層のリダイレクト/リライトに徹し、認可の最終判定は
 * Server Components / Route Handlers 側でも二重に行う設計とする。
 */

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/auth';
import { ROUTES, AUTH_REQUIRED_ROUTES } from '@/constants/common';

/** セッションcookie名（環境に応じて切り替え） */
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

/** 認証が必要なパス（ナビゲーションと共通定義） */
const protectedPaths = AUTH_REQUIRED_ROUTES;

/** 認証ページ */
const authPaths = [ROUTES.LOGIN, ROUTES.REGISTER];

export const proxy = auth((req) => {
  const { nextUrl } = req;

  // 本番Vercelデプロイではローカル運用のためcron以外を全て404で隠す。
  // Vercel Cronは /api/cron/* のみ通過させ、routeハンドラの Bearer 認証へ委ねる。
  if (process.env.VERCEL_ENV === 'production') {
    if (nextUrl.pathname.startsWith('/api/cron/')) {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 404 });
  }

  // ローカル/Preview: NextAuth の API 系はミドルウェア判定をスキップする
  if (nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const isAuthenticated = !!req.auth;

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
      ? NextResponse.redirect(buildSignInUrl())
      : NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // 未認証で保護されたパスにアクセス → サインインページへリダイレクト（戻り先を保持）
  if (isProtectedPath && !isAuthenticated) {
    return NextResponse.redirect(buildSignInUrl());
  }

  // 認証済みで認証ページにアクセス → ホームへリダイレクト
  if (isAuthPath && isAuthenticated) {
    return NextResponse.redirect(new URL(ROUTES.HOME, nextUrl));
  }

  return NextResponse.next();
});

// Middlewareを適用するパスを設定
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * NOTE: 本番Vercel環境で /api/* 配下も封鎖するため api は除外しない。
     * ローカル/Preview では冒頭で /api/ を素通しにして NextAuth 等の
     * 動作を阻害しないようにしている。
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
