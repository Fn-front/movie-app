---
name: middleware
description: Create Next.js Proxy (formerly Middleware) for route protection and request handling
disable-model-invocation: true
---

# Next.js Proxy（旧 Middleware）作成スキル

このスキルは、リクエストがアプリに届く前に走る処理 —— 認証チェック、
リダイレクト、ヘッダ・Cookie 操作 —— を実装します。

> ⚠️ **Next.js 16 で Middleware は Proxy に改名された。** 機能は同じ。
> `middleware.js` の規約は**非推奨**で、`proxy.js` を見る
> （`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`）。
>
> スキル名が `/middleware` のままなのは、呼び出し側の慣れを壊さないため。
> **中身はすべて proxy 前提**で読むこと。

## 必須要件

### アーキテクチャ原則

- **認証チェック**: NextAuth.js（v5）の `auth()` ラッパを使う
- **パフォーマンス**: 軽量な処理のみ。重いデータ取得は置かない
- **matcher**: 対象ルートを明示的に指定
- **最終判定はここではない**: proxy はネットワーク層のリダイレクト／リライトに
  徹し、認可の最終判定は Server Components / Route Handlers 側でも二重に行う

## ファイル配置

```
src/
└── proxy.ts
```

- **プロジェクトに1つだけ**。`app` / `pages` と同じ階層に置く
- ロジックを分けたいときは別ファイルへ切り出して `proxy.ts` から import する

## 基本テンプレート

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 名前付き `proxy`、または default export のどちらか
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

