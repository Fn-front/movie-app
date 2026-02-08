# 認証フロー設計

## 新規登録フロー

### 1. ユーザー情報入力
```
ユーザー
  ↓
[登録フォーム画面]
  - メールアドレス入力
  - パスワード入力（8文字以上、英数字含む）
  - ユーザー名入力（オプション）
  ↓
バリデーション
  - メール形式チェック
  - パスワード強度チェック
  - 重複メールアドレスチェック
```

### 2. 仮登録 & OTP送信
```
クライアント
  ↓
POST /api/auth/register
  {
    email: "user@example.com",
    password: "password123",
    name: "ユーザー名"
  }
  ↓
サーバー処理:
  1. メールアドレスで既存ユーザーを検索
     a. 認証済み（is_verified = true）→ エラー「既に登録済みのメールアドレスです」
     b. 未認証（is_verified = false）→ パスワードハッシュを上書き更新、新しいOTPを発行
     c. 存在しない → 新規作成
  2. パスワードをハッシュ化（bcrypt, cost=12）
  3. usersテーブルに仮登録（is_verified = false）
  4. 6桁のOTPコード生成
  5. otp_tokensテーブルに保存（有効期限: 10分）
  6. メール送信
  ↓
レスポンス
  {
    success: true,
    userId: "uuid",
    message: "OTPをメールに送信しました"
  }
  ↓
[OTP確認画面に遷移]
```

### 3. OTP検証
```
ユーザーがメール受信
  ↓
6桁のOTPコードを入力
  ↓
POST /api/auth/verify-otp
  {
    userId: "uuid",
    otp: "123456"
  }
  ↓
サーバー処理:
  1. otp_tokensテーブルから該当レコード検索
  2. 有効期限チェック
  3. OTPコード照合
  4. users.is_verified = true に更新
  5. otp_tokens.is_used = true に更新
  6. セッション/JWTトークン発行
  ↓
レスポンス
  {
    success: true,
    token: "jwt-or-session-id",
    user: { ... }
  }
  ↓
[ホーム画面に遷移]
```

---

## ログインフロー

### 1. ログイン情報入力
```
ユーザー
  ↓
[ログインフォーム画面]
  - メールアドレス入力
  - パスワード入力
  ↓
POST /api/auth/login
  {
    email: "user@example.com",
    password: "password123"
  }
  ↓
サーバー処理:
  1. usersテーブルから該当ユーザー検索
  2. is_verified = true チェック
  3. パスワードハッシュ照合
  4. セッション/JWTトークン発行
  ↓
レスポンス
  {
    success: true,
    token: "jwt-or-session-id",
    user: { id, email, name, avatar_url }
  }
  ↓
[ホーム画面に遷移]
```

