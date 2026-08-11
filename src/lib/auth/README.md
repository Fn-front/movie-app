# NextAuth.js v5 セットアップガイド

## 概要

このプロジェクトでは NextAuth.js v5 を使用して認証機能を実装しています。

### 認証方式

- **Credentials Provider**: メールアドレス＋パスワード認証
- **セッション**: JWT トークンベース（24 時間有効）
- **データベース**: Supabase (PostgreSQL)
- **パスワードハッシュ化**: bcryptjs

## ファイル構成

```
src/
├── lib/
│   └── auth/
│       ├── auth.ts              # NextAuth.js 設定
│       └── README.md            # このファイル
├── app/
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts     # NextAuth.js API Route
├── proxy.ts                     # 認証保護 Proxy（Next.js 16 file convention）
└── types/
    └── next-auth.d.ts           # NextAuth.js 型定義拡張
```

## 環境変数設定

`.env.local` に以下の環境変数を追加してください：

```bash
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<生成した秘密鍵>

# Supabase（既に設定済み）
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### NEXTAUTH_SECRET の生成方法

```bash
openssl rand -base64 32
```

## 使用方法

### サーバーコンポーネントでセッション取得

```tsx
import { auth } from '@/lib/auth/auth';

export default async function Page() {
  const session = await auth();

  if (!session) {
    return <div>ログインしてください</div>;
  }

  return <div>ようこそ、{session.user.name}さん</div>;
}
```

### クライアントコンポーネントでセッション取得

```tsx
'use client';

import { useSession } from 'next-auth/react';

export default function Component() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div>読み込み中...</div>;
  }

  if (!session) {
    return <div>ログインしてください</div>;
  }

  return <div>ようこそ、{session.user.name}さん</div>;
}
```

### ログイン

```tsx
'use client';

import { signIn } from 'next-auth/react';

export default function SignInForm() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const result = await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirect: false,
    });

    if (result?.error) {
      console.error(result.error);
    } else {
      // ログイン成功 - ホームにリダイレクト
      window.location.href = '/';
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type='email' name='email' required />
      <input type='password' name='password' required />
      <button type='submit'>ログイン</button>
    </form>
  );
}
```

### ログアウト

```tsx
'use client';

import { signOut } from 'next-auth/react';

export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
      ログアウト
    </button>
  );
}
```

### Server Action でログイン

```tsx
'use server';

import { signIn } from '@/lib/auth/auth';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  try {
    await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: '認証エラー' };
  }
}
```

## 認証フロー

### 1. 新規登録

1. ユーザーがメールアドレス・パスワード・名前を入力
2. `POST /api/auth/register` で仮登録
   - パスワードを bcrypt でハッシュ化
   - users テーブルに保存（is_verified = false）
   - OTP トークン生成・保存
   - メール送信
3. OTP 検証画面で 6 桁コード入力
4. `POST /api/auth/verify-otp` で OTP 検証
   - is_verified = true に更新
   - ログイン処理

### 2. ログイン

1. ユーザーがメールアドレス・パスワードを入力
2. `signIn('credentials', { ... })` を実行
3. NextAuth.js が `authorize` 関数を呼び出し
   - users テーブルからユーザー取得
   - is_verified チェック
   - パスワード照合
4. 認証成功 → JWT トークン発行
5. セッション確立

### 3. セッション管理

- JWT トークンベース（Cookie に保存）
- 有効期限: 24 時間
- セキュアクッキー（本番環境）
- HttpOnly, SameSite=Lax

## Proxy（旧 Middleware）

`src/proxy.ts` で認証保護を実装（Next.js 16 で `middleware` は `proxy` にリネームされた）：

```typescript
// 認証が必要なパス
const protectedPaths = ['/dashboard', '/profile', '/watchlist'];

// 未認証 → /auth/signin にリダイレクト
// 認証済み → そのまま通過
```

## セキュリティ対策

- ✅ パスワードハッシュ化（bcryptjs）
- ✅ CSRF 対策（NextAuth.js 組み込み）
- ✅ セキュアクッキー（本番環境）
- ✅ HttpOnly クッキー
- ✅ SameSite=Lax
- ✅ Row Level Security（Supabase RLS）

## トラブルシューティング

### エラー: "Supabase environment variables are not defined"

`.env.local` に Supabase 環境変数が設定されているか確認してください。

### エラー: "メールアドレスが認証されていません"

ユーザーの `is_verified` フラグが `true` になっているか確認してください。

### セッションが取得できない

1. `NEXTAUTH_SECRET` が設定されているか確認
2. `NEXTAUTH_URL` が正しいか確認
3. ブラウザのクッキーを削除して再ログイン

## 参考リンク

- [NextAuth.js v5 ドキュメント](https://authjs.dev/)
- [NextAuth.js Credentials Provider](https://authjs.dev/getting-started/providers/credentials)
- [Supabase ドキュメント](https://supabase.com/docs)
