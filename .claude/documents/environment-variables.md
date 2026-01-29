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

### データベース接続

```bash
# Database URL（PostgreSQL or Supabase）
DATABASE_URL=postgresql://user:password@localhost:5432/movie_app

# Connection Pool設定（オプション）
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

**Supabaseを使う場合:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

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

---

### メール送信

```bash
# Resendを使う場合
RESEND_API_KEY=re_xxxxxxxxxxxx
MAIL_FROM=noreply@yourdomain.com

# SendGridを使う場合
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# AWS SESを使う場合
AWS_SES_ACCESS_KEY_ID=xxxxxxxxxxxx
AWS_SES_SECRET_ACCESS_KEY=xxxxxxxxxxxx
AWS_SES_REGION=ap-northeast-1
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
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

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/movie_app

# or Supabase
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Authentication (NextAuth.js)
NEXTAUTH_SECRET=your_nextauth_secret_here_minimum_32_chars
NEXTAUTH_URL=http://localhost:3000

# Email
RESEND_API_KEY=re_xxxxxxxxxxxx
MAIL_FROM=noreply@yourdomain.com

# Rate Limiting
RATE_LIMIT_MAX_ATTEMPTS=3
RATE_LIMIT_LOCK_DURATION=1800000

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
    'RESEND_API_KEY',
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
- [ ] **TMDb API Key**: 取得済み？
- [ ] **Resend/SendGrid/AWS SES**: どれを使用するか決定？
- [ ] **OpenAI API Key**: 将来的に必要？今は不要？

### データベース
- [ ] **PostgreSQL or Supabase**: どちらを使用するか決定？
- [ ] **接続プール**: 必要なサイズは？
- [ ] **SSL接続**: 必要？不要？

### 認証
- [ ] **JWT Secret**: 生成方法は決定？
- [ ] **Cookie設定**: HttpOnly/Secure/SameSiteの設定は？
- [ ] **トークン有効期限**: デフォルト値は適切？

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
