---
name: server-action
description: Create Next.js Server Actions for form handling and server-side operations
disable-model-invocation: true
argument-hint: <actionName>
---

# Next.js Server Actions作成スキル

このスキルは、Next.js Server Actionsを使ったフォーム送信、サーバーサイド処理を実装します。

## 必須要件

### アーキテクチャ原則

- **'use server'ディレクティブ**: 必須
- **型安全性**: zodでバリデーション
- **エラーハンドリング**: try-catchで適切に処理
- **Revalidate**: キャッシュ更新を適切に実行
- **統一レスポンス形式**: success/error構造

## ファイル構成

```
src/app/actions/
├── <actionName>.ts      # Server Action
└── types.ts             # レスポンス型定義
```

## 基本テンプレート

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// バリデーションスキーマ
const schema = z.object({
  field: z.string().min(1, 'フィールドを入力してください'),
});

// レスポンス型
interface ActionResult {
  success: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export async function actionName(
  formData: FormData
): Promise<ActionResult> {
  try {
    // 1. バリデーション
    const rawData = {
      field: formData.get('field'),
    };

    const validatedData = schema.parse(rawData);

    // 2. ビジネスロジック実行
    // ...

    // 3. キャッシュ更新
    revalidatePath('/path');

    // 4. 成功レスポンス
    return {
      success: true,
      message: '処理が完了しました',
    };
  } catch (error) {
    // zodバリデーションエラー
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '入力内容に誤りがあります',
          details: error.errors,
        },
      };
    }

    // その他のエラー
    console.error('Action error:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      },
    };
  }
}
```

## フォーム送信パターン

### FormDataからの取得

```typescript
'use server';

import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('メールアドレスの形式が正しくありません'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
});

export async function loginAction(formData: FormData) {
  try {
    const rawData = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    const { email, password } = loginSchema.parse(rawData);

    // ログイン処理
    // ...

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '入力内容に誤りがあります',
          details: error.errors,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      },
    };
  }
}
```

### オブジェクトパラメータ

```typescript
'use server';

interface AddMovieParams {
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

export async function addToWatchlist(params: AddMovieParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です',
        },
      };
    }

    // Supabaseに追加
    const { error } = await supabase.from('watchlist').insert({
      user_id: session.user.id,
      tmdb_movie_id: params.tmdbId,
      title: params.title,
      poster_path: params.posterPath,
    });

    if (error) {
      throw error;
    }

    revalidatePath('/home');

    return {
      success: true,
      message: 'ウォッチリストに追加しました',
    };
  } catch (error) {
    console.error('Failed to add to watchlist:', error);
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'ウォッチリストへの追加に失敗しました',
      },
    };
  }
}
```

## 認証チェック

```typescript
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function protectedAction() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '認証が必要です',
      },
    };
  }

  // 認証済みユーザーの処理
  // ...
}
```

## Revalidate

### パス再検証

```typescript
'use server';

import { revalidatePath } from 'next/cache';

export async function updateAction() {
  // 処理...

  // 特定のパスを再検証
  revalidatePath('/home');

  // 特定のパスとその子パスを再検証
  revalidatePath('/home', 'page');

  // レイアウト全体を再検証
  revalidatePath('/home', 'layout');

  return { success: true };
}
```

### タグ再検証

```typescript
'use server';

import { revalidateTag } from 'next/cache';

export async function updateMovieAction() {
  // 処理...

  // 特定のタグを再検証
  revalidateTag('movies');

  return { success: true };
}
```

## リダイレクト

```typescript
'use server';

import { redirect } from 'next/navigation';

export async function createAction(formData: FormData) {
  // 処理...

  // 成功後にリダイレクト
  redirect('/success');
}
```

## Cookies操作

```typescript
'use server';

import { cookies } from 'next/headers';

export async function setCookieAction() {
  cookies().set('name', 'value', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7日間
  });

  return { success: true };
}

export async function getCookieAction() {
  const value = cookies().get('name')?.value;

  return { success: true, data: value };
}

export async function deleteCookieAction() {
  cookies().delete('name');

  return { success: true };
}
```

## プログレッシブエンハンスメント

### useFormStateとの連携

```typescript
'use server';

