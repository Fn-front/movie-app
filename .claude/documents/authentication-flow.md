# 認証フロー設計

## 認証方式一覧

| 方式 | 説明 | 用途 |
|------|------|------|
| メール+パスワード | 従来のメール/パスワード認証 | 新規登録・ログイン |
| メールOTPログイン | メールにOTPコードを送信してログイン | パスワードレスログイン |
| Google OAuth | Googleアカウントでログイン | ソーシャルログイン |
| GitHub OAuth | GitHubアカウントでログイン | ソーシャルログイン |

**共通仕様:**
- 既存のメール+パスワード登録は引き続き有効
- 同じメールアドレスのアカウントは自動リンク（統合）
- OTP: 6桁数字、有効期限10分、再送あり

---

## 新規登録フロー（メール+パスワード）

### 1. ユーザー情報入力
```
ユーザー
  ↓
[登録フォーム画面]
  - メールアドレス入力
  - パスワード入力（8文字以上、英字大文字・小文字 + 数字）
  - ユーザー名入力（オプション）
  ↓
バリデーション
  - メール形式チェック
  - パスワード強度チェック
  - 重複メールアドレスチェック
```

### 2. 登録処理 + OTP送信
```
クライアント
  ↓
POST /api/auth/register
  {
    email: "user@example.com",
    password: "Password123",
    name: "ユーザー名"
  }
  ↓
サーバー処理:
  1. メールアドレスで既存ユーザーを検索
     a. 既に存在する → エラー「既に登録済みのメールアドレスです」
     b. 存在しない → 新規作成
  2. パスワードをハッシュ化（bcrypt, cost=12）
  3. usersテーブルに登録（is_verified = false）
  4. OTPコードを生成（6桁数字）
  5. otp_codesテーブルに保存（有効期限: 10分）
  6. Resendでメール送信
  ↓
レスポンス
  {
    success: true,
    data: { userId: "uuid" },
    message: "確認コードをメールに送信しました"
  }
  ↓
[OTP検証画面に遷移]
```

### 3. OTP検証
```
ユーザー
  ↓
[OTP検証画面]
  - 6桁のコードを入力
  ↓
POST /api/auth/otp/verify
  {
    email: "user@example.com",
    code: "123456",
    action: "registration"
  }
  ↓
サーバー処理:
  1. otp_codesテーブルから該当レコード検索
  2. 有効期限チェック（10分以内か）
  3. 試行回数チェック（5回以内か）
  4. コード照合
     a. 一致 → is_verified = true に更新、OTPレコード削除
     b. 不一致 → attempts+1、エラー返却
  ↓
成功レスポンス
  {
    success: true,
    message: "メール認証が完了しました"
  }
  ↓
[ログイン画面に遷移]
```

### 4. OTP再送信
```
ユーザーが「再送信」ボタンをクリック
  ↓
POST /api/auth/otp/send
  {
    email: "user@example.com",
    action: "registration"
  }
  ↓
サーバー処理:
  1. 前回送信から1分以上経過しているかチェック
     a. 1分未満 → エラー「しばらく待ってから再送信してください」
     b. 1分以上 → 続行
  2. 既存の未使用OTPを無効化
  3. 新しいOTPコードを生成・保存
  4. Resendでメール送信
  ↓
レスポンス
  {
    success: true,
    message: "確認コードを再送信しました"
  }
```

---

## ログインフロー（メール+パスワード）

### 1. ログイン情報入力
```
ユーザー
  ↓
[ログインフォーム画面]
  - メールアドレス入力
  - パスワード入力
  ↓
POST /api/auth/login（NextAuth.js Credentials Provider）
  {
    email: "user@example.com",
    password: "Password123"
  }
  ↓
サーバー処理:
  1. usersテーブルから該当ユーザー検索
  2. is_verified チェック
     a. false → エラー「メール認証が完了していません」
     b. true → 続行
  3. パスワードハッシュ照合
  4. セッション/JWTトークン発行
  ↓
レスポンス
  {
    success: true,
    user: { id, email, name, avatar_url }
  }
  ↓
[ホーム画面に遷移]
```

---

## メールOTPログインフロー（パスワードレス）

### 1. メールアドレス入力
```
ユーザー
  ↓
[ログインフォーム画面]
  - 「メールでログイン」ボタンをクリック
  - メールアドレス入力
  ↓
POST /api/auth/otp/send
  {
    email: "user@example.com",
    action: "login"
  }
  ↓
サーバー処理:
  1. usersテーブルで該当ユーザーを検索
     a. 存在しない → エラー「登録されていないメールアドレスです」
     b. 存在する → 続行
  2. OTPコードを生成（6桁数字）
  3. otp_codesテーブルに保存（有効期限: 10分）
  4. Resendでメール送信
  ↓
レスポンス
  {
    success: true,
    message: "ログインコードをメールに送信しました"
  }
  ↓
[OTP検証画面に遷移]
```

