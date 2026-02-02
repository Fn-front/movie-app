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

- **zodスキーマ分離**: `types/schema.ts`に定義
- **エラーメッセージ**: ユーザーフレンドリーな日本語
- **アクセシビリティ**: 適切なARIA属性とラベル
- **バリデーション**: リアルタイム + 送信時

## ファイル構成

```
src/components/<formName>/
├── <formName>.tsx           # メインフォームコンポーネント
├── <formName>.module.scss   # スタイル
└── types/
    └── schema.ts            # zodスキーマ定義
```

## zodスキーマテンプレート

```typescript
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

// パスワード（プロジェクト要件: 8文字以上、英大文字・小文字・数字必須）
password: z
  .string()
  .min(8, 'パスワードは8文字以上で入力してください')
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
import { <formName>Schema, <FormName>FormData } from './types/schema';

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
    mode: 'onBlur', // リアルタイムバリデーション
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

```typescript
useForm({
  resolver: zodResolver(schema),
  mode: 'onBlur',    // フィールドを離れたときにバリデーション
  // mode: 'onChange',  // 入力中にバリデーション（UX注意）
  // mode: 'onSubmit',  // 送信時のみバリデーション
  // mode: 'onTouched', // タッチ後にバリデーション
});
```

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

## Radix UI統合

```typescript
import * as Form from '@radix-ui/react-form';

export const LoginForm = memo(() => {
  const { register, handleSubmit, formState: { errors } } = useForm();

  return (
    <Form.Root onSubmit={handleSubmit(onSubmit)}>
      <Form.Field name="email">
        <Form.Label>メールアドレス</Form.Label>
        <Form.Control asChild>
          <input type="email" {...register('email')} />
        </Form.Control>
        {errors.email && (
          <Form.Message>{errors.email.message}</Form.Message>
        )}
      </Form.Field>

      <Form.Submit asChild>
        <button type="submit">送信</button>
      </Form.Submit>
    </Form.Root>
  );
});
```

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
