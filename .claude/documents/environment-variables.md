# 環境変数設定

## 環境別設定ファイル

### ローカル開発環境
`.env.local` - Gitにコミットしない

### 本番環境
Vercel Environment Variables - Web UIまたはCLIで設定

---

## 必須環境変数

### TMDb API
映画情報取得用

```bash
# TMDb API Key
NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key_here

# TMDb API Base URL
NEXT_PUBLIC_TMDB_BASE_URL=https://api.themoviedb.org/3

# TMDb Image Base URL
NEXT_PUBLIC_TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p
```

**取得方法:**
1. https://www.themoviedb.org/ でアカウント作成
2. Settings > API でAPI Keyを取得

---

### データベース接続（Supabase）

```bash
# Supabase Project URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Supabase Anonymous Key（公開可能）
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Supabase Service Role Key（秘密、サーバー側のみ）
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**取得方法:**
1. https://supabase.com/ でプロジェクト作成
2. Settings > API でURL・Keyを取得
3. ANON_KEYはクライアント公開OK、SERVICE_ROLE_KEYは秘密

---

### 認証関連（NextAuth.js）

```bash
# NextAuth.js Secret（必須）
# 生成: openssl rand -base64 32
NEXTAUTH_SECRET=your_nextauth_secret_here_minimum_32_chars

# NextAuth.js URL（本番環境で必須）
NEXTAUTH_URL=http://localhost:3000  # 本番: https://yourdomain.com

# NextAuth.js Debug Mode（開発時のみ）
NEXTAUTH_DEBUG=true  # 本番環境ではfalse
```

**Cookie設定（NextAuth.js設定ファイルで実装）:**
```typescript
// app/api/auth/[...nextauth]/route.ts
cookies: {
  sessionToken: {
    name: `__Secure-next-auth.session-token`,
    options: {
      httpOnly: true,    // JavaScriptからアクセス不可
      sameSite: 'strict', // CSRF対策
      path: '/',
      secure: true,      // HTTPS必須（本番環境）
    },
  },
}
```

---

### OAuth認証（ソーシャルログイン）

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
```

**Google OAuth取得方法:**
1. https://console.cloud.google.com/ でプロジェクト作成
2. APIとサービス > 認証情報 > OAuth 2.0 クライアントID作成
3. 承認済みリダイレクトURI: `http://localhost:3000/api/auth/callback/google`（開発）
4. 本番: `https://yourdomain.com/api/auth/callback/google`

**GitHub OAuth取得方法:**
1. https://github.com/settings/developers > New OAuth App
2. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`（開発）
3. 本番: `https://yourdomain.com/api/auth/callback/github`

---

### メール送信（Resend）

```bash
# Resend API Key
RESEND_API_KEY=re_xxxxxxxxxxxx

# 送信元メールアドレス
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**取得方法:**
1. https://resend.com/ でアカウント作成
2. API Keys で新しいキーを生成
3. ドメイン認証を完了させる（独自ドメイン使用時）

---

### Vercel Cron Jobs（バッチ更新用）

```bash
# Cron Secret（バッチ更新API認証用）
# 生成: openssl rand -base64 32
CRON_SECRET=your_cron_secret_here_minimum_32_chars
```

---

### OpenAI（将来的なレコメンド機能用）

```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_MODEL=gpt-4-turbo
```

---

## オプション環境変数

### アプリケーション設定

```bash
# アプリケーション名
NEXT_PUBLIC_APP_NAME=Movie App

# アプリケーションURL
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# 環境識別
NODE_ENV=development  # development | production | test
```

---

### ロギング・監視

```bash
# Sentry（エラートラッキング）
NEXT_PUBLIC_SENTRY_DSN=https://xxxx@xxx.ingest.sentry.io/xxxxx

# Google Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Vercel Analytics
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=xxxxxxxxxxxx
```

---

### レート制限

```bash
# レート制限設定（認証エンドポイント）
RATE_LIMIT_MAX_ATTEMPTS=3  # 3回までの試行制限
RATE_LIMIT_LOCK_DURATION=1800000  # 30分（ミリ秒）
```

---

### 開発ツール

```bash
# デバッグモード
DEBUG=true

# ログレベル
LOG_LEVEL=info  # error | warn | info | debug

# モックデータ使用
USE_MOCK_DATA=false
```

---

## `.env.local.example` テンプレート

プロジェクトルートに配置するサンプルファイル

```bash
# TMDb API
NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key_here
NEXT_PUBLIC_TMDB_BASE_URL=https://api.themoviedb.org/3
NEXT_PUBLIC_TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Authentication (NextAuth.js)
NEXTAUTH_SECRET=your_nextauth_secret_here_minimum_32_chars
NEXTAUTH_URL=http://localhost:3000

# OAuth (Social Login)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Rate Limiting
RATE_LIMIT_MAX_ATTEMPTS=3
RATE_LIMIT_LOCK_DURATION=1800000

# Vercel Cron Jobs
CRON_SECRET=your_cron_secret_here_minimum_32_chars

# OpenAI (Future)
# OPENAI_API_KEY=sk-xxxxxxxxxxxx
# OPENAI_MODEL=gpt-4-turbo

# Application
NEXT_PUBLIC_APP_NAME=Movie App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## セキュリティベストプラクティス

### 1. 環境変数の命名規則
- **クライアント公開**: `NEXT_PUBLIC_` プレフィックス必須
- **サーバーのみ**: プレフィックスなし
- **機密情報**: `NEXT_PUBLIC_` を絶対につけない

### 2. シークレット管理
- [ ] `.env.local` は `.gitignore` に追加済み
- [ ] シークレットキーは32文字以上のランダム文字列
- [ ] 本番環境と開発環境で異なる値を使用
- [ ] 定期的にローテーション

### 3. 検証
```typescript
// lib/env.ts
export function validateEnv() {
  const required = [
    'NEXT_PUBLIC_TMDB_API_KEY',
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
```

---

## 確認が必要な事項

### API Keys
- [x] **API Key管理**: 環境変数（.env）で管理 - 確定
- [ ] **TMDb API Key**: 取得済み？
- [ ] **OpenAI API Key**: 将来的に必要？今は不要？

### データベース
- [x] **PostgreSQL or Supabase**: Supabase - 確定
- [x] **接続方式**: Supabase SDK使用 - 確定
- [ ] **Row Level Security**: RLSポリシー設計は？

### 認証（NextAuth.js）
- [x] **セッション有効期限**: 24時間 - 確定
- [x] **セッションストレージ**: ブラウザメモリ（JWT方式） - 確定
- [x] **NEXTAUTH_SECRET**: openssl rand -base64 32で生成 - 確定
- [x] **Cookie設定**: 厳密（HttpOnly: true, Secure: true, SameSite: 'strict'）- 確定

### 本番環境
- [ ] **Vercel**: プロジェクト作成済み？
- [ ] **環境変数**: Vercelに設定済み？
- [ ] **ドメイン**: カスタムドメイン設定は？

### 監視・ロギング
- [ ] **Sentry**: 導入する？しない？
- [ ] **Google Analytics**: 導入する？しない？
- [ ] **ログ出力先**: ファイル？コンソール？外部サービス？

### セキュリティ
- [ ] **環境変数の暗号化**: 必要？
- [ ] **アクセス制限**: 誰が環境変数を閲覧/編集できるか？
- [ ] **監査ログ**: 環境変数の変更履歴を記録するか？
