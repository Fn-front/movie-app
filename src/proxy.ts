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
import {
  ROUTES,
  AUTH_REQUIRED_ROUTES,
  ADMIN_REQUIRED_ROUTES,
} from '@/constants/common';
import { USER_ROLE } from '@/constants/auth';

/** セッションcookie名（環境に応じて切り替え） */
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

/** 認証が必要なパス（ナビゲーションと共通定義） */
const protectedPaths = AUTH_REQUIRED_ROUTES;

/** 認証ページ */
const authPaths = [ROUTES.LOGIN, ROUTES.REGISTER];

/** admin ロールが必要なパス */
const adminPaths = ADMIN_REQUIRED_ROUTES;

export const proxy = auth((req) => {
  const { nextUrl } = req;

  // `/api/*` はここでの判定をスキップする。
  //
  // NextAuth 自身のエンドポイント（`/api/auth/*`）を阻害しないため、および
  // API の認可は各 Route Handler が自前で行うため（`withAuth` / `withAdminAuth`
  // / `verifyCronAuth`）。**画面側の判定に頼らない**ことが前提の設計で、
  // ロールの最終判定もルート側にある。
  if (nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 無効化済みセッション（パスワード変更による強制失効・ログインから7日の
  // 絶対期限切れ）でも、session コールバックは user を空文字で埋めた
  // オブジェクトを返すため req.auth 自体は truthy になる。
  // そのため存在確認では判定できず、id の有無で見る必要がある。
  // （NextAuth v5 の auth() は session コールバックの戻り値をラップするため、
  //   コールバックで null を返しても既定値にフォールバックして truthy のまま）
  const isAuthenticated = !!req.auth?.user?.id;

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

  // 第2要素（二段階認証コード）が未了のセッション。
  //
  // OAuthログインは authorize を通らないため、プロバイダ側の認証が済んだ
  // 時点でセッションが張られる。コードを入れるまではどこへも行かせない。
  // セッション自体も session コールバックで空にしてあるため、ここを
  // すり抜けても API は使えない（二重の歯止め）。
  const isTotpPending = Boolean(req.auth?.totpPending);
  const isTotpPath = nextUrl.pathname.startsWith(ROUTES.TOTP_CHALLENGE);

  if (isTotpPending && !isTotpPath) {
    return NextResponse.redirect(new URL(ROUTES.TOTP_CHALLENGE, nextUrl));
  }

  // 入力する必要がない人をこのページに置かない
  if (isTotpPath && !isTotpPending) {
    return NextResponse.redirect(
      new URL(isAuthenticated ? ROUTES.HOME : ROUTES.LOGIN, nextUrl),
    );
  }

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

  // admin 専用パス。
  //
  // 未認証なら上と同じくログインへ送り、ログイン済みで権限が足りなければ
  // ホームへ送る。404 ではなくホームにするのは、存在そのものを隠しても
  // 守りにならないため（APIを直接叩かれれば分かる）。
  //
  // ⚠️ これは入口の体裁に過ぎない。`/api/*` はこの判定を素通りするため、
  // ロールの最終判定は各 API Route の `withAdminAuth` が行う。
  const isAdminPath = adminPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  if (isAdminPath) {
    if (!isAuthenticated) {
      return NextResponse.redirect(buildSignInUrl());
    }

    if (req.auth?.user?.role !== USER_ROLE.ADMIN) {
      return NextResponse.redirect(new URL(ROUTES.HOME, nextUrl));
    }
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
     *
     * `/api/*` は matcher から除外していないが、ハンドラ冒頭で素通しにしている。
     * 除外しても動作は同じで、除外すれば1リクエストあたり数ミリ秒を省ける。
     * ただし「API は proxy を通らない」という前提を暗黙にしたくないため、
     * あえて通してハンドラ側に明示の分岐を置いている。
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