### 2. OTP検証 → ログイン
```
ユーザー
  ↓
[OTP検証画面]
  - 6桁のコードを入力
  ↓
クライアント処理:
  1. POST /api/auth/otp/verify でOTPコードを検証
  2. 検証成功後、NextAuth.js の signIn("credentials") を呼び出し
     signIn("credentials", {
       email: "user@example.com",
       otpToken: "検証成功トークン",  // OTP検証APIが返すワンタイムトークン
       loginMethod: "otp"
     })
  3. Credentials Provider の authorize 関数内で
     loginMethod を判定し、otpToken の有効性を検証
  ↓
サーバー処理（Credentials Provider authorize）:
  1. loginMethod === "otp" の場合:
     a. otpToken の有効性を検証（DB上の検証済みフラグ確認）
     b. ユーザー情報を返却 → セッション発行
  2. loginMethod === "password"（通常ログイン）の場合:
     a. パスワードハッシュ照合
     b. ユーザー情報を返却 → セッション発行
  ↓
成功レスポンス（NextAuth.js自動処理）
  セッションCookie発行 → ホーム画面に遷移
```

**設計判断 — Credentials Provider統一の理由:**
- NextAuth.jsはCredentials Provider以外からプログラマティックにセッションを発行する手段がない
- OTPログインもCredentials Providerのauthorize関数を経由することで、JWT/セッションの発行を統一
- loginMethodパラメータで認証方式を分岐し、authorize関数内でOTPトークン検証 or パスワード照合を切り替え

---

## ソーシャルログインフロー（Google / GitHub）

### 1. OAuth認証フロー
```
ユーザー
  ↓
[ログインフォーム画面]
  - 「Googleでログイン」or「GitHubでログイン」ボタンをクリック
  ↓
NextAuth.js OAuth Provider
  1. OAuth認証画面にリダイレクト（Google / GitHub）
  2. ユーザーがアクセス許可
  3. コールバックURLにリダイレクト
  ↓
サーバー処理（NextAuth.js signIn callback）:
  1. OAuthプロバイダーからユーザー情報取得
     - email, name, avatar_url
  2. emailでusersテーブルを検索
     a. 既存ユーザーあり → accountsテーブルにプロバイダー情報を追加（リンク）
     b. 既存ユーザーなし → usersテーブルに新規作成（is_verified = true）
                         + accountsテーブルにプロバイダー情報を保存
  3. セッション/JWTトークン発行
  ↓
[ホーム画面に遷移]
```

### 2. アカウントリンク仕様
```
同じメールアドレスの場合、自動リンク:

例: user@example.com でメール+パスワード登録済み
  → Googleログイン（同じ user@example.com）
  → 既存ユーザーにGoogleアカウントをリンク
  → 以降、メール+パスワード / Google どちらでもログイン可能

リンクされたアカウント情報:
  users テーブル: 1レコード（user@example.com）
  accounts テーブル:
    - { provider: 'google', provider_account_id: 'xxx' }
    - { provider: 'github', provider_account_id: 'yyy' }（追加した場合）
```

---

## パスワード変更フロー

### 1. パスワード変更リクエスト
```
ユーザー（ログイン済み）
  ↓
[設定画面 > パスワード変更]
  - 「パスワードを変更する」ボタンをクリック
  ↓
POST /api/auth/otp/send
  {
    email: "user@example.com",
    action: "password_change"
  }
  ↓
サーバー処理:
  1. セッションからユーザー情報を取得
  2. OTPコードを生成・保存
  3. Resendでメール送信
  ↓
レスポンス
  {
    success: true,
    message: "確認コードをメールに送信しました"
  }
  ↓
[OTP検証 + 新パスワード入力画面]
```

### 2. OTP検証
```
ユーザー
  ↓
[OTP検証 + 新パスワード入力画面]
  - 6桁のコードを入力
  ↓
POST /api/auth/otp/verify
  {
    email: "user@example.com",
    code: "123456",
    action: "password_change"
  }
  ↓
サーバー処理:
  1. OTPコード検証
  2. 検証成功 → otp_codesのverified_atを設定
```

### 3. パスワード変更
```
ユーザー
  ↓
[新パスワード入力]
  - 新しいパスワードを入力
  ↓
POST /api/user/change-password
  {
    newPassword: "NewPassword456"
  }
  ↓
サーバー処理:
  1. セッションからユーザー情報を取得
  2. otp_codesで検証済みOTPが存在するか確認（verified_at IS NOT NULL、有効期限内）
  3. 新しいパスワードのバリデーション
  4. パスワードハッシュ化・更新
  5. password_changed_at を更新
  6. OTPレコード削除
  ↓
レスポンス
  {
    success: true,
    message: "パスワードを変更しました"
  }
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

## OTP仕様

| 項目 | 値 |
|------|-----|
| 桁数 | 6桁（数字のみ） |
| 有効期限 | 10分 |
| 検証試行上限 | 5回 |
| 再送間隔 | 1分 |
| メール送信 | Resend |

**OTPメールテンプレート:**
```
件名: [Movie App] 確認コード

本文:
Movie Appの確認コードです。

確認コード: 123456

