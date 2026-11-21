---
name: page
description: Create a Next.js App Router page following project conventions
disable-model-invocation: true
argument-hint: <route-path>
---

# Next.js App Routerページ作成スキル

このスキルは、Next.js App Routerのページを作成します。

## 必須要件

### アーキテクチャ原則

- **Server Component優先**: クライアントコンポーネントは必要な場合のみ
- **メタデータ設定**: SEO対応
- **レイアウト統合**: 認証状態に応じたレイアウト
- **エラー処理**: loading.tsx, error.tsx

## ファイル構成

```
src/app/<route-path>/
├── page.tsx         # メインページ
├── layout.tsx       # レイアウト（必要な場合）
├── loading.tsx      # ローディング状態（必要な場合）
├── error.tsx        # エラー状態（必要な場合）
└── not-found.tsx    # 404ページ（必要な場合）
```

## ページテンプレート（Server Component）

```typescript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ページタイトル | Movie App',
  description: 'ページの説明文',
};

export default async function <PageName>Page() {
  // サーバーサイドでデータフェッチ
  // const data = await fetchData();

  return (
    <div>
      <h1>ページタイトル</h1>
      {/* コンテンツ */}
    </div>
  );
}
```

## ページテンプレート（Client Component）

```typescript
'use client';

import { memo } from 'react';

interface <PageName>PageProps {
  // props
}

const <PageName>Page = memo<<PageName>PageProps>(() => {
  // クライアントサイドロジック

  return (
    <div>
      <h1>ページタイトル</h1>
      {/* コンテンツ */}
    </div>
  );
});

<PageName>Page.displayName = '<PageName>Page';

export default <PageName>Page;
```

## メタデータ設定

### 静的メタデータ

```typescript
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ページタイトル | Movie App',
  description: 'ページの説明文',
  openGraph: {
    title: 'ページタイトル',
    description: 'ページの説明文',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ページタイトル',
    description: 'ページの説明文',
    images: ['/og-image.png'],
  },
};
```

### 動的メタデータ

```typescript
import { Metadata } from 'next';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const data = await fetchData(params.id);

  return {
    title: `${data.title} | Movie App`,
    description: data.description,
    openGraph: {
      title: data.title,
      description: data.description,
      images: [data.poster],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const data = await fetchData(params.id);

  return <div>{/* ... */}</div>;
}
```

## ルートグループ

### 認証ページ

⚠️ **ルートグループ（`(auth)` のような括弧付きディレクトリ）は使っていない。**
`src/app` 配下に素のディレクトリを置く。

```
src/app/auth/
├── layout.tsx          # 認証ページ共通レイアウト
├── signin/             # ROUTES.LOGIN
├── signup/             # ROUTES.REGISTER
├── two-factor/         # 第2要素の入力（ROUTES.TOTP_CHALLENGE）
├── forgot-password/
├── reset-password/
└── error/
```

### 通常のページ

```
src/app/
├── page.tsx            # トップ（ROUTES.HOME = '/'。公開ページ）
├── movies/
├── search/
├── watchlist/          # 要認証
├── favorites/          # 要認証
├── settings/           # 要認証
├── awards/
├── person/
├── privacy/
├── theater-experience/ # 要認証
└── admin/              # admin ロールのみ（accounts / awards）
```

> ⚠️ パスは `src/constants/common.ts` の `ROUTES` が正。`/login` `/home`
> `/calendar` は**どれも存在しない**（それぞれ `/auth/signin`、`/`、
> カレンダーは画面ではなく全ページ共通のダイアログ。`appLayout` が
> マウントし、サイドバーとモバイルドロワーの2か所から開く）。
>
> ⚠️ 要認証は `AUTH_REQUIRED_ROUTES`（watchlist / settings / favorites /
> theater-experience の4つ）、admin 専用は `ADMIN_REQUIRED_ROUTES` が正。

## レイアウトテンプレート

```typescript
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function <LayoutName>Layout({ children }: LayoutProps) {
  return (
    <div>
      {/* ヘッダー、ナビゲーション等 */}
      <main>{children}</main>
      {/* フッター等 */}
    </div>
  );
}
```

## loading.tsx テンプレート

