---
name: api-route
description: Create a Next.js API Route following project conventions
disable-model-invocation: true
argument-hint: <route-path>
---

# Next.js API Route作成スキル

このスキルは、プロジェクトのAPI仕様に従ってNext.js API Routeを作成します。

## 必須要件

### アーキテクチャ原則

- **統一エラーレスポンス**: プロジェクト標準のエラーフォーマットを使用
- **レート制限**: DB-basedレート制限を実装
- **セキュリティ**: 認証・認可チェックを適切に実装
- **バリデーション**: zodによる入力検証

### ファイル配置

```
src/app/api/watchlist/add/
└── route.ts
```

## 統一レスポンス形式

### 成功レスポンス

```typescript
{
  success: true,
  data: any  // 実際のレスポンスデータ
}
```

### エラーレスポンス

```typescript
{
  success: false,
  error: {
    code: string,       // エラーコード（英大文字スネークケース）
    message: string,    // ユーザー向けエラーメッセージ（日本語）
    details?: any       // オプション: 追加情報
  }
}
```

### 標準エラーコード

| コード | HTTPステータス | 用途 |
|--------|---------------|------|
| `VALIDATION_ERROR` | 400 | 入力バリデーションエラー |
| `UNAUTHORIZED` | 401 | 認証エラー |
| `FORBIDDEN` | 403 | 認可エラー |
| `NOT_FOUND` | 404 | リソース未検出 |
| `RATE_LIMIT_EXCEEDED` | 429 | レート制限超過 |
| `INTERNAL_SERVER_ERROR` | 500 | サーバーエラー |
| `INVALID_OTP` | 400 | OTP検証エラー |
| `EXPIRED_OTP` | 400 | OTP有効期限切れ |
| `EMAIL_ALREADY_EXISTS` | 409 | メールアドレス重複 |

## API Routeテンプレート

### 基本構造

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// リクエストボディのバリデーションスキーマ
const requestSchema = z.object({
  // フィールド定義
});

export async function POST(request: NextRequest) {
  try {
    // 1. 認証チェック（必要な場合）
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '認証が必要です',
          },
        },
        { status: 401 }
      );
    }

    // 2. リクエストボディの取得とバリデーション
    const body = await request.json();
    const validatedData = requestSchema.parse(body);

    // 3. レート制限チェック（必要な場合）
    const rateLimitResult = await checkRateLimit(
      session.user.id,
      'ACTION_TYPE'
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'しばらく時間をおいてから再度お試しください',
            details: {
              retryAfter: rateLimitResult.retryAfter,
            },
          },
        },
        { status: 429 }
      );
    }

    // 4. ビジネスロジック実行
    // ...

    // 5. 成功レスポンス
    return NextResponse.json({
      success: true,
      data: {
        // レスポンスデータ
      },
    });

  } catch (error) {
    // zodバリデーションエラー
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '入力内容に誤りがあります',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    // その他のエラー
    console.error('API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'サーバーエラーが発生しました',
        },
      },
      { status: 500 }
    );
  }
}
```

## レート制限実装

### レート制限チェック関数

```typescript
import { supabase } from '@/lib/supabase';

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // 秒数
}

async function checkRateLimit(
  identifier: string,
  actionType: string,
  maxAttempts: number = 3,
  windowMinutes: number = 30
): Promise<RateLimitResult> {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .single();

  if (error && error.code !== 'PGRST116') {
    // エラーハンドリング
    throw error;
  }

  const now = new Date();

  // レコードが存在しない場合は新規作成
  if (!data) {
    await supabase.from('rate_limits').insert({
      identifier,
      action_type: actionType,
      attempts: 1,
      last_attempt_at: now.toISOString(),
    });
    return { allowed: true };
  }

  // ロック中かチェック
  if (data.locked_until && new Date(data.locked_until) > now) {
    const retryAfter = Math.ceil(
      (new Date(data.locked_until).getTime() - now.getTime()) / 1000
    );
    return { allowed: false, retryAfter };
  }

  // 試行回数チェック
  if (data.attempts >= maxAttempts) {
    const lockedUntil = new Date(now.getTime() + windowMinutes * 60 * 1000);
    await supabase
      .from('rate_limits')
      .update({
        locked_until: lockedUntil.toISOString(),
        attempts: data.attempts + 1,
        last_attempt_at: now.toISOString(),
      })
      .eq('id', data.id);

    return { allowed: false, retryAfter: windowMinutes * 60 };
  }

  // 試行回数を増やす
  await supabase
    .from('rate_limits')
    .update({
      attempts: data.attempts + 1,
      last_attempt_at: now.toISOString(),
    })
    .eq('id', data.id);

  return { allowed: true };
}
```

### レート制限リセット関数

```typescript
async function resetRateLimit(
  identifier: string,
  actionType: string
): Promise<void> {
  await supabase
    .from('rate_limits')
    .delete()
    .eq('identifier', identifier)
    .eq('action_type', actionType);
}
```

## セキュリティ考慮事項

### 認証チェック

```typescript
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '認証が必要です',
      },
    },
    { status: 401 }
  );
}
```

### 認可チェック（リソース所有権）

```typescript
// データが現在のユーザーのものか確認
const { data: resource } = await supabase
  .from('watchlist')
  .select('*')
  .eq('id', resourceId)
  .eq('user_id', session.user.id)
  .single();

if (!resource) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'このリソースへのアクセス権限がありません',
      },
    },
    { status: 403 }
  );
}
```

## データベース操作

### Supabase Client使用

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // サーバーサイドではService Role Key
);
```

### RLS考慮

API Routeではサーバーサイドなので、Service Role Keyを使う場合はRLSをバイパスします。適切な認可チェックを手動で実装してください。

## エラーロギング

```typescript
catch (error) {
  // Vercel Logsに出力
  console.error('API Error:', {
    endpoint: '/api/example',
    userId: session?.user.id,
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      },
    },
    { status: 500 }
  );
}
```

## 参考ドキュメント

- `.claude/documents/api-specification.md` - API仕様詳細
- `.claude/documents/database-schema.md` - データベーススキーマ
- `.claude/documents/authentication-flow.md` - 認証フロー

## 使用例

```bash
# ウォッチリスト追加API
/api-route watchlist/add

# OTP検証API
/api-route auth/verify-otp
```