このコードは10分間有効です。
心当たりがない場合は、このメールを無視してください。
```

**OTPアクション種別:**
| action | 用途 | 備考 |
|--------|------|------|
| registration | 新規登録時のメール認証 | is_verified = false → true |
| login | メールOTPログイン | セッション発行 |
| password_change | パスワード変更の本人確認 | ログイン済みユーザーのみ |

---

## セキュリティ対策

### パスワード
- **ハッシュ化アルゴリズム**: bcrypt（コスト12）
- **最小文字数**: 8文字以上
- **複雑性**: 英字（大文字・小文字）+ 数字必須
- **ソルト**: 自動生成

### OTPセキュリティ
- **ブルートフォース対策**: 5回失敗で該当OTP無効化
- **再送制限**: 1分間隔
- **有効期限**: 10分で自動失効
- **ワンタイム**: 検証成功後に即座に削除
- **暗号的に安全な乱数**: `crypto.randomInt()` で生成

### セッション/トークン（NextAuth.js）
- **有効期限**: 24時間
- **セッションストレージ**: ブラウザメモリ（JWT方式）
- **Cookie設定**: 厳密（HttpOnly: true, Secure: true, SameSite: 'strict'）
  - HttpOnly: JavaScriptからアクセス不可
  - Secure: HTTPS必須（本番環境）
  - SameSite: 'strict' - CSRF対策

### OAuth セキュリティ
- **state パラメータ**: CSRF対策（NextAuth.js自動管理）
- **PKCE**: Authorization Code Flow with PKCE（NextAuth.js自動管理）
- **スコープ最小化**: email, profile のみ取得

### その他
- **Rate Limiting**: 3回までの試行制限（ログイン）
- **CSRF対策**: NextAuth.jsで自動対応
- **XSS対策**: 入力サニタイズ、CSP設定

---

## NextAuth.js設定

### Providers設定

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"

export const authOptions = {
  providers: [
    // メール+パスワード認証 / メールOTPログイン（統一）
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        loginMethod: { label: "Login Method", type: "text" }, // "password" | "otp"
        otpToken: { label: "OTP Token", type: "text" },
      },
      async authorize(credentials) {
        const { email, password, loginMethod, otpToken } = credentials

        if (loginMethod === "otp") {
          // OTPログイン: otp_codesのverified_atを確認
          // 検証済みOTPが存在すればユーザー情報を返却
        } else {
          // パスワードログイン: パスワードハッシュ照合
          // is_verified チェック必須
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: user.is_verified
        }
      }
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // GitHub OAuth
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    // signInコールバック: アカウントリンク処理
    async signIn({ user, account }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        // 同じメールアドレスの既存ユーザーがいればリンク
        // いなければ新規ユーザー作成
      }
      return true
    },

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

### セッションオブジェクト構造
```typescript
// クライアント側で取得できるセッション
{
  user: {
    id: "uuid",
    email: "user@example.com",
    name: "ユーザー名",
    isVerified: true
  },
  expires: "2026-04-12T00:00:00.000Z"
}
```

---

## 確定事項

### NextAuth.js設定
- [x] **セッションストレージ**: ブラウザメモリ（JWT方式）
- [x] **セッション有効期限**: 24時間
- [x] **Credentials Provider**: メールアドレス + パスワード認証
- [x] **Google Provider**: Google OAuth
- [x] **GitHub Provider**: GitHub OAuth
- [x] **Callbacks**: signIn/session/jwt callbacksの設定
- [x] **フォームバリデーション**: react-hook-form + zod

### パスワードポリシー
- [x] **最小文字数**: 8文字以上
- [x] **複雑性要件**: 英字（大文字・小文字）+ 数字必須
- [x] **パスワードリセット**: OTP検証後にパスワード変更
- [x] **パスワード変更**: 設定画面からOTP検証 + 新パスワード入力

### OTP設定
- [x] **桁数**: 6桁（数字のみ）
- [x] **有効期限**: 10分
- [x] **検証試行上限**: 5回
- [x] **再送間隔**: 1分
- [x] **メール送信**: Resend

### UX
- [x] **自動遷移**: ホーム画面（ログイン成功後）
- [x] **エラーメッセージ**: ユーザーフレンドリーで具体的
- [x] **ローディング状態**: ローディングサークル表示 + 画面操作不可（全画面オーバーレイ）

**エラーメッセージポリシー:**
- ユーザーが問題を理解し、解決できる具体的なメッセージ
- セキュリティを損なわない範囲で詳細に
- 例:
  - ✅ 「メールアドレスの形式が正しくありません」
  - ✅ 「パスワードは8文字以上、英字（大文字・小文字）と数字を含む必要があります」
  - ✅ 「確認コードが間違っています。残り3回入力できます」
  - ✅ 「確認コードの有効期限が切れました。再送信してください」

### アカウントリンク
- [x] **自動リンク**: 同じメールアドレスのアカウントは自動リンク
- [x] **複数プロバイダー**: 1ユーザーに複数のログイン方法を紐付け可能

### 将来的な拡張
- [x] **ソーシャルログイン**: Google / GitHub
- [x] **パスワードレス認証**: メールOTPログイン
- [x] **二要素認証（TOTP）**: 不要（対象外）