```typescript
export default function Loading() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
      role="status"
      aria-label="読み込み中"
    >
      <div>読み込み中...</div>
    </div>
  );
}
```

## error.tsx テンプレート

```typescript
'use client';

import { memo, useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const Error = memo<ErrorProps>(({ error, reset }) => {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        gap: '16px',
      }}
    >
      <h2>エラーが発生しました</h2>
      <p>{error.message || '予期しないエラーが発生しました'}</p>
      <button onClick={reset}>再試行</button>
    </div>
  );
});

Error.displayName = 'Error';

export default Error;
```

## not-found.tsx テンプレート

```typescript
import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        gap: '16px',
      }}
    >
      <h2>ページが見つかりません</h2>
      <p>お探しのページは存在しないか、移動した可能性があります。</p>
      <Link href="/">ホームに戻る</Link>
    </div>
  );
}
```

## データフェッチング

### Server Component（推奨）

```typescript
export default async function Page() {
  // サーバーサイドでデータフェッチ
  const data = await fetchData();

  return <div>{/* データを使用 */}</div>;
}

async function fetchData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 }, // 1時間キャッシュ
  });

  if (!res.ok) {
    throw new Error('Failed to fetch data');
  }

  return res.json();
}
```

### Client Component

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function Page() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData().then(setData).finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div>読み込み中...</div>;

  return <div>{/* データを使用 */}</div>;
}
```

## 認証チェック

### Server Componentで認証チェック

```typescript
import { redirect } from 'next/navigation';

import { ROUTES } from '@/constants/common';
import { getAuthSession } from '@/helpers/auth';

export default async function ProtectedPage() {
  const session = await getAuthSession();

  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  return <div>保護されたコンテンツ</div>;
}
```

> ⚠️ 保護されたページは `src/proxy.ts` でもリダイレクトしているが、
> **ここでも確認する**。proxy はネットワーク層の体裁に過ぎず、認可の最終
> 判定はページ側・Route Handler 側に置く方針（`src/proxy.ts` の冒頭）。
>
> ⚠️ リダイレクト先をベタ書きしない。`ROUTES.LOGIN` は `/auth/signin` で、
> `/login` は**このリポジトリに存在しない**。

### Client Componentで認証チェック

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ROUTES } from '@/constants/common';

export default function ProtectedPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(ROUTES.LOGIN);
    }
  }, [router, status]);

  if (status === 'loading') {
    return <div>読み込み中...</div>;
  }

  return <div>保護されたコンテンツ</div>;
}
```

> ⚠️ **Client Component では `redirect()` を使わない。** あれは Server
> Component / Server Action 用で、`useEffect` の中から呼ぶ経路ではない。
> `useRouter().replace()` を使う。
>
> ⚠️ ここでも `ROUTES.LOGIN` を使う。`/login` は**このリポジトリに存在しない**
> ので、ベタ書きすると proxy も素通りして **404** になる。

## パラメータ取得

### 動的ルート

```typescript
// src/app/movies/[id]/page.tsx
interface PageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function MoviePage({ params, searchParams }: PageProps) {
  const { id } = params;
  const { tab } = searchParams;

  return (
    <div>
      <h1>映画ID: {id}</h1>
      <p>タブ: {tab}</p>
    </div>
  );
}
```

## リダイレクト

### Server Component

```typescript
import { redirect } from 'next/navigation';

export default async function Page() {
  const shouldRedirect = true;

  if (shouldRedirect) {
    redirect('/other-page');
  }

  return <div>ページ</div>;
}
```

### Client Component

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.push('/other-page');
  }, [router]);

  return <div>リダイレクト中...</div>;
}
```

## ストリーミング（Suspense）

```typescript
import { Suspense } from 'react';

export default function Page() {
  return (
    <div>
      <h1>ページタイトル</h1>
      <Suspense fallback={<div>読み込み中...</div>}>
        <AsyncComponent />
      </Suspense>
    </div>
  );
}

async function AsyncComponent() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

## 参考ドキュメント

- `.claude/documents/architecture.md` - アーキテクチャ設計

## 使用例

```bash
# ホームページ
/page home

# 映画詳細ページ（動的ルート）
/page movies/[id]

# カレンダーページ
/page calendar
```
