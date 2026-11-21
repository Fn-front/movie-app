---
name: form
description: Create a form component with react-hook-form and zod validation
disable-model-invocation: true
argument-hint: <formName>
---

# フォームコンポーネント作成スキル

このスキルは、react-hook-form + zodを使ったフォームコンポーネントを作成します。

## 必須要件

### 技術スタック

- **react-hook-form**: フォーム状態管理
- **zod**: バリデーションスキーマ
- **Radix UI**: フォームコンポーネント（必要に応じて）

### アーキテクチャ原則

- **zodスキーマ分離**: `src/schema/<domain>.ts` に定義し、API Route と共有する
- **エラーメッセージ**: ユーザーフレンドリーな日本語
- **アクセシビリティ**: 適切なARIA属性とラベル
- **バリデーション**: リアルタイム + 送信時

## ファイル構成

```
src/features/<domain>/<formName>/
├── <formName>.tsx           # フォームコンポーネント
├── <formName>.test.tsx      # テスト（同じディレクトリに置く）
└── <formName>.module.scss   # スタイル

src/schema/<domain>.ts       # ⚠️ zod スキーマはここ。フォームの隣には置かない
```

⛔ **`types/schema.ts` は作らない。** スキーマは `src/schema/<domain>.ts` に
置いて、**フォームと API Route の両方から import する**。同じ検証を2箇所に
書くと、片方だけ直したときにクライアントで通ってサーバーで 400 になる。

```typescript
// フォーム側
import { loginSchema, type LoginFormData } from '@/schema/auth';
// ルート側（src/app/api/... ）も同じものを import する
```

## zodスキーマテンプレート

```typescript
// src/schema/<domain>.ts
import { z } from 'zod';

export const <formName>Schema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('正しいメールアドレスを入力してください'),

  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'パスワードは英大文字、英小文字、数字を含む必要があります'
    ),

  // 他のフィールド...
});

export type <FormName>FormData = z.infer<typeof <formName>Schema>;
```

### よく使うzodバリデーション

```typescript
// 必須フィールド
field: z.string().min(1, 'フィールドを入力してください'),

// メールアドレス
email: z
  .string()
  .min(1, 'メールアドレスを入力してください')
  .email('正しいメールアドレスを入力してください'),

// パスワード（プロジェクト要件: 12文字以上72バイト以内、英大文字・小文字・数字必須）
// ※ 認証のパスワードは `src/schema/auth.ts` の passwordSchema を使う。
//    上限がバイト数なのは bcrypt が72バイトで切り詰めるため（#652）
password: z
  .string()
  .min(12, 'パスワードは12文字以上で入力してください')
  .refine((v) => new TextEncoder().encode(v).length <= 72, {
    message: 'パスワードは72バイト以内で入力してください（日本語は1文字3バイト）',
  })
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'パスワードは英大文字、英小文字、数字を含む必要があります'
  ),

// 数値範囲
age: z
  .number()
  .min(0, '0以上の値を入力してください')
  .max(120, '120以下の値を入力してください'),

// 選択必須
category: z.enum(['action', 'drama', 'comedy'], {
  errorMap: () => ({ message: 'カテゴリーを選択してください' }),
}),

// オプショナル
bio: z.string().optional(),

// カスタムバリデーション
confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword'],
});
```

## フォームコンポーネントテンプレート

```typescript
import React, { memo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import styles from './<formName>.module.scss';
import { <formName>Schema, type <FormName>FormData } from '@/schema/<domain>';

interface <FormName>Props {
  onSubmit: (data: <FormName>FormData) => Promise<void>;
  isLoading?: boolean;
}

export const <FormName> = memo<<FormName>Props>(({ onSubmit, isLoading }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<<FormName>FormData>({
    resolver: zodResolver(<formName>Schema),
  });

  const handleFormSubmit = useCallback(
    async (data: <FormName>FormData) => {
      try {
        await onSubmit(data);
      } catch (error) {
        console.error('Form submission error:', error);
      }
    },
    [onSubmit]
  );

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
    >
      {/* メールアドレス */}
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          className={styles.input}
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className={styles.error} role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* パスワード */}
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          パスワード
        </label>
        <input
          id="password"
          type="password"
          className={styles.input}
          aria-invalid={errors.password ? 'true' : 'false'}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" className={styles.error} role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* 送信ボタン */}
      <button
        type="submit"
        className={styles.submitButton}
        disabled={isSubmitting || isLoading}
        aria-busy={isSubmitting || isLoading}
      >
        {isSubmitting || isLoading ? '送信中...' : '送信'}
      </button>
    </form>
  );
});

<FormName>.displayName = '<FormName>';
```

