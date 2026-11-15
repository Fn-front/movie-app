---
name: middleware
description: Create Next.js Middleware for route protection and request handling
disable-model-invocation: true
---

# Next.js Middleware作成スキル

このスキルは、Next.js Middlewareを使った認証チェック、リダイレクト、リクエスト処理を実装します。

## 必須要件

### アーキテクチャ原則

- **認証チェック**: NextAuth.jsセッション確認
- **パフォーマンス**: 軽量な処理のみ実行
- **matcher**: 対象ルートを明示的に指定
- **Edge Runtime**: エッジで実行（制限あり）

## ファイル配置

```
src/
└── middleware.ts
```

## 基本テンプレート

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Middleware処理

  return NextResponse.next();
}

// マッチャー設定（重要）
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

## 認証保護パターン

### NextAuth.jsセッションチェック

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// 認証が必要なパス
const protectedPaths = ['/home', '/calendar', '/search', '/settings'];

// 認証済みユーザーがアクセスできないパス
const authPaths = ['/login', '/register', '/verify-otp'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // トークン取得
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!token;

  // 保護されたパスへのアクセス
  if (protectedPaths.some((path) => pathname.startsWith(path))) {
    if (!isAuthenticated) {
      const url = new URL('/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  // 認証ページへのアクセス（既にログイン済み）
  if (authPaths.some((path) => pathname.startsWith(path))) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

## メール認証チェック

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 保護されたパスへのアクセス
  if (pathname.startsWith('/home') || pathname.startsWith('/calendar')) {
    if (!token) {
      // 未認証: ログインページへ
      const url = new URL('/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }

    // メール未認証: OTP検証ページへ
    if (!token.isVerified) {
      return NextResponse.redirect(new URL('/verify-otp', request.url));
    }
  }

  return NextResponse.next();
}
```

## Cookie操作

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Cookieを設定
  response.cookies.set('custom-cookie', 'value', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7日間
  });

  // Cookieを取得
  const cookieValue = request.cookies.get('custom-cookie')?.value;

  // Cookieを削除（発行時と同じ属性で空値を上書きする）
  response.cookies.set('custom-cookie', '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
  });

  return response;
}
```

### ⚠️ `cookies.delete(name)` は使わない

文字列だけを渡すと**セキュリティ属性が1つも付かない** `Set-Cookie` が返る。
Next の実装（`node_modules/next/dist/compiled/@edge-runtime/cookies/index.js`）が
`options` を `undefined` のまま `set` へ渡すため。

```js
delete(...args) {
  const [name, options] = typeof args[0] === "string" ? [args[0]] : [args[0].name, args[0]];
  return this.set({ ...options, name, value: "", expires: new Date(0) });
}
```

返るのはこれだけ。`Path` と `Expires` は付くが、`Secure` も `HttpOnly` も
`SameSite` も無い。

```
custom-cookie=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

**`__Secure-` / `__Host-` 接頭辞の付いた Cookie では、ブラウザがこの
`Set-Cookie` を拒否する**（CookiePrefixes）。削除指示そのものが捨てられ、
**本番でだけ静かに効かなくなる**。実際に `src/proxy.ts` の失効セッション
削除がこれで動いていなかった（#1174）。

削除は**発行時と同じ属性**で空値を `set` する。名前・`Path`・`Domain` の
どれかが食い違うとブラウザは別の Cookie として扱い、やはり消えない
（RFC 6265 §5.3）。

> 発行側と削除側で定義を2箇所に書かないこと。このリポジトリでは
> `src/constants/auth.ts` の `getSessionCookieName()` /
> `getSessionCookieOptions()` に集約し、`auth.ts` と `proxy.ts` で共有している。

## Header操作

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // リクエストヘッダーを取得
  const userAgent = request.headers.get('user-agent') || '';

  // レスポンスヘッダーを設定
  const response = NextResponse.next();
  response.headers.set('x-custom-header', 'value');
  response.headers.set('x-user-agent', userAgent);

  // セキュリティヘッダー
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}
```

## リダイレクトパターン

### 条件付きリダイレクト

```typescript
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ルートパスへのアクセス
  if (pathname === '/') {
    // 認証済みならホームへ、未認証ならログインへ
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (token) {
      return NextResponse.redirect(new URL('/home', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}
```

### クエリパラメータ付きリダイレクト

```typescript
export function middleware(request: NextRequest) {
  const url = new URL('/login', request.url);
  url.searchParams.set('callbackUrl', request.nextUrl.pathname);
  url.searchParams.set('error', 'unauthorized');

  return NextResponse.redirect(url);
}
```

## URL書き換え（Rewrite）

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /blog/123 -> /posts/123 に内部的に書き換え
  if (pathname.startsWith('/blog')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace('/blog', '/posts');
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}
```

## レート制限（簡易版）

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 簡易的なレート制限（メモリベース、本番環境ではDB使用推奨）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function middleware(request: NextRequest) {
  const ip = request.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分
  const maxRequests = 100;

  const rateLimit = rateLimitMap.get(ip);

  if (rateLimit) {
    if (now < rateLimit.resetTime) {
      if (rateLimit.count >= maxRequests) {
        return new NextResponse('Too Many Requests', { status: 429 });
      }
      rateLimit.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
  }

  return NextResponse.next();
}
```

## 国際化（i18n）リダイレクト

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const locales = ['ja', 'en'];
const defaultLocale = 'ja';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パスにロケールが含まれているかチェック
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // ロケールがない場合、デフォルトロケールを追加
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
```

## Matcher設定パターン

```typescript
// すべてのパスにマッチ
export const config = {
  matcher: '/:path*',
};

// 特定のパスのみ
export const config = {
  matcher: ['/home/:path*', '/calendar/:path*'],
};

// 正規表現
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

// 複数パターン
export const config = {
  matcher: [
    '/home/:path*',
    '/calendar/:path*',
    '/search/:path*',
  ],
};
```

## Edge Runtime制限

### 使用可能
- `fetch`
- `crypto`
- `URL`
- `URLSearchParams`
- `Headers`
- `Request`
- `Response`

### 使用不可
- Node.js標準ライブラリ（`fs`, `path`, etc.）
- データベース接続（Supabase SDKの一部機能）
- 重い計算処理

## デバッグ

```typescript
export function middleware(request: NextRequest) {
  console.log('Middleware executed:', {
    pathname: request.nextUrl.pathname,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
  });

  return NextResponse.next();
}
```

## プロジェクト要件に基づく実装例

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// 認証が必要なパス
const protectedPaths = ['/home', '/calendar', '/search', '/settings'];

// 認証済みユーザーがアクセスできないパス
const authPaths = ['/login', '/register'];

// OTP検証ページ
const otpPath = '/verify-otp';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイル・API認証は除外
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!token;
  const isVerified = token?.isVerified === true;

  // 1. 保護されたパスへのアクセス
  if (protectedPaths.some((path) => pathname.startsWith(path))) {
    if (!isAuthenticated) {
      // 未認証: ログインページへ
      const url = new URL('/login', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }

    if (!isVerified) {
      // メール未認証: OTP検証ページへ
      return NextResponse.redirect(new URL(otpPath, request.url));
    }
  }

  // 2. 認証ページへのアクセス（既にログイン済み）
  if (authPaths.some((path) => pathname.startsWith(path))) {
    if (isAuthenticated && isVerified) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  // 3. OTP検証ページへのアクセス
  if (pathname === otpPath) {
    if (!isAuthenticated) {
      // 未認証: ログインページへ
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isVerified) {
      // 既に認証済み: ホームページへ
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  // 4. ルートパスへのアクセス
  if (pathname === '/') {
    if (isAuthenticated && isVerified) {
      return NextResponse.redirect(new URL('/home', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/home/:path*',
    '/calendar/:path*',
    '/search/:path*',
    '/settings/:path*',
    '/login',
    '/register',
    '/verify-otp',
  ],
};
```

## 参考ドキュメント

- `.claude/documents/authentication-flow.md` - 認証フロー
- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)

## 使用例

```bash
# Middleware作成
/middleware
```
