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
src/app/api/<route-path>/
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

`src/constants/api.ts` の `ERROR_CODE` が正。**ここに無い値を書かない。**

| コード | HTTPステータス | 用途 |
|--------|---------------|------|
| `VALIDATION_ERROR` | 400 | 入力バリデーションエラー |
| `BAD_REQUEST` | 400 | 入力以外のクライアント起因 |
| `UNAUTHORIZED` | 401 | 認証エラー |
| `FORBIDDEN` | 403 | ログイン済みだがロールが足りない |
| `NOT_FOUND` | 404 | リソース未検出 |
| `CONFLICT` | 409 | リソース競合 |
| `RATE_LIMIT_EXCEEDED` | 429 | レート制限超過 |
| `SERVER_ERROR` | 500 | サーバーエラー |

> ⛔ `INTERNAL_SERVER_ERROR` / `INVALID_OTP` / `EXPIRED_OTP` /
> `EMAIL_ALREADY_EXISTS` は**存在しない**。500 は `SERVER_ERROR`、
> OTP の失敗は `VALIDATION_ERROR` + 文言（`OTP_ERROR_MESSAGES`）で返す。
>
> ⚠️ OTP の失敗を細かく分けないのは意図的。「コードが違う」と「期限切れ」を
> 区別して返すと、総当たりの手がかりになる。
>
> ⚠️ メールの重複も 409 では返さない。**列挙防止のため新規登録と同じ 201**
> を返す（`auth/register`）。

## API Routeテンプレート

### 基本構造

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ERROR_CODE, RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants';
import { getAuthSession } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

// リクエストボディのバリデーションスキーマ
const requestSchema = z.object({
  // フィールド定義
});

export async function POST(request: NextRequest) {
  try {
    // 1. 認証チェック（必要な場合）
    const session = await getAuthSession();
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

    // 2. service role クライアント
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 3. レート制限チェック
    //
    // ⛔ **検証より前に置く**（`.claude/rules/api-route.md` の【必須】）。
    //    後ろに置くと、形式だけ崩したリクエストは 400 で返るが
    //    **カウンタを消費しない**。不正な形式を挟むだけで試行回数を
    //    いくらでも稼げる（#940）
    //
    // ⚠️ 第1引数は **supabase クライアント**。識別子ではない
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ACTION_TYPE,
      RATE_LIMIT_CONFIG.ACTION_TYPE.maxAttempts,
      RATE_LIMIT_CONFIG.ACTION_TYPE.windowMinutes,
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

    // 4. リクエストボディの取得とバリデーション
    //
    // ⚠️ `parse` ではなく **`safeParse`** を使う。例外を投げないので
    //    catch 側で型を判別せずに済み、`flatten().fieldErrors` を
    //    そのまま `details` に載せられる
    const body = await request.json();
    const result = requestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: '入力内容に誤りがあります',
            // ⚠️ zod v4 に `error.errors` は無い（`issues`）。
            //    このリポジトリは `flatten().fieldErrors` で揃えている
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const validatedData = result.data;

    // 5. ビジネスロジック実行
    // ...

    // 6. 成功レスポンス
    return NextResponse.json({
      success: true,
      data: {
        // レスポンスデータ
      },
    });

  } catch (error) {
    // その他のエラー
    console.error('API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: 'サーバーエラーが発生しました',
        },
      },
      { status: 500 }
    );
  }
}
```

## レート制限

### ⛔ 自作しない

`src/lib/rateLimit/rateLimit.ts` の `checkRateLimit()` を使う。

```typescript
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

const result = await checkRateLimit(
  supabase,                                   // ← 第1引数は supabase
  session.user.id,
  RATE_LIMIT_ACTION.WRITE_WATCHLIST,
  RATE_LIMIT_CONFIG.WRITE_WATCHLIST.maxAttempts,
  RATE_LIMIT_CONFIG.WRITE_WATCHLIST.windowMinutes,
);

if (!result.allowed) {
  // result.retryAfter（秒）を details に載せて 429
}
```

中身は **`consume_rate_limit` RPC の1ステートメント**。

⛔ **SELECT → 判定 → UPDATE に分けてはいけない。** その間に別のリクエストが
同じ `attempts` を読み、全員が「上限未満」と判定して**実効上限を超えられる**
（#646 で実際に直した）。自作すると必ずこの形に戻る。

### `maxAttempts` は「◯回/◯分」のレートではない

`consume_rate_limit` がカウンタを戻すのは、**その窓のあいだ一度も
アクセスが無かったとき**だけ（#934）。断続的に叩かれ続けるとカウンタは
減らないので、窓を長くすると通常利用で単調増加して利用者を締め出す。

値は `src/constants/rateLimit.ts` の `RATE_LIMIT_CONFIG` が正。
新しい用途を足すときは `RATE_LIMIT_ACTION` にも追加し、**DB の
`chk_action_type` 制約**にも足すこと（足さないと upsert が 23514 で落ちる）。

### 置く場所

**検証より前**が原則。例外と判定手順は `.claude/rules/api-route.md` に
まとめてあるので、新しいルートを書く前に必ず読むこと。

### 未認証で叩けるルート

`src/helpers/publicRateLimit.ts` の `enforcePublicRateLimit()` を使う。
識別子は認証済みならユーザーID、そうでなければ送信元IP。

⚠️ IPは `src/lib/http/getClientIp.ts` の `getClientIp()` で取る。
`NextRequest.ip` は Next 15 で削除され、`x-forwarded-for` の先頭は
**クライアントが詐称できる**（#647）。


## セキュリティ考慮事項

### 認証チェック

```typescript
const session = await getAuthSession();
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

⛔ **`createClient()` を直接呼ばない。** `src/helpers/supabase.ts` の
ヘルパーを使う。

```typescript
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';

const supabase = createServiceRoleClient();
// ⚠️ 環境変数が無いと **null** が返る。必ず見ること
if (!supabase) return dbConnectionErrorResponse();
```

| ヘルパー | 鍵 | RLS | 用途 |
|---|---|---|---|
| `createServiceRoleClient()` | service role | **バイパス** | 認証済みの操作全般。認可は自分で書く |
| `createAnonClient()` | anon | 有効 | 公開API（未認証で叩ける読み取り） |

### RLS考慮

service role は **RLS をバイパスする**。「RLS があるから安全」は成り立たない
ので、**どの行を触ってよいかの判定を必ず自分で書く**（`eq('user_id',
session.user.id)` を落とさない）。

⚠️ 公開APIで `createAnonClient()` を使うときも、`.claude/rules/supabase-db.md`
の **GRANT** が前提。`ENABLE ROW LEVEL SECURITY` と `CREATE POLICY` だけでは
Data API に公開されず、PostgREST が `42501` を返す。

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
        code: ERROR_CODE.SERVER_ERROR,
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

# OTP検証API（実在するのは auth/otp/verify）
/api-route auth/otp/verify
```