## フォームモード

**既定（`onSubmit`）のまま使う。** 既存フォームは `mode` を一つも指定していない。

```typescript
useForm<LoginFormData>({
  resolver: zodResolver(loginSchema),
});
```

⚠️ `mode: 'onChange'` は入力のたびに全フィールドを検証するので、まだ触って
いない欄にもエラーが出る。変えるなら理由をコメントに残すこと。

## デフォルト値

```typescript
useForm<<FormName>FormData>({
  resolver: zodResolver(<formName>Schema),
  defaultValues: {
    email: '',
    password: '',
  },
});
```

## エラーハンドリング

### フォームレベルエラー

```typescript
const {
  setError,
  formState: { errors },
} = useForm();

// API エラーをフォームに表示
const handleFormSubmit = async (data: FormData) => {
  try {
    await onSubmit(data);
  } catch (error) {
    if (error instanceof ApiError) {
      setError('root', {
        type: 'server',
        message: error.message,
      });
    }
  }
};

// ルートエラーの表示
{errors.root && (
  <p className={styles.formError} role="alert">
    {errors.root.message}
  </p>
)}
```

## アクセシビリティ要件

### 必須ARIA属性

```tsx
// 入力フィールド
<input
  id="field-id"
  aria-invalid={errors.field ? 'true' : 'false'}
  aria-describedby={errors.field ? 'field-error' : undefined}
  aria-required="true"
  {...register('field')}
/>

// エラーメッセージ
{errors.field && (
  <p id="field-error" role="alert">
    {errors.field.message}
  </p>
)}

// 送信ボタン
<button
  type="submit"
  aria-busy={isSubmitting}
  disabled={isSubmitting}
>
  送信
</button>
```

### ラベル関連付け

```tsx
// ✅ OK: htmlFor属性でラベル関連付け
<label htmlFor="email">メールアドレス</label>
<input id="email" {...register('email')} />

// ❌ NG: ラベルがない
<input {...register('email')} />
```

## 自前の UI コンポーネントを使う

⛔ **`@radix-ui/react-form` は依存に入っていない。** import すると解決
できない。入っている Radix は `dialog` / `select` / `checkbox` /
`radio-group` / `tabs` / `toast` / `tooltip` / `dropdown-menu` /
`toggle-group` の9つだけで、Form は含まれていない。

フォームの入力欄は `src/components/ui/` の `Input` / `Textarea` /
`Select` / `Checkbox` / `RadioGroup` を使う。`Input` は `label` と
`error` を受け取り、**ラベルの関連付けとエラー表示を内側で面倒を見る**。

```typescript
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';

export const LoginForm = memo(() => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="email"
        label="メールアドレス"
        error={errors.email?.message}
        fullWidth
        {...register('email')}
      />

      <Button type="submit">送信</Button>
    </form>
  );
});
```

⚠️ `label` を省いて自分で `<label>` を書かないこと。`Input` は `id` と
`aria-label` の両方を出しており、省くと**支援技術からもテストからも
名前で引けなくなる**。

## よくあるパターン

### OTP入力（6桁数字）

```typescript
// schema.ts
export const otpSchema = z.object({
  otp: z
    .string()
    .length(6, 'OTPコードは6桁で入力してください')
    .regex(/^\d{6}$/, 'OTPコードは数字のみで入力してください'),
});

// component
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]{6}"
  maxLength={6}
  {...register('otp')}
/>
```

### パスワード確認

```typescript
export const registerSchema = z
  .object({
    password: z
      .string()
      .min(8, 'パスワードは8文字以上で入力してください')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'パスワードは英大文字、英小文字、数字を含む必要があります'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });
```

## スタイリング

```scss
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 14px;
  font-weight: 600;
  color: $dark-blue-600;
}

.input {
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 16px;

  &:focus {
    outline: 2px solid $primary-500;
    outline-offset: 2px;
  }

  &[aria-invalid='true'] {
    border-color: #f44336;
  }
}

.error {
  font-size: 14px;
  color: #f44336;
}

.submitButton {
  padding: 12px 24px;
  background-color: $primary-500;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid $primary-500;
    outline-offset: 2px;
  }
}
```

## 参考ドキュメント

- `.claude/documents/authentication-flow.md` - 認証フォーム仕様
- `.claude/documents/design-system.md` - デザインシステム

## 使用例

```bash
# ログインフォーム
/form loginForm

# 登録フォーム
/form registerForm

# OTP検証フォーム
/form otpVerificationForm
```