### 2. セッション管理（NextAuth.js）
```
NextAuth.js v5を使用したセッション管理:
  - Session Cookie方式
  - サーバー側でセッション管理（データベースストレージ）
  - HttpOnly Cookieで自動送信
  - CSRF対策自動対応
  - `/api/auth/*` エンドポイントを自動生成
```

---

## ログアウトフロー

```
ユーザーがログアウトボタンをクリック
  ↓
POST /api/auth/logout
  ↓
サーバー処理:
  - JWT方式: ブラックリストに追加（オプション）
  - Session方式: セッション削除
  ↓
クライアント処理:
  - トークン削除
  - ユーザー状態クリア
  - ログイン画面に遷移
```

---

## 認証状態の保持

### ページ遷移時の認証チェック
```
ページアクセス
  ↓
Middleware/Guard
  ↓
トークン/セッション存在チェック
  ↓
  有効 → コンテンツ表示
  無効 → ログイン画面にリダイレクト
```

### APIリクエスト時の認証
```
クライアント
  ↓
API Request
  Header: Authorization: Bearer <token>
  or
  Cookie: session_id=<session>
  ↓
サーバー Middleware
  ↓
トークン/セッション検証
  ↓
  有効 → 処理続行
  無効 → 401 Unauthorized
```

---

## 未認証アカウントの自動削除

### ルール
- 登録から**1時間以内**にメール認証（OTP検証）を完了しないアカウントは物理削除
- 対象: `is_verified = false` かつ `created_at` が1時間以上前のレコード
- 関連するotp_tokensも `ON DELETE CASCADE` で自動削除

### 削除方法
```sql
DELETE FROM users
WHERE is_verified = false
  AND created_at < now() - INTERVAL '1 hour';
```

### 実行タイミング
- Vercel Cron Jobs（毎時実行）または登録API呼び出し時にクリーンアップ

### 未認証メールでの再登録
- 同じメールアドレスで未認証アカウントが存在する場合、既存レコードを上書き更新する
  - パスワードハッシュを新しい値に更新
  - 古いOTPトークンを削除し、新しいOTPを発行
  - ユーザーは再度OTP検証を行う

---

## セキュリティ対策

### パスワード
- **ハッシュ化アルゴリズム**: bcrypt（コスト10以上） or argon2
- **最小文字数**: 8文字以上
- **複雑性**: 英数字含む（記号も推奨）
- **ソルト**: 自動生成

### OTP
- **コード形式**: 6桁数字
- **有効期限**: 10分
- **再発行制限**: 5分以内は再発行不可
- **試行回数制限**: 3回失敗でアカウントロック（30分）

### セッション/トークン（NextAuth.js）
- **有効期限**: 24時間
- **セッションストレージ**: ブラウザメモリ（JWT方式）
- **Cookie設定**: 厳密（HttpOnly: true, Secure: true, SameSite: 'strict'）
  - HttpOnly: JavaScriptからアクセス不可
  - Secure: HTTPS必須（本番環境）
  - SameSite: 'strict' - CSRF対策

### その他
- **Rate Limiting**: 3回までの試行制限（ログイン・OTP検証）
- **CSRF対策**: NextAuth.jsで自動対応
- **XSS対策**: 入力サニタイズ、CSP設定

---

## 確定した技術選定

- **認証**: NextAuth.js v5 (Session-based)
- **HTTP Client**: axios
- **レート制限**: 3回までの試行制限

## 確認が必要な事項

### NextAuth.js設定
- [x] **セッションストレージ**: ブラウザメモリ（JWT方式）- 確定
- [x] **セッション有効期限**: 24時間 - 確定
- [x] **Credentials Provider**: メールアドレス + パスワード認証 - 確定
- [x] **Callbacks**: session/jwt callbacksの設定完了 - 確定
- [x] **フォームバリデーション**: react-hook-form + zod - 確定

**NextAuth.js Callbacks設計:**

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // ユーザー認証ロジック（省略）
        // 成功時に返すユーザーオブジェクト
        return {
          id: user.id,           // UUID
          email: user.email,
          name: user.name,
          isVerified: user.is_verified
        }
      }
    })
  ],

  callbacks: {
    // JWTコールバック: トークンにユーザー情報を追加
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.email = user.email
        token.name = user.name
        token.isVerified = user.isVerified
      }
      return token
    },

    // セッションコールバック: クライアントに返すセッション情報
    async session({ session, token }) {
      session.user = {
        id: token.userId,
        email: token.email,
        name: token.name,
        isVerified: token.isVerified
      }
      return session
    }
  },

  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24時間
  },

  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: true,
      },
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

**セッションオブジェクト構造:**
```typescript
// クライアント側で取得できるセッション
{
  user: {
    id: "uuid",              // ユーザーID
    email: "user@example.com",
    name: "ユーザー名",
    isVerified: true         // メール認証済みフラグ
  },
  expires: "2025-01-31T00:00:00.000Z"
}
```

### メール送信
- [x] **メール送信サービス**: Resend - 確定
- [ ] **メールテンプレート**: HTMLメールのデザインは？
- [ ] **送信元メールアドレス**: ドメイン設定は完了している？
- [ ] **メール到達率**: SPF/DKIM/DMARC設定は？

### OTP設定
- [x] **有効期限**: 10分 - 確定
- [x] **再発行間隔**: 5分 - 確定
- [x] **失敗ロック**: 3回 / 30分 - 確定
- [ ] **通知**: ロック時にメール通知する？
- [x] **コード形式**: 6桁数字 - 確定

### パスワードポリシー
- [x] **最小文字数**: 8文字以上 - 確定
- [x] **複雑性要件**: 英字（大文字・小文字）+ 数字必須 - 確定
- [x] **パスワードリセット**: 必要（パスワード忘れた機能実装）- 確定
- [x] **パスワード変更**: アカウント設定画面から可能 - 確定

### UX
- [x] **OTP入力方法**: 1つの入力欄（6桁数字、maxLength=6）- 確定
- [x] **自動遷移**: ホーム画面（OTP検証成功後）- 確定
- [x] **エラーメッセージ**: UX寄り（ユーザーフレンドリーで具体的）- 確定
- [x] **ローディング状態**: ローディングサークル表示 + 画面操作不可（全画面オーバーレイ）- 確定

**エラーメッセージポリシー:**
- ユーザーが問題を理解し、解決できる具体的なメッセージ
- セキュリティを損なわない範囲で詳細に
- 例:
  - ❌ 「エラーが発生しました」
  - ✅ 「メールアドレスの形式が正しくありません」
  - ✅ 「パスワードは8文字以上、英字（大文字・小文字）と数字を含む必要があります」
  - ✅ 「OTPコードが間違っています。残り2回入力できます」

### 将来的な拡張
- [x] **ソーシャルログイン**: 将来的に検討（Google/Twitter等）- 確定
- [ ] **二要素認証**: TOTP（Google Authenticator等）は必要？
- [x] **パスワードレス認証**: 将来的に検討（マジックリンク等）- 確定
