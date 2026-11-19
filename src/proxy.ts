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
import {
  USER_ROLE,
  getSessionCookieName,
  getSessionCookieOptions,
} from '@/constants/auth';

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
  //
  // ⚠️ 判定を飛ばすだけで、**セッション読み取りは既に終わっている**。
  // ここより手前の `handleAuth` が実行済みで、更新後のCookieの保存も
  // そこで行われる。matcher から外して「通さない」ようにすると、その
  // 保存ごと失われて DB 往復が増える（下の `config` の⚠️ / #1281）。
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
  //
  // ⚠️ **第2要素が未了のセッションを除く**（#1150）。`totpPending` のとき
  // session コールバックは `user.id` を空文字にするため `isAuthenticated` が
  // false になるが、これは「JWT が壊れている」のではなく**認証の途中**。
  // `/auth/two-factor` は `AUTH_REQUIRED_ROUTES` に含まれず保護パス判定も
  // 通らないので、除外しないと画面を開いた瞬間に Cookie が消える。
  // そうなると `update({ totpCode })` が成立せず、何度入力しても
  // 「認証コードが正しくありません」が出続けてログインできない。
  const sessionCookieName = getSessionCookieName();
  const hasSessionCookie = req.cookies.has(sessionCookieName);

  if (!isAuthenticated && !isTotpPending && hasSessionCookie) {
    const response = isProtectedPath
      ? NextResponse.redirect(buildSignInUrl())
      : NextResponse.next();

    // ⚠️ `cookies.delete(name)` を使わない（#1174）。
    // 文字列を渡すと options が undefined になり、`Secure` も `HttpOnly` も
    // `SameSite` も付かない `Set-Cookie` が返る。本番の Cookie 名は
    // `__Secure-` 接頭辞付きで、ブラウザは `Secure` の無い `Set-Cookie` を
    // **拒否する**ため、削除指示そのものが捨てられていた。
    // 発行時（auth.ts の cookies.sessionToken）と同じ属性で空値を上書きする。
    response.cookies.set(sessionCookieName, '', {
      ...getSessionCookieOptions(),
      maxAge: 0,
    });
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
     * ⚠️ **`/api/*` をここから除外しないこと**（#1281 で実測）。
     *
     * `auth((req) => ...)` のラッパー形式は、ハンドラを呼ぶ**前に**
     * `getSession()` を実行する（`node_modules/next-auth/lib/index.js` の
     * `handleAuth`）。つまり下の早期 return に入る時点でセッション読み取りは
     * 終わっている。「除外すれば1リクエストあたり数ミリ秒を省ける」と
     * 書いてあったが、省けるのは分岐ではなくその `getSession()` 一式で、
     * **除外すると DB の往復はむしろ増える。**
     *
     * proxy は `getSession()` のついでに更新後のセッション Cookie を保存する
     * **唯一の経路**だからで、除外すると `/api/*` ではトークンが一切
     * リフレッシュされなくなる。`lastPasswordCheck` の5分窓が開いたままに
     * なり、Route Handler 側の確認が毎回 `users` を引く。
     *
     * `next dev` での実測（2026-11-19。`users` への SELECT 回数）:
     *
     *   | | 現状 | `/api/*` を除外 |
     *   |---|---|---|
     *   | API 1本 | 2 | 1 |
     *   | API 5本・逐次（Cookieを持ち回る） | **2** | **5** |
     *
     * 1本だけ見ると改善に見えるが、2本目以降が効かなくなるので
     * 叩くほど悪化する。省けるのは JWT の復号（HMAC。1ミリ秒未満）だけで、
     * 代わりにネットワーク越しの DB 往復が増える取引になる。
     *
     * 同時並行で重なるぶんは `src/lib/auth/sessionUserLookup.ts` が畳む。
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