interface FormState {
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export async function submitFormAction(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const rawData = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    const { email, password } = loginSchema.parse(rawData);

    // 処理...

    return {
      success: true,
      message: 'ログインしました',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string[]> = {};
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        if (!errors[path]) {
          errors[path] = [];
        }
        errors[path].push(err.message);
      });

      return {
        success: false,
        errors,
      };
    }

    return {
      success: false,
      message: 'エラーが発生しました',
    };
  }
}
```

### クライアント側での使用

```typescript
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { submitFormAction } from '@/app/actions/submitForm';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? '送信中...' : '送信'}
    </button>
  );
}

export function Form() {
  const [state, formAction] = useFormState(submitFormAction, {
    success: false,
  });

  return (
    <form action={formAction}>
      <input type="email" name="email" />
      {state.errors?.email && <p>{state.errors.email[0]}</p>}

      <input type="password" name="password" />
      {state.errors?.password && <p>{state.errors.password[0]}</p>}

      <SubmitButton />

      {state.message && <p>{state.message}</p>}
    </form>
  );
}
```

## データベース操作

### Supabase操作

```typescript
'use server';

import { createClient } from '@supabase/supabase-js';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Server Action用
);

export async function deleteFromWatchlistAction(movieId: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です',
        },
      };
    }

    // 論理削除
    const { error } = await supabase
      .from('watchlist')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', movieId)
      .eq('user_id', session.user.id);

    if (error) {
      throw error;
    }

    revalidatePath('/home');

    return {
      success: true,
      message: 'ウォッチリストから削除しました',
    };
  } catch (error) {
    console.error('Failed to delete from watchlist:', error);
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: '削除に失敗しました',
      },
    };
  }
}
```

## エラーハンドリングパターン

### 統一エラーレスポンス

```typescript
'use server';

interface ActionError {
  code: string;
  message: string;
  details?: any;
}

interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: ActionError;
}

function createErrorResponse(
  code: string,
  message: string,
  details?: any
): ActionResult {
  return {
    success: false,
    error: { code, message, details },
  };
}

function createSuccessResponse<T>(data?: T): ActionResult<T> {
  return {
    success: true,
    data,
  };
}

export async function exampleAction(): Promise<ActionResult> {
  try {
    // 処理...

    return createSuccessResponse({ id: '123' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        '入力内容に誤りがあります',
        error.errors
      );
    }

    console.error('Action error:', error);
    return createErrorResponse(
      'INTERNAL_SERVER_ERROR',
      'サーバーエラーが発生しました'
    );
  }
}
```

## ファイルアップロード

```typescript
'use server';

export async function uploadFileAction(formData: FormData) {
  try {
    const file = formData.get('file') as File;

    if (!file) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ファイルを選択してください',
        },
      };
    }

    // ファイルサイズチェック（5MB制限）
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'ファイルサイズは5MB以下にしてください',
        },
      };
    }

    // ファイルタイプチェック
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: '画像ファイル（JPEG, PNG, WebP）のみアップロード可能です',
        },
      };
    }

    // ファイル処理...
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // アップロード処理
    // ...

    return {
      success: true,
      message: 'ファイルをアップロードしました',
    };
  } catch (error) {
    console.error('File upload error:', error);
    return {
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'ファイルのアップロードに失敗しました',
      },
    };
  }
}
```

## レート制限チェック

```typescript
'use server';

import { getServerSession } from 'next-auth';

async function checkRateLimit(userId: string, action: string): Promise<boolean> {
  const { data } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', userId)
    .eq('action_type', action)
    .single();

  if (data && data.locked_until) {
    const lockedUntil = new Date(data.locked_until);
    if (lockedUntil > new Date()) {
      return false;
    }
  }

  return true;
}

export async function rateLimitedAction() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です',
        },
      };
    }

    const allowed = await checkRateLimit(session.user.id, 'ACTION_TYPE');

    if (!allowed) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'しばらく時間をおいてから再度お試しください',
        },
      };
    }

    // 処理...

    return { success: true };
  } catch (error) {
    console.error('Action error:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'サーバーエラーが発生しました',
      },
    };
  }
}
```

## 参考ドキュメント

- `.claude/documents/api-specification.md` - エラーレスポンス形式
- [Next.js Server Actions Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

## 使用例

```bash
# Server Action作成
/server-action addToWatchlist

# フォーム送信用Server Action
/server-action loginForm
```