// マッチャー設定（重要）
export const config = {
  matcher: [
    /*
     * 次を除くすべてのパスにマッチ:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico
     * - 画像の拡張子
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

> ⚠️ **`export function middleware` にしない。** Next 16 が探すのは
> `proxy`（名前付き）か default export。名前が違うと**何も起きない**まま
> 通過するので、認証保護を書いたつもりで無防備になる。

## 実行環境（Edge ではない）

**Next 16 の Proxy は既定で Node.js ランタイム**で動く
（`proxy.md` の「Proxy defaults to using the Node.js runtime」）。

- `runtime` の config は**指定できない**。書くとエラーになる
- Node.js の標準ライブラリや DB クライアントも動く。実際に
  `src/proxy.ts` は `@/lib/auth/auth`（Supabase クライアントを含む）を import している

⚠️ 「Edge だから Node API が使えない」という前提で書かないこと。
Middleware が Edge 固定だったのは Next 15.2 より前の話。

ただし**重い処理を置かない**方針は変わらない。ここは全リクエストの手前で
走るため、遅い取得を挟むと全ページが遅くなる。

## 認証保護パターン（このリポジトリの実装）

NextAuth v5 は `auth()` でハンドラを包むと `req.auth` にセッションが入る。

```typescript
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/auth';
import { ROUTES, AUTH_REQUIRED_ROUTES } from '@/constants/common';

export const proxy = auth((req) => {
  const { nextUrl } = req;

  // ⚠️ 無効化済みセッションでも session コールバックは user を空文字で
  //    埋めたオブジェクトを返すため `req.auth` 自体は truthy になる。
  //    存在確認では判定できず、id の有無で見る必要がある
  const isAuthenticated = !!req.auth?.user?.id;

  const isProtectedPath = AUTH_REQUIRED_ROUTES.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  if (isProtectedPath && !isAuthenticated) {
    const signInUrl = new URL(ROUTES.LOGIN, nextUrl);
    // ログイン後に元のページへ戻す
    signInUrl.searchParams.set(
      'callbackUrl',
      nextUrl.pathname + nextUrl.search,
    );

    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});
```

> ⛔ **`getToken()` を使わない。** NextAuth v4 のAPIで、このリポジトリには
> 1か所も無い。v5 では `auth()` ラッパが同じ役割を担う。
>
> ⚠️ パスは**ベタ書きしない**。`src/constants/common.ts` の `ROUTES` /
> `AUTH_REQUIRED_ROUTES` / `ADMIN_REQUIRED_ROUTES` を使う。proxy と
> ナビゲーションで定義を共有しており、片方だけ変えると
> 「ナビには出るのにアクセスできない」状態になる。

### `/api/*` は判定を飛ばすが、matcher からは外さない

```typescript
if (nextUrl.pathname.startsWith('/api/')) {
  return NextResponse.next();
}
```

- NextAuth 自身のエンドポイント（`/api/auth/*`）を阻害しないため
- API の認可は各 Route Handler が自前で行うため（`withAuth` / `withAdminAuth`）

⚠️ **matcher から外さないこと。** 判定を飛ばしても**セッションの読み取りは
既に終わっており**、更新後の Cookie の保存もそこで行われる。matcher から
外すとその保存ごと失われ、API を叩くほど DB 往復が増える（#1281。実測は
`src/proxy.ts` の `config` のコメント）。

## Cookie操作

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Cookieを設定
  response.cookies.set('custom-cookie', 'value', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7日間
  });

  // Cookieを取得
  const cookieValue = request.cookies.get('custom-cookie')?.value;

  // Cookieを削除（発行時と同じ属性で空値を上書きする）
  response.cookies.set('custom-cookie', '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
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

```typescript
import { getSessionCookieName, getSessionCookieOptions } from '@/constants/auth';

response.cookies.set(getSessionCookieName(), '', {
  ...getSessionCookieOptions(),
  maxAge: 0,
});
```

## Header操作

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // リクエストヘッダーを取得
  const userAgent = request.headers.get('user-agent') || '';

  // レスポンスヘッダーを設定
  const response = NextResponse.next();
  response.headers.set('x-custom-header', 'value');
  response.headers.set('x-user-agent', userAgent);

  return response;
}
```

> ⚠️ **セキュリティヘッダ・CSP はここに書かない。** このリポジトリは
> static prerender を維持するため `next.config.mjs` で静的配信している
> （`src/proxy.ts` の冒頭コメント）。proxy で付け直すと二重になる。

## リダイレクトパターン

### 条件付きリダイレクト

```typescript
export const proxy = auth((req) => {
  const { nextUrl } = req;

  if (nextUrl.pathname === ROUTES.HOME) {
    return req.auth?.user?.id
      ? NextResponse.next()
      : NextResponse.redirect(new URL(ROUTES.LOGIN, nextUrl));
  }

  return NextResponse.next();
});
```

### クエリパラメータ付きリダイレクト

```typescript
export function proxy(request: NextRequest) {
  const url = new URL(ROUTES.LOGIN, request.nextUrl);
  url.searchParams.set('callbackUrl', request.nextUrl.pathname);

  return NextResponse.redirect(url);
}
```

> ⚠️ 相対URLの基準は **`request.nextUrl` に揃える**（`src/proxy.ts` が
> そうしている）。`request.url` は素の URL だが、`nextUrl` は basePath を
> 織り込んだ Next 側の表現なので、将来 basePath を入れても壊れない。

## URL書き換え（Rewrite）

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
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

## レート制限はここに置かない

⛔ **proxy でレート制限を実装しない。**

- **IPが取れない。** `NextRequest.ip` は Next.js 15 で削除された
  （IPの供給はホスティング事業者の責務になった）。このリポジトリは
  `src/lib/http/getClientIp.ts` の `getClientIp()` で
  `x-vercel-forwarded-for` を読む。`x-forwarded-for` の先頭は
  **クライアントが詐称できる**ので使わない（#647）
- **メモリに持てない。** サーバーレスの実行環境はリクエストごとに
  入れ替わるため、`Map` に貯めたカウンタは当てにならない
- このリポジトリのレート制限は **DB ベース**。`.claude/rules/api-route.md`
  に置き場所（検証より前／例外）まで決まっているので、API Route 側で実装する

## Matcher設定パターン

```typescript
// すべてのパスにマッチ
export const config = {
  matcher: '/:path*',
};

// 特定のパスのみ
export const config = {
  matcher: ['/watchlist/:path*', '/settings/:path*'],
};

// 正規表現（除外リスト方式）
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

> ⚠️ 除外リスト方式と「特定のパスのみ」方式を混ぜない。後者は列挙漏れが
> そのまま保護漏れになる。このリポジトリは前者を採り、`/api/*` は
> matcher に含めたうえでハンドラの中で判定を飛ばしている（上記）。

## デバッグ

```typescript
export function proxy(request: NextRequest) {
  console.log('Proxy executed:', {
    pathname: request.nextUrl.pathname,
    method: request.method,
  });

  return NextResponse.next();
}
```

> ⚠️ ヘッダを丸ごと出さない。`cookie` と `authorization` が含まれ、
> セッショントークンがそのままログへ流れる。

## 実装の実物

このリポジトリの `src/proxy.ts` が、上のパターンをすべて使った実例になっている。

- 未認証 → `callbackUrl` 付きでサインインへ
- 第2要素が未了のセッションを `/auth/two-factor` に閉じ込める
- 失効セッションの Cookie 削除（`getSessionCookieOptions()` と同じ属性で）
- admin パスのロール判定（**最終判定は `withAdminAuth` 側**）

## 参考ドキュメント

- `src/proxy.ts` - 実装の実物
- `.claude/documents/authentication-flow.md` - 認証フロー
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` - 入門
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` - APIリファレンス

## 使用例

```bash
# Proxy 作成
/middleware
```
